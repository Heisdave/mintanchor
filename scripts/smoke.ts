// Smoke checks for the risk math, pinned to hand-computed values.
// The arithmetic behind every expectation is written out in
// BUILD_NOTES.md. Run: npx tsx scripts/smoke.ts
import { positionMetrics, crashedPosition, simulateLoops } from "../src/risk.js";

let failures = 0;
function close(name: string, got: number, want: number, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${got}, want ${want}`);
}
function eq(name: string, got: string, want: string) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${got}, want ${want}`);
}

// Crash example: 2 BTC collateral, 50,000 MUSD debt, BTC at $60,000.
// Value 120,000. CR = 120000 / 50000 = 2.40 = 240%.
// Liq price = 1.1 * 50000 / 2 = 27,500.
// Max drop = 1 - 27500 / 60000 = 54.1667%.
const base = positionMetrics(2, 50000, 60000);
close("base CR pct", base.collateralRatioPct, 240);
close("base liq price", base.liquidationPriceUsd, 27500);
close("base max drop pct", base.maxDropPct, 54.1667, 0.001);
eq("base band", base.band, "SAFE");

// Drop 30%: price 42,000, value 84,000, CR = 84000 / 50000 = 168%.
const d30 = crashedPosition(2, 50000, 60000, 0.3);
close("drop30 CR pct", d30.collateralRatioPct, 168);
eq("drop30 band", d30.band, "SAFE");

// Drop 55%: price 27,000, value 54,000, CR = 54000 / 50000 = 108%.
const d55 = crashedPosition(2, 50000, 60000, 0.55);
close("drop55 CR pct", d55.collateralRatioPct, 108);
eq("drop55 band", d55.band, "LIQUIDATED");

// Loop example: start 1 BTC, ratio 0.5, 2 loops, BTC at $60,000.
// Loop 1: borrow 0.5 * 1 * 60000 = 30,000, buy 0.5 BTC. C 1.5, D 30,000.
// Loop 2: borrow 0.5 * 1.5 * 60000 = 45,000, buy 0.75 BTC. C 2.25, D 75,000.
// Leverage 2.25x. CR = 2.25 * 60000 / 75000 = 180%.
// Liq price = 1.1 * 75000 / 2.25 = 36,666.67. Rating MODERATE.
const loop = simulateLoops(1, 0.5, 2, 60000);
close("loop final collateral", loop.finalCollateralBtc, 2.25);
close("loop final debt", loop.finalDebtMusd, 75000);
close("loop leverage", loop.effectiveLeverage, 2.25);
close("loop CR pct", loop.effectiveRatioPct, 180);
close("loop liq price", loop.liquidationPriceUsd, 36666.67, 0.01);
eq("loop rating", loop.rating, "MODERATE");
close("loop step1 borrowed", loop.steps[0].borrowedMusd, 30000);
close("loop step2 borrowed", loop.steps[1].borrowedMusd, 45000);

console.log(failures === 0 ? "ALL MATH CHECKS PASSED" : `${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
