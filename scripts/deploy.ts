// Deploy RiskRegistry to Mezo testnet with the demo wallet.
//
// Honest blocker handling: the demo wallet is funded only by a human
// faucet visit (the faucet is CAPTCHA-protected). If the balance is
// still zero, this script says so plainly, writes nothing, and exits
// with code 2. Once funded, it deploys and records the deployment in
// data/registry.json, which the server reads at runtime.
import { ethers } from "ethers";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAIN } from "../src/config.js";
import { demoAddress, demoWallet, getDemoBtcBalance } from "../src/chain.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  if (!demoWallet || !demoAddress) {
    console.error("No demo wallet configured (.env DEMO_PRIVATE_KEY missing). Nothing deployed.");
    process.exit(2);
  }
  const balance = await getDemoBtcBalance();
  console.log(`Demo wallet: ${demoAddress}`);
  console.log(`Testnet BTC balance: ${balance}`);
  if (balance <= 0) {
    console.error(
      "BLOCKED: the demo wallet holds no testnet BTC, so it cannot pay gas. " +
        "One human visit to https://faucet.test.mezo.org/ with this address unblocks deployment. Nothing deployed.",
    );
    process.exit(2);
  }
  const artifactPath = join(root, "artifacts", "RiskRegistry.json");
  if (!existsSync(artifactPath)) {
    console.error("artifacts/RiskRegistry.json missing. Run npm run compile first.");
    process.exit(1);
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, demoWallet);
  const contract = await factory.deploy();
  const deployTx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const record = {
    address,
    txHash: deployTx ? deployTx.hash : "",
    chainId: CHAIN.chainId,
    deployedAt: new Date().toISOString(),
  };
  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(join(root, "data", "registry.json"), JSON.stringify(record, null, 2));
  console.log(`RiskRegistry deployed at ${address}`);
  console.log(`Deploy tx: ${record.txHash}`);
  console.log(`Explorer: ${CHAIN.explorer}/address/${address}`);
}

main().catch((e) => {
  console.error(`Deploy failed: ${(e as Error).message}`);
  process.exit(1);
});
