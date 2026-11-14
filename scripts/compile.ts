// Compile contracts/RiskRegistry.sol into artifacts/RiskRegistry.json
// using the npm solc package. No network, no external services.
import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "contracts", "RiskRegistry.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: { "RiskRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter(
  (e: { severity: string }) => e.severity === "error",
);
if (errors.length > 0) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}

const compiled = output.contracts["RiskRegistry.sol"]["RiskRegistry"];
mkdirSync(join(root, "artifacts"), { recursive: true });
writeFileSync(
  join(root, "artifacts", "RiskRegistry.json"),
  JSON.stringify(
    {
      contractName: "RiskRegistry",
      abi: compiled.abi,
      bytecode: compiled.evm.bytecode.object,
      compiler: solc.version(),
    },
    null,
    2,
  ),
);
console.log(`Compiled RiskRegistry with solc ${solc.version()}`);
console.log(`Bytecode length: ${compiled.evm.bytecode.object.length / 2} bytes`);
