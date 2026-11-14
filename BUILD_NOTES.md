# Mezo Risk Lab: build notes

Built Sat 2026-11-14 for the Mezo Buildathon Wave 2 (deadline Sun
2026-11-15), Tracks 1 and 2. Node.js and TypeScript, ethers v6,
plain node:http server in the DexScout pattern. Zero capital,
testnet only, nothing public, no git commits. The demo wallet was
reused from the Mezo Desk build (address
0xD3277d666D9B3d078F5917761f44af8B760Ad8F6); its key was copied with
the project .env file and is never printed in any log, note or
report.

## Sponsor brand colours, sampled and verified

Dexter's instruction: this project follows the sponsor's brand, not
his own palette. Sampled from https://mezo.org on 2026-11-14, from
the homepage HTML and its stylesheet (/_assets/index-uzGcS1mH.css):

- Primary brand red: #FF004D. Found in the stylesheet (twice) and
  throughout the homepage as the stroke colour of the brand check
  icons. Used here for buttons, accents, the slider and the DANGER
  band.
- Deep magenta: #990070. Found in the homepage's signature gradient,
  linear-gradient(90deg, #FF004D 15.77%, #990070 104.02%), applied to
  headline text. Reused here for the headline gradient and hovers.
- Soft pink: #FF83A6. Found in the stylesheet. Used here for mono
  labels on dark surfaces.
- Bitcoin amber: #FFAA00. Found five times in the homepage HTML.
  Used here sparingly for BTC-flavoured accents and the WATCH band.
- Near-black ink: #171717. Found in the stylesheet. Used here for
  body text and the dark loop-simulator section.
- White: #FFFFFF, the site's dominant surface on mezo.org, is the
  primary surface here too. Dexter described Mezo as "red and
  white"; the sampling confirms red on white is the identity.

Derived, not sampled: #FFF5F7 (blush panel tint) and #F3D9E0
(border tint) are light tints of the brand red for soft surfaces.
Functional, not brand: the SAFE band uses a restrained green
#1F9D66 because a risk tool needs a legible safe colour; Mezo's
published palette has none. Both facts are stated here so nobody
mistakes them for Mezo colours.

## Verified chain facts

Chain ID 31611, RPC https://rpc.test.mezo.org, explorer
https://explorer.test.mezo.org. Contract addresses and borrow terms
(MCR 110%, CCR 150%, interest 1% APR, minimum loan 1,800 MUSD) are
the ones verified against Mezo's official docs during the Mezo Desk
build and recorded in ~/workspace/projects/mezo-desk/BUILD_NOTES.md.
At build time the lab read the live BTC price at about $67,190 and
the system collateral ratio at about 241%.

## Risk math, hand-checked

All formulas live in src/risk.ts. scripts/smoke.ts pins them to
hand-computed values; all 16 checks pass.

Crash example, by hand: collateral 2 BTC, debt 50,000 MUSD, BTC at
$60,000. Value is 120,000, so CR = 120000 / 50000 = 240%.
Liquidation price = 1.1 x 50000 / 2 = $27,500. Maximum survivable
drop = 1 - 27500 / 60000 = 54.17%. A 30% drop puts BTC at $42,000,
value at $84,000, CR at 168% (SAFE). A 55% drop puts BTC at
$27,000, value at $54,000, CR at 108%, under the 110% line
(LIQUIDATED). The code returns exactly these numbers.

Loop example, by hand: start 1 BTC, per-loop ratio 0.5, 2 loops,
BTC at $60,000. Loop 1 borrows 0.5 x 1 x 60000 = 30,000 MUSD and
buys 0.5 BTC: collateral 1.5 BTC, debt 30,000. Loop 2 borrows
0.5 x 1.5 x 60000 = 45,000 MUSD and buys 0.75 BTC: collateral
2.25 BTC, debt 75,000. Leverage 2.25x. CR = 2.25 x 60000 / 75000
= 180%. Liquidation price = 1.1 x 75000 / 2.25 = $36,666.67.
Rating MODERATE (at or above 150%, under 200%). The code returns
exactly these numbers.

Band thresholds: SAFE at or above 150% (the system's own safety
line), WATCH 130% to 150%, DANGER 110% to 130%, LIQUIDATED below
110%. Loop ratings: LOW at or above 200%, MODERATE 150% to 200%,
HIGH 120% to 150%, EXTREME below 120%, each with a reason tied to
the two protocol lines.

## RiskRegistry contract status

- contracts/RiskRegistry.sol compiles cleanly with solc 0.8.38
  (npm solc), optimizer on: artifacts/RiskRegistry.json, bytecode
  1,463 bytes. saveSnapshot stores the caller's latest snapshot
  (ratio in basis points, liquidation price scaled by 1e18, band as
  0 to 3, label) plus a save count and timestamp; getSnapshot and
  snapshotCount read it back.
- Deployment: BLOCKED at build time, honestly. The demo wallet
  holds 0 testnet BTC (checked live by npm run deploy, exit code 2
  with the blocker printed), and the Mezo faucet is CAPTCHA
  protected, so funding needs Dexter's pending human visit to
  https://faucet.test.mezo.org/. scripts/deploy.ts is ready: once
  the wallet holds any testnet BTC it deploys and writes
  data/registry.json, and the site picks the deployment up with no
  code change.
- Site behaviour while undeployed: the status strip shows
  "Paused, deploy pending", POST /api/save returns a plain paused
  message explaining exactly why, and snapshot lookups say the
  registry is not deployed yet. Nothing fakes a save.

## Smoke test results (2026-11-14, server on port 8795)

- npm run typecheck: clean.
- npx tsx scripts/smoke.ts: 16 of 16 math checks pass (above).
- GET /api/status: chain 31611, live block 16,774,235, BTC price
  $67,189.99, system ratio 241.26%, registry deployed false,
  demo BTC 0.
- GET /api/xray for the demo wallet (no trove): honest no-position
  response with the manual-mode pointer. For a malformed address:
  plain HTTP 400 error.
- GET /api/xray for a real trove owner (0x52d033E64774F31A8B7562806aA5782CbbD29382,
  first entry of the on-chain SortedTroves list, which holds 326
  troves): active trove read live, 7,028.86 BTC collateral,
  1,376,545.49 MUSD debt, ratio 34,308.0%, liquidation price
  $215.43, band SAFE. The arithmetic was re-verified by hand from
  the raw reads.
- POST /api/save with a valid snapshot: paused response naming the
  faucet blocker. GET /api/snapshot: deployed false response.
- POST /api/card for a stress result: a real PNG, 1200x630,
  127,393 bytes, visually checked: brand, headline, band pill,
  four stat cells, "@heisdave01 / DEXTER WEB3" watermark and the
  "Testnet illustration. Not financial advice." note all render.
- Homepage visually checked in a browser screenshot: Mezo red on
  white, gradient headline, live stat strip, stress panel computing
  224.0% and SAFE for the default position at the live price, dark
  loop section below.

## What is live vs illustrated

- Live: trove reads, BTC price, system ratio, block number, and
  (once deployed) snapshot saves and reads.
- Illustrated: crash slider and loop simulator. The loop model is
  printed on the page: MUSD at exactly $1, swaps at the live price,
  no slippage, no fees, interest excluded. Real loops differ, and
  the interface says so.

## Gaps and honest limits

- RiskRegistry is not deployed yet (faucet blocker above). The
  save and lookup code paths are complete and were exercised up to
  the paused state; the funded branch can only run after the faucet
  visit. This is the single step between the current build and a
  fully live on-chain save.
- X-Ray reads the trove's raw collateral and debt. Mezo Borrow
  debt figures from TroveManager include the protocol's own debt
  accounting; the lab shows them as read and computes the ratio
  from the same two numbers, which is the ratio that matters for
  liquidation.
- The demo wallet can only save snapshots for itself, so saved
  snapshots are labelled "saved by the desk demo wallet". A
  production version would let each visitor save from their own
  wallet; the contract already supports any caller.
- The brand name is not final. It is one constant (BRAND in
  src/config.ts) plus the visible headline text; Dexter is choosing
  the name separately.

## Rename: MintAnchor (2026-11-14)

The product name was locked as MintAnchor on 2026-11-14. The BRAND
constant in src/config.ts now reads MintAnchor, and every user-facing
brand string followed it: page title, headers, the card page, the
footer note, the README and the package description. Internal file
names and code identifiers (the mezo-risk-lab package name, the
RiskRegistry contract, these notes) keep the working name.

Name checks run before the lock: mintanchor.app is unregistered.
mintanchor.xyz and mintanchor.com are registered but parked for sale,
with no product behind either. @MintAnchor on X is a dormant NFT
account from 2021 with no posts and no followers.

The deck cover leads with what the tool does (a stress-test lab for
MUSD loans and loops on Mezo), then the name, then the tagline, so the
name never has to carry the old Anchor Protocol association on its
own. Tagline, locked: "Stress-test your MUSD position before the
market does."

## Addendum (2026-11-14): deployed, named, public, hosted

Added later the same day, after the notes above were written. The
"deployment blocked", "not deployed yet" and "brand name is not
final" passages above describe the state at build time and are
historical; this addendum is the current state.

- The demo wallet was funded from the Mezo faucet and
  contracts/RiskRegistry.sol was deployed to Mezo testnet at
  0x378c46B4392B3Cdb194F97Ee78F9308a8E75db3F (deploy tx
  0x1999d40bcda239ac67eb23442f57ab6ef982b6afb1cc344508fa9dd9f9f856b5).
- Snapshot saves were proven end to end through the deployed
  registry, each read back from the contract afterwards: a
  verification save (240% ratio, $27,500 liquidation price, tx
  0x866b41b13b6aa2f43bfc0a197d2e03a19297b5dd956951ed6595401dccdf69d4)
  and a second save filmed for the pitch video (label "Pitch
  check: 2 BTC loan", 268.54% ratio, $27,500 liquidation price,
  band SAFE, tx
  0x276275a538a39c3937979d8dbea94dacc932dfdc8dfc09c833237a63b83c19c3).
- The name question is closed: MintAnchor is locked (rename
  section above).
- The repo is public at https://github.com/Heisdave/mintanchor
  and the site is hosted at https://mintanchor.onrender.com
  (Render free tier, service name mintanchor, deploying from the
  repo's master branch; DEMO_PRIVATE_KEY set as a private
  environment variable on the service, never committed).
- Borrow rate wording was made precise across the public
  materials on the same pass: the fixed APR is currently 1%
  (initial rates range from 1 to 5%), per Mezo's borrow guide.
