// Generates src/types.generated.ts from packages/contracts/schema/ritme.schema.json.
// Run via `pnpm contracts:gen` (which first re-exports the schema from the Python contracts).
import { compile } from "json-schema-to-typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../../contracts/schema/ritme.schema.json");
const outPath = resolve(here, "../src/types.generated.ts");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const banner =
  "/* AUTO-GENERATED from packages/contracts (Pydantic). Do not edit. Run `pnpm contracts:gen`. */";

const ts = await compile(schema, "RitmeContracts", {
  bannerComment: banner,
  additionalProperties: false,
  declareExternallyReferenced: true,
  unreachableDefinitions: true,
  strictIndexSignatures: true,
  style: { singleQuote: false, semi: true },
});

writeFileSync(outPath, ts);
console.log(`wrote ${outPath}`);
