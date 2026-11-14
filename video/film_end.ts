import { chromium } from "playwright-core";
import { existsSync, readdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const HERE = new URL(".", import.meta.url).pathname;
const cache = join(homedir(), ".cache", "ms-playwright");
let exe = "";
for (const dir of readdirSync(cache)) {
  if (!dir.startsWith("chromium-")) continue;
  const c = join(cache, dir, "chrome-linux64", "chrome");
  if (existsSync(c)) { exe = c; break; }
}
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: join(HERE, "segments", "raw"), size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const t0 = Date.now();
await page.goto(pathToFileURL(join(HERE, "endcard.html")).href);
await page.waitForTimeout(600);
const remain = 16.4 - (Date.now() - t0) / 1000;
if (remain > 0) await page.waitForTimeout(remain * 1000);
const video = page.video();
await context.close();
renameSync(await video!.path(), join(HERE, "segments", "raw", "scene7.webm"));
await browser.close();
console.log("scene 7 refilmed");
