// Mezo Risk Lab server. Plain node:http in the DexScout pattern.
// Reads are live from Mezo testnet. The one write path saves a risk
// snapshot to our own RiskRegistry contract, signed by the demo
// wallet, and only when that contract is actually deployed and the
// wallet actually funded: otherwise the API says paused, plainly.
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { chromium, type Browser } from "playwright-core";
import { BRAND, CHAIN, CONTRACTS, BORROW, BANDS, bandIndex, type RiskBand } from "./config.js";
import {
  demoAddress,
  demoWallet,
  getBlockNumber,
  getBtcPrice,
  getSystemRatio,
  getDemoBtcBalance,
  readTrove,
  loadRegistryDeployment,
  registryContract,
  readSnapshot,
  explorerTx,
  explorerAddress,
} from "./chain.js";
import { positionMetrics } from "./risk.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 8795);

function json(res: import("node:http").ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function publicFile(name: string): string {
  return readFileSync(join(root, "public", name), "utf8");
}

// ------------------------------------------------------------------
// Shareable card rendering: screenshot a purpose-built card page at
// exactly 1200x630 with the locally cached Chromium.
let browserPromise: Promise<Browser> | null = null;

function findChromium(): string | null {
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return null;
  for (const dir of readdirSync(cache)) {
    if (!dir.startsWith("chromium-")) continue;
    const candidate = join(cache, dir, "chrome-linux64", "chrome");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = findChromium();
    if (!executablePath) throw new Error("No local Chromium found for card rendering.");
    browserPromise = chromium.launch({ executablePath, args: ["--no-sandbox"] });
  }
  return browserPromise;
}

export interface CardData {
  kind: string;
  headline: string;
  band: string;
  rows: { k: string; v: string }[];
}

async function renderCardPng(card: CardData): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  try {
    const params = new URLSearchParams({
      kind: card.kind,
      headline: card.headline,
      band: card.band,
      rows: JSON.stringify(card.rows),
    });
    await page.goto(`http://127.0.0.1:${PORT}/card.html?${params.toString()}`, {
      waitUntil: "load",
    });
    await page.waitForTimeout(150);
    return (await page.screenshot({ type: "png" })) as Buffer;
  } finally {
    await page.close();
  }
}

