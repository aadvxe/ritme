// Fails when the generated schema / TS types are out of date with the Pydantic contracts.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const types = "packages/api-client/src/types.generated.ts";

run("uv run python packages/contracts/scripts/export_schema.py --check");
const before = readFileSync(types, "utf8");
run("pnpm --filter @ritme/api-client generate");
const after = readFileSync(types, "utf8");
if (before !== after) {
  console.error("contracts drift: generated TypeScript types were stale. Commit the regenerated file.");
  process.exit(1);
}
console.log("contracts in sync");
