// MintAnchor configuration.
//
// BRAND is the single place the product name lives. The name was
// locked as MintAnchor on 2026-11-14; rename here and the whole site follows.
export const BRAND = "MintAnchor";

export const TAGLINE = "Stress-test your MUSD position before the market does.";

// Mezo testnet. Every address below was verified against Mezo's
// official docs and read back live from the testnet RPC during the
// Mezo Desk build. Sources are recorded in BUILD_NOTES.md.
export const CHAIN = {
  name: "Mezo Testnet",
  chainId: 31611,
  rpc: "https://rpc.test.mezo.org",
  explorer: "https://explorer.test.mezo.org",
};

export const CONTRACTS = {
  musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  mezo: "0x7b7c000000000000000000000000000000000001",
  borrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
  troveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
  priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
};

// Mezo Borrow parameters, as published in Mezo's official docs and
// FAQ: 110% minimum collateral ratio (the liquidation line), 150%
// critical collateral ratio (the system safety line), fixed interest
// currently 1% APR, minimum loan 1,800 MUSD.
export const BORROW = {
  mcr: 1.1,
  ccr: 1.5,
  interestAprPct: 1,
  minLoanMusd: 1800,
};

// Risk bands for a single position, by collateral ratio.
// Below the 110% MCR line a trove can be liquidated. The 150% CCR
// line is the system's own safety mark, so at or above it a position
// is SAFE. Between the two lines the rating steps down.
export const BANDS = ["SAFE", "WATCH", "DANGER", "LIQUIDATED"] as const;
export type RiskBand = (typeof BANDS)[number];

export function bandForRatio(cr: number): RiskBand {
  if (!Number.isFinite(cr)) return "SAFE"; // no debt at all
  if (cr >= BORROW.ccr) return "SAFE";
  if (cr >= 1.3) return "WATCH";
  if (cr >= BORROW.mcr) return "DANGER";
  return "LIQUIDATED";
}

export function bandIndex(band: RiskBand): number {
  return BANDS.indexOf(band);
}
