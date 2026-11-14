# MintAnchor

Test your MUSD loan before BTC tests it for you.

Live site: https://mintanchor.onrender.com

MintAnchor is an interactive website on Mezo testnet for anyone
borrowing, or thinking about borrowing, MUSD against Bitcoin on Mezo.
It reads live positions from Mezo Borrow, lets you crash the BTC
price against them, rehearses leveraged loops before you run one,
saves risk snapshots to a small on-chain registry, and turns any
result into a shareable card for X.

Built for the Mezo Buildathon Wave 2 (Tracks 1 and 2). The product
name lives in one constant, `BRAND` in `src/config.ts`.

## What it does

1. **Position X-Ray.** Paste any Mezo address and the backend reads
   its live trove from the TroveManager contract: collateral, debt,
   collateral ratio and liquidation price, scored against the live
   PriceFeed BTC price. An address with no trove gets a plain
   "no position" answer, never an invented one.
2. **Crash slider.** Set collateral and debt (prefilled from the
   X-Ray when a trove exists) and drag a BTC price drop from 0 to
   90%. Collateral ratio, distance to the 110% liquidation line and
   the SAFE / WATCH / DANGER / LIQUIDATED band update live.
3. **Loop Simulator.** Set starting BTC, a per-loop borrow ratio and
   0 to 10 loops. Each loop borrows MUSD, swaps to BTC at the live
   price and redeposits, with the assumptions printed on the page
   (MUSD at exactly $1, no slippage, no fees, interest excluded).
   Outputs: final collateral and debt, effective leverage, effective
   ratio, liquidation price, a per-loop table, and a LOW / MODERATE /
   HIGH / EXTREME rating with a plain reason.
4. **On-chain snapshots.** `contracts/RiskRegistry.sol` is a tiny
   registry where an address saves its latest risk snapshot
   (collateral ratio, liquidation price, risk band, label) and
   anyone can read it back. The site saves through the desk demo
   wallet and labels that honestly. See status below.
5. **Shareable risk card.** One tap renders a 1200x630 PNG card of a
   stress test or loop result, branded, with the watermark
   "@heisdave01 / DEXTER WEB3".

## Setup and run

Needs Node 20 or newer. Everything runs on Mezo testnet; there is
no mainnet mode and nothing to buy.

```bash
npm install
cp .env.example .env   # or bring your own .env, see below
./run.sh               # serves http://localhost:8795
```

`.env` holds one value, `DEMO_PRIVATE_KEY`: a testnet-only wallet
used to sign snapshot saves. All reads, the crash slider, the loop
simulator and the cards work without it. Never put a wallet holding
real funds in this file.

Optional, to enable on-chain saves:

```bash
npm run compile        # builds artifacts/RiskRegistry.json with solc
npm run deploy         # deploys RiskRegistry with the demo wallet
```

The demo wallet needs a little testnet BTC for gas from
https://faucet.test.mezo.org/ first. `npm run deploy` checks the
balance, says so plainly if it is zero, and records a successful
deployment in `data/registry.json`. The registry is already
deployed (address in the contracts table below) and snapshot
saves are live; these commands are only needed to deploy a
fresh registry.

Checks:

```bash
npm run typecheck
npx tsx scripts/smoke.ts   # risk math pinned to hand-computed values
```

## What is live vs illustrated

- **Live from chain:** trove collateral, debt and status
  (TroveManager), BTC price (PriceFeed), system collateral ratio,
  block number, saved snapshots (RiskRegistry).
- **Illustrated:** the crash slider and the loop simulator. They run
  real arithmetic on the live price and Mezo's published borrow
  terms; they do not open, move or close any position, and the page
  says so. Not financial advice.

## Contracts used (Mezo testnet, chain 31611)

| Contract | Address |
| --- | --- |
| MUSD | 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503 |
| MEZO | 0x7b7c000000000000000000000000000000000001 |
| BorrowerOperations | 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5 |
| TroveManager | 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0 |
| PriceFeed | 0x86bCF0841622a5dAC14A313a15f96A95421b9366 |
| RiskRegistry (ours) | 0x378c46B4392B3Cdb194F97Ee78F9308a8E75db3F |

Borrow terms used (Mezo's published docs): 110% minimum collateral
ratio, 150% critical collateral ratio, fixed APR currently 1%
(initial rates range from 1 to 5%), minimum loan 1,800 MUSD.

## Layout

- `src/config.ts`: the BRAND constant, chain and contract config,
  borrow parameters, risk bands.
- `src/risk.ts`: the pure risk math (position metrics, crash, loops).
- `src/chain.ts`: provider, trove reads, registry reads and writes.
- `src/server.ts`: the node:http server and JSON APIs, card renderer.
- `public/index.html`: the single page app. `public/card.html`: the
  card template the renderer screenshots.
- `contracts/RiskRegistry.sol`, `scripts/compile.ts`,
  `scripts/deploy.ts`, `scripts/smoke.ts`.
