// Mezo testnet chain access for the Risk Lab. Addresses were verified
// against Mezo's official docs (see BUILD_NOTES.md). All reads are
// live; the only write path is saving a snapshot to our own
// RiskRegistry contract, signed by the demo wallet.
import { ethers } from "ethers";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAIN, CONTRACTS } from "./config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.chainId, {
  staticNetwork: true,
});

const priceFeed = new ethers.Contract(
  CONTRACTS.priceFeed,
  ["function fetchPrice() view returns (uint256)"],
  provider,
);

// Liquity-style TroveManager getters, as exposed by Mezo Borrow.
const troveManager = new ethers.Contract(
  CONTRACTS.troveManager,
  [
    "function getTroveStatus(address) view returns (uint256)",
    "function getTroveColl(address) view returns (uint256)",
    "function getTroveDebt(address) view returns (uint256)",
    "function getTCR(uint256) view returns (uint256)",
  ],
  provider,
);

function loadDemoKey(): string | null {
  const fromEnv = process.env.DEMO_PRIVATE_KEY;
  if (fromEnv && /^0x[0-9a-fA-F]{64}$/.test(fromEnv.trim())) return fromEnv.trim();
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return null;
  const m = readFileSync(envPath, "utf8").match(/DEMO_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/);
  return m ? m[1] : null;
}

const demoKey = loadDemoKey();
export const demoWallet = demoKey ? new ethers.Wallet(demoKey, provider) : null;
export const demoAddress = demoWallet ? demoWallet.address : null;

export async function getBtcPrice(): Promise<number> {
  const price = (await priceFeed.fetchPrice()) as bigint;
  return Number(ethers.formatUnits(price, 18));
}

export async function getSystemRatio(priceUsd: number): Promise<number> {
  const tcr = (await troveManager.getTCR(ethers.parseUnits(String(priceUsd), 18))) as bigint;
  return Number(ethers.formatUnits(tcr, 18)) * 100;
}

export async function getBlockNumber(): Promise<number> {
  return provider.getBlockNumber();
}

export async function getDemoBtcBalance(): Promise<number> {
  if (!demoAddress) return 0;
  return Number(ethers.formatEther(await provider.getBalance(demoAddress)));
}

export interface TroveRead {
  address: string;
  hasTrove: boolean;
  status: number; // 0 nonexistent, 1 active, 2+ closed
  statusText: string;
  collateralBtc: number;
  debtMusd: number;
}

const STATUS_TEXT: Record<number, string> = {
  0: "nonexistent",
  1: "active",
  2: "closed by owner",
  3: "closed by liquidation",
  4: "closed by redemption",
};

export async function readTrove(address: string): Promise<TroveRead> {
  const [statusRaw, collRaw, debtRaw] = await Promise.all([
    troveManager.getTroveStatus(address) as Promise<bigint>,
    troveManager.getTroveColl(address) as Promise<bigint>,
    troveManager.getTroveDebt(address) as Promise<bigint>,
  ]);
  const status = Number(statusRaw);
  const collateralBtc = Number(ethers.formatUnits(collRaw, 18));
  const debtMusd = Number(ethers.formatUnits(debtRaw, 18));
  const hasTrove = status === 1 && (collateralBtc > 0 || debtMusd > 0);
  return {
    address,
    hasTrove,
    status,
    statusText: STATUS_TEXT[status] ?? `status ${status}`,
    collateralBtc,
    debtMusd,
  };
}

// ------------------------------------------------------------------
// RiskRegistry wiring. The deployment, once it exists, is recorded in
// data/registry.json by scripts/deploy.ts. Until then the registry is
// honestly absent and the site shows saves as paused.
export interface RegistryDeployment {
  address: string;
  txHash: string;
  chainId: number;
  deployedAt: string;
}

export function loadRegistryDeployment(): RegistryDeployment | null {
  const path = join(root, "data", "registry.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as RegistryDeployment;
    if (!ethers.isAddress(parsed.address)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const REGISTRY_ABI = [
  "function saveSnapshot(uint256 collateralRatioBps, uint256 liquidationPriceUsd, uint8 riskBand, string label) external",
  "function getSnapshot(address user) view returns (uint256 collateralRatioBps, uint256 liquidationPriceUsd, uint8 riskBand, string label, uint256 updatedAt, uint256 count)",
  "function snapshotCount(address user) view returns (uint256)",
];

export function registryContract(signer?: ethers.Wallet): ethers.Contract | null {
  const deployment = loadRegistryDeployment();
  if (!deployment) return null;
  return new ethers.Contract(
    deployment.address,
    REGISTRY_ABI,
    signer ?? provider,
  );
}

export interface StoredSnapshot {
  address: string;
  found: boolean;
  collateralRatioBps: number;
  collateralRatioPct: number;
  liquidationPriceUsd: number;
  riskBand: number;
  label: string;
  updatedAt: number;
  count: number;
}

export async function readSnapshot(address: string): Promise<StoredSnapshot | null> {
  const contract = registryContract();
  if (!contract) return null;
  const r = (await contract.getSnapshot(address)) as [
    bigint,
    bigint,
    bigint,
    string,
    bigint,
    bigint,
  ];
  const count = Number(r[5]);
  return {
    address,
    found: count > 0,
    collateralRatioBps: Number(r[0]),
    collateralRatioPct: Number(r[0]) / 100,
    liquidationPriceUsd: Number(ethers.formatUnits(r[1], 18)),
    riskBand: Number(r[2]),
    label: r[3],
    updatedAt: Number(r[4]),
    count,
  };
}

export function explorerTx(hash: string): string {
  return `${CHAIN.explorer}/tx/${hash}`;
}

export function explorerAddress(addr: string): string {
  return `${CHAIN.explorer}/address/${addr}`;
}
