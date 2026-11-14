/**
 * Film the MintAnchor pitch video: real browser, real site, real
 * Mezo testnet reads, one real on-chain snapshot save.
 *
 * One recording per scene, each timed against the rendered
 * narration line (video/vo/lineN.mp3, Inspiring Gong at speed 84).
 * Writes segments/raw/sceneN.webm and video/work/timeline.json
 * with the per-scene durations the assembly step must hit.
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const HERE = new URL(".", import.meta.url).pathname;
const RAW = join(HERE, "segments", "raw");
const WORK = join(HERE, "work");
mkdirSync(RAW, { recursive: true });
mkdirSync(WORK, { recursive: true });

const SITE = "http://localhost:8795";
const TROVE = "0x52d033E64774F31A8B7562806aA5782CbbD29382";
const SAVE_LABEL = "Pitch check: 2 BTC loan";

// Scene target durations: narration line duration plus a tail.
const TARGETS = [11.0, 17.6, 19.0, 19.5, 19.9, 14.0, 16.4];

function findChromium(): string {
  const cache = join(homedir(), ".cache", "ms-playwright");
  for (const dir of readdirSync(cache)) {
    if (!dir.startsWith("chromium-")) continue;
    const candidate = join(cache, dir, "chrome-linux64", "chrome");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("No local Chromium found.");
}

const meta: Record<string, unknown> = {};
const timeline: { scene: number; file: string; duration: number }[] = [];

async function waitStatus(page: Page) {
  await page.waitForFunction(
    "document.querySelector('#stPrice').textContent.includes('$')",
    { timeout: 30000 },
  );
}

async function recordScene(
  browser: Browser,
  n: number,
  actions: (page: Page) => Promise<void>,
) {
  const target = TARGETS[n - 1];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: RAW, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  await actions(page);
  const elapsed = (Date.now() - t0) / 1000;
  const remain = target - elapsed;
  if (remain > 0) await page.waitForTimeout(remain * 1000);
  const total = Math.max(target, (Date.now() - t0) / 1000);
  const video = page.video();
  await context.close();
  const src = await video!.path();
  const dest = join(RAW, `scene${n}.webm`);
  renameSync(src, dest);
  timeline.push({ scene: n, file: dest, duration: Math.round(total * 10) / 10 });
  console.log(`scene ${n}: ${(Math.round(total * 10) / 10).toFixed(1)}s -> ${dest}`);
}

async function dragSlider(page: Page, stops: { v: number; holdMs: number }[]) {
  const box = await page.locator("#stDrop").boundingBox();
  if (!box) throw new Error("slider not found");
  const y = box.y + box.height / 2;
  const xFor = (v: number) => box.x + (box.width * v) / 90;
  await page.mouse.move(xFor(0), y);
  await page.mouse.down();
  let prev = 0;
  for (const stop of stops) {
    const steps = Math.max(8, Math.round(Math.abs(stop.v - prev) * 1.2));
    await page.mouse.move(xFor(stop.v), y, { steps });
    if (stop.holdMs > 0) await page.waitForTimeout(stop.holdMs);
    prev = stop.v;
  }
  await page.mouse.up();
}

async function main() {
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ["--no-sandbox"],
  });

  // Scene 1: opening, hero with the live status strip.
  await recordScene(browser, 1, async (page) => {
    await page.goto(SITE);
    await waitStatus(page);
  });

  // Scene 2: Position X-Ray on a real trove.
  await recordScene(browser, 2, async (page) => {
    await page.goto(SITE);
    await waitStatus(page);
    await page.evaluate("document.querySelector('#xray').scrollIntoView()");
    await page.waitForTimeout(500);
    await page.type("#xrAddress", TROVE, { delay: 25 });
    await page.waitForTimeout(400);
    await page.click("#xrBtn");
    await page.waitForFunction(
      "!!document.querySelector('#xrOut .outputs')",
      { timeout: 45000 },
    );
    meta.xrayText = await page.evaluate(
      "document.querySelector('#xrOut').innerText",
    );
    await page.waitForTimeout(1500);
    await page.evaluate(
      "document.querySelector('#xrOut').scrollIntoView({block: 'center'})",
    );
  });

  // Scene 3: crash slider on a build-your-own position.
  await recordScene(browser, 3, async (page) => {
    await page.goto(SITE);
    await waitStatus(page);
    await page.evaluate("document.querySelector('#stress').scrollIntoView()");
    await page.waitForTimeout(400);
    await page.fill("#stColl", "2");
    await page.fill("#stDebt", "50000");
    await page.waitForTimeout(800);
    await dragSlider(page, [
      { v: 30, holdMs: 2400 },
      { v: 45, holdMs: 2400 },
      { v: 52, holdMs: 2600 },
    ]);
    meta.stressText = await page.evaluate(
      "document.querySelector('#stOutputs').innerText + ' | ' + document.querySelector('#stBand').innerText",
    );
  });

  // Scene 4: loop simulator, 1 BTC, 50% per loop, 4 loops.
  await recordScene(browser, 4, async (page) => {
    await page.goto(SITE);
    await waitStatus(page);
    await page.evaluate("document.querySelector('#loop').scrollIntoView()");
    await page.waitForTimeout(400);
    await page.fill("#lpStart", "1");
    await page.fill("#lpRatio", "50");
    await page.fill("#lpCount", "4");
    await page.waitForTimeout(1200);
    meta.loopText = await page.evaluate(
      "document.querySelector('#lpOutputs').innerText + ' | ' + document.querySelector('#lpRating').innerText",
    );
    await page.waitForTimeout(3500);
    await page.evaluate(
      "document.querySelector('#lpTable').scrollIntoView({block: 'center'})",
    );
  });

  // Scene 5: save the snapshot on chain (the 2 BTC stress position).
  await recordScene(browser, 5, async (page) => {
    await page.goto(SITE);
    await waitStatus(page);
    await page.fill("#stColl", "2");
    await page.fill("#stDebt", "50000");
    await page.evaluate("document.querySelector('#save').scrollIntoView()");
    await page.waitForTimeout(400);
    await page.fill("#svLabel", SAVE_LABEL);
    await page.waitForTimeout(500);
    await page.click("#svBtn");
    await page.waitForFunction(
      "document.querySelector('#svOut').textContent.includes('Saved on chain')",
      { timeout: 90000 },
    );
    meta.saveText = await page.evaluate(
      "document.querySelector('#svOut').innerText",
    );
    meta.saveTxUrl = await page.evaluate(
      "document.querySelector('#svOut a') ? document.querySelector('#svOut a').href : null",
    );
    await page.evaluate(
      "document.querySelector('#svOut').scrollIntoView({block: 'center'})",
    );
    await page.waitForTimeout(1200);
  });

  // Scene 6: shareable risk card from the crashed position.
  await recordScene(browser, 6, async (page) => {
    await page.goto(SITE);
    await waitStatus(page);
    await page.fill("#stColl", "2");
    await page.fill("#stDebt", "50000");
    await page.evaluate("document.querySelector('#stress').scrollIntoView()");
    await page.waitForTimeout(400);
    await dragSlider(page, [{ v: 52, holdMs: 600 }]);
    await page.click("#stCardBtn");
    await page.waitForFunction(
      "(() => { const i = document.querySelector('#stCardImg'); return i && i.style.display !== 'none' && i.naturalWidth > 0; })()",
      { timeout: 30000 },
    );
    await page.evaluate(
      "document.querySelector('#stCardImg').scrollIntoView({block: 'center'})",
    );
    await page.waitForTimeout(1000);
  });

  // Scene 7: end card.
  await recordScene(browser, 7, async (page) => {
    await page.goto(pathToFileURL(join(HERE, "endcard.html")).href);
    await page.waitForTimeout(600);
  });

  await browser.close();
  writeFileSync(join(WORK, "timeline.json"), JSON.stringify(timeline, null, 2));
  writeFileSync(join(WORK, "film-meta.json"), JSON.stringify(meta, null, 2));
  const total = timeline.reduce((a, s) => a + s.duration, 0);
  console.log("total:", total.toFixed(1) + "s");
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
