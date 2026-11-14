#!/usr/bin/env bash
# Mezo Risk Lab: one command. Needs a .env with DEMO_PRIVATE_KEY (a
# testnet-only wallet) for on-chain snapshot saves; all reads and
# simulations work without it.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi
PORT="${PORT:-8795}" npx tsx src/server.ts
