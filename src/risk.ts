// Pure risk math for Mezo Borrow positions and loops. No chain
// access in here: the server, the smoke tests and the hand checks in
// BUILD_NOTES.md all run the same formulas.
//
// Definitions (Mezo Borrow is Liquity-style):
//   collateral value  V = C * P        (C in BTC, P in USD)
//   collateral ratio  CR = V / D       (D in MUSD, treated at $1)
//   liquidation price P_liq = MCR * D / C
//     the BTC price where CR falls to the 110% minimum ratio.
import { BORROW, bandForRatio, type RiskBand } from "./config.js";

export interface PositionMetrics {
  collateralBtc: number;
  debtMusd: number;
  priceUsd: number;
  collateralValueUsd: number;
  collateralRatio: number; // Infinity when there is no debt
  collateralRatioPct: number;
  liquidationPriceUsd: number; // 0 when there is no debt
  maxDropPct: number; // how far BTC can still fall before the 110% line
  band: RiskBand;
}

export function positionMetrics(
  collateralBtc: number,
  debtMusd: number,
  priceUsd: number,
): PositionMetrics {
  const value = collateralBtc * priceUsd;
  if (debtMusd <= 0) {
    return {
      collateralBtc,
      debtMusd,
      priceUsd,
      collateralValueUsd: value,
      collateralRatio: Number.POSITIVE_INFINITY,
      collateralRatioPct: Number.POSITIVE_INFINITY,
      liquidationPriceUsd: 0,
      maxDropPct: 100,
      band: "SAFE",
    };
  }
  const cr = value / debtMusd;
  const liqPrice = (BORROW.mcr * debtMusd) / collateralBtc;
  const maxDropPct = Math.max(0, (1 - liqPrice / priceUsd) * 100);
  return {
    collateralBtc,
    debtMusd,
    priceUsd,
    collateralValueUsd: value,
    collateralRatio: cr,
    collateralRatioPct: cr * 100,
    liquidationPriceUsd: liqPrice,
    maxDropPct,
    band: bandForRatio(cr),
  };
}

// Apply a BTC price drop (0 to 0.90) to a position and re-score it.
export function crashedPosition(
  collateralBtc: number,
  debtMusd: number,
  priceUsd: number,
  dropFraction: number,
): PositionMetrics {
  return positionMetrics(collateralBtc, debtMusd, priceUsd * (1 - dropFraction));
}

// ------------------------------------------------------------------
// Loop simulator.
//
// Model, stated on the page as an honest label: the position starts
// with C0 BTC and no debt. Each loop borrows MUSD equal to the
// per-loop ratio r times the current collateral value, swaps the
// MUSD to BTC at the live price treating MUSD at exactly $1, with no
// slippage and no fees, and redeposits the BTC as collateral.
//   borrow_i = r * C_i * P
//   C_{i+1}  = C_i * (1 + r)
//   D_{i+1}  = D_i + borrow_i
// Closed form after n loops:
//   C_n = C0 * (1 + r)^n
//   D_n = P * C0 * ((1 + r)^n - 1)
//   effective CR = (1 + r)^n / ((1 + r)^n - 1)
// Interest is excluded and the page says so; at Mezo's current 1%
// APR it is small next to price risk inside a stress horizon.
export interface LoopStep {
  loop: number;
  borrowedMusd: number;
  btcBought: number;
  totalCollateralBtc: number;
  totalDebtMusd: number;
  collateralRatioPct: number;
}

export type LoopRating = "LOW" | "MODERATE" | "HIGH" | "EXTREME";

export interface LoopResult {
  steps: LoopStep[];
  finalCollateralBtc: number;
  finalDebtMusd: number;
  effectiveLeverage: number;
  effectiveRatioPct: number;
  liquidationPriceUsd: number;
  maxDropPct: number;
  rating: LoopRating;
  ratingReason: string;
}

export function ratingForRatio(crPct: number): { rating: LoopRating; reason: string } {
  if (crPct >= 200) {
    return {
      rating: "LOW",
      reason: `At ${crPct.toFixed(0)}% the position sits far above both the 110% liquidation line and the 150% system safety line. BTC would need a deep crash before this loop is in trouble.`,
    };
  }
  if (crPct >= 150) {
    return {
      rating: "MODERATE",
      reason: `At ${crPct.toFixed(0)}% the position clears the 150% system safety line, but a solid BTC drop eats the cushion. Keep watch on the price.`,
    };
  }
  if (crPct >= 120) {
    return {
      rating: "HIGH",
      reason: `At ${crPct.toFixed(0)}% the position is under the 150% system safety line and closing on the 110% liquidation line. A sharp drop can liquidate it.`,
    };
  }
  return {
    rating: "EXTREME",
    reason: `At ${crPct.toFixed(0)}% the position is at or under the 110% liquidation line's neighbourhood. Even a small BTC dip can trigger liquidation.`,
  };
}

export function simulateLoops(
  startCollateralBtc: number,
  borrowRatio: number,
  loops: number,
  priceUsd: number,
): LoopResult {
  const steps: LoopStep[] = [];
  let collateral = startCollateralBtc;
  let debt = 0;
  for (let i = 1; i <= loops; i++) {
    const borrowed = borrowRatio * collateral * priceUsd;
    const btcBought = borrowed / priceUsd;
    collateral += btcBought;
    debt += borrowed;
    steps.push({
      loop: i,
      borrowedMusd: borrowed,
      btcBought,
      totalCollateralBtc: collateral,
      totalDebtMusd: debt,
      collateralRatioPct: debt > 0 ? ((collateral * priceUsd) / debt) * 100 : Number.POSITIVE_INFINITY,
    });
  }
  const metrics = positionMetrics(collateral, debt, priceUsd);
  const { rating, reason } = ratingForRatio(metrics.collateralRatioPct);
  return {
    steps,
    finalCollateralBtc: collateral,
    finalDebtMusd: debt,
    effectiveLeverage: startCollateralBtc > 0 ? collateral / startCollateralBtc : 0,
    effectiveRatioPct: metrics.collateralRatioPct,
    liquidationPriceUsd: metrics.liquidationPriceUsd,
    maxDropPct: metrics.maxDropPct,
    rating,
    ratingReason: reason,
  };
}