// ------------------------------------------------------------------
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(publicFile("index.html"));
      return;
    }
    if (req.method === "GET" && url.pathname === "/card.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(publicFile("card.html"));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      const price = await getBtcPrice();
      const deployment = loadRegistryDeployment();
      const demoBtc = await getDemoBtcBalance();
      json(res, 200, {
        brand: BRAND,
        chain: CHAIN,
        blockNumber: await getBlockNumber(),
        btcPriceUsd: price,
        systemRatioPct: await getSystemRatio(price),
        params: BORROW,
        contracts: CONTRACTS,
        demoAddress,
        demoBtc,
        registry: deployment
          ? {
              deployed: true,
              address: deployment.address,
              txHash: deployment.txHash,
              explorer: explorerAddress(deployment.address),
            }
          : { deployed: false },
        saveReady: Boolean(deployment) && demoBtc > 0,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/price") {
      const price = await getBtcPrice();
      json(res, 200, { btcPriceUsd: price, systemRatioPct: await getSystemRatio(price) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/xray") {
      const address = url.searchParams.get("address") ?? "";
      if (!ethers.isAddress(address)) {
        json(res, 400, { error: "That does not look like a valid Mezo address. Check it and try again." });
        return;
      }
      const who = ethers.getAddress(address);
      const price = await getBtcPrice();
      const trove = await readTrove(who);
      if (!trove.hasTrove) {
        json(res, 200, {
          address: who,
          hasTrove: false,
          troveStatus: trove.statusText,
          collateralBtc: trove.collateralBtc,
          debtMusd: trove.debtMusd,
          btcPriceUsd: price,
          message:
            trove.status === 0
              ? "This address has no MUSD loan position on Mezo testnet. Nothing was found, so nothing is shown. Use the manual stress test below with your own numbers."
              : `This address has no active MUSD loan position (trove ${trove.statusText}). Use the manual stress test below with your own numbers.`,
        });
        return;
      }
      const m = positionMetrics(trove.collateralBtc, trove.debtMusd, price);
      json(res, 200, {
        address: who,
        hasTrove: true,
        troveStatus: trove.statusText,
        collateralBtc: trove.collateralBtc,
        debtMusd: trove.debtMusd,
        btcPriceUsd: price,
        collateralValueUsd: m.collateralValueUsd,
        collateralRatioPct: m.collateralRatioPct,
        liquidationPriceUsd: m.liquidationPriceUsd,
        maxDropPct: m.maxDropPct,
        band: m.band,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/snapshot") {
      const address = url.searchParams.get("address") ?? "";
      if (!ethers.isAddress(address)) {
        json(res, 400, { error: "That does not look like a valid Mezo address. Check it and try again." });
        return;
      }
      const deployment = loadRegistryDeployment();
      if (!deployment) {
        json(res, 200, { deployed: false, message: "The RiskRegistry contract is not deployed yet, so there are no saved snapshots to read." });
        return;
      }
      const snap = await readSnapshot(ethers.getAddress(address));
      json(res, 200, {
        deployed: true,
        registry: deployment.address,
        snapshot: snap,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/save") {
      const body = await readBody(req);
      const crBps = Number(body.collateralRatioBps);
      const liqUsd = Number(body.liquidationPriceUsd);
      const bandName = String(body.riskBand ?? "");
      const label = String(body.label ?? "").slice(0, 80);
      if (!Number.isFinite(crBps) || crBps < 0 || crBps > 10_000_000) {
        json(res, 400, { error: "Collateral ratio looks wrong. Recompute the stress test and try again." });
        return;
      }
      if (!Number.isFinite(liqUsd) || liqUsd < 0) {
        json(res, 400, { error: "Liquidation price looks wrong. Recompute the stress test and try again." });
        return;
      }
      if (!BANDS.includes(bandName as RiskBand)) {
        json(res, 400, { error: "Risk band looks wrong. Recompute the stress test and try again." });
        return;
      }
      const deployment = loadRegistryDeployment();
      if (!deployment) {
        json(res, 200, {
          paused: true,
          message:
            "On-chain saving is paused. The RiskRegistry contract is written and compiled, but it is not deployed yet: the desk demo wallet needs testnet BTC for gas from the Mezo faucet first. Your stress test above is unaffected.",
        });
        return;
      }
      if (!demoWallet) {
        json(res, 200, { paused: true, message: "On-chain saving is paused. The demo wallet is not configured on this server." });
        return;
      }
      const demoBtc = await getDemoBtcBalance();
      if (demoBtc <= 0) {
        json(res, 200, {
          paused: true,
          message:
            "On-chain saving is paused. The desk demo wallet holds no testnet BTC for gas yet. One faucet visit unblocks it. Your stress test above is unaffected.",
        });
        return;
      }
      const contract = registryContract(demoWallet);
      if (!contract) {
        json(res, 200, { paused: true, message: "On-chain saving is paused. The registry could not be loaded." });
        return;
      }
      const tx = await contract.saveSnapshot(
        BigInt(Math.round(crBps)),
        ethers.parseUnits(liqUsd.toFixed(18), 18),
        bandIndex(bandName as RiskBand),
        label || BRAND,
      );
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        json(res, 502, { error: "The save transaction did not confirm cleanly. Check the explorer before trying again.", txHash: tx.hash, explorer: explorerTx(tx.hash) });
        return;
      }
      const snap = demoAddress ? await readSnapshot(demoAddress) : null;
      json(res, 200, {
        paused: false,
        txHash: tx.hash,
        explorer: explorerTx(tx.hash),
        savedFor: demoAddress,
        count: snap ? snap.count : null,
        note: "Saved by the desk demo wallet on Mezo testnet, as labelled. Snapshots are a public notebook entry, not a financial record.",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/card") {
      const body = (await readBody(req)) as unknown as CardData;
      if (!body || typeof body.headline !== "string" || !Array.isArray(body.rows)) {
        json(res, 400, { error: "Card data looks incomplete. Run a stress test or a loop first." });
        return;
      }
      const rows = body.rows.slice(0, 6).map((r) => ({
        k: String(r.k ?? "").slice(0, 40),
        v: String(r.v ?? "").slice(0, 40),
      }));
      const png = await renderCardPng({
        kind: String(body.kind ?? "result").slice(0, 24),
        headline: String(body.headline).slice(0, 80),
        band: String(body.band ?? "").slice(0, 16),
        rows,
      });
      res.writeHead(200, { "content-type": "image/png", "content-length": png.length });
      res.end(png);
      return;
    }

    json(res, 404, { error: "Not found." });
  } catch (e) {
    json(res, 502, {
      error: "Something failed against the testnet or the renderer. Try again in a moment.",
      detail: (e as Error).message.slice(0, 200),
    });
  }
});

server.listen(PORT, () => {
  console.log(`${BRAND} running at http://localhost:${PORT}`);
  console.log(`Chain: ${CHAIN.name} (${CHAIN.chainId}) via ${CHAIN.rpc}`);
  const deployment = loadRegistryDeployment();
  console.log(
    deployment
      ? `RiskRegistry: ${deployment.address}`
      : "RiskRegistry: not deployed yet (saves paused, honestly labelled)",
  );
  console.log(`Demo wallet: ${demoAddress ?? "not configured"}`);
});
