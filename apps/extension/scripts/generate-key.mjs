// Generates the extension's pinned key pair.
//   node scripts/generate-key.mjs <path-for-private-pem>
// Prints the public key (for manifest "key") and the resulting extension ID.
// The private .pem must NEVER be committed; keep it outside the repository.
import { generateKeyPairSync, createHash } from "node:crypto";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/generate-key.mjs <path-for-private-pem>");
  process.exit(1);
}
const target = resolve(out);
if (existsSync(target)) {
  console.error(`Refusing to overwrite ${target}`);
  process.exit(1);
}
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const der = publicKey.export({ type: "spki", format: "der" });
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });

const id = [...createHash("sha256").update(der).digest().subarray(0, 16)]
  .flatMap((b) => [b >> 4, b & 15])
  .map((n) => String.fromCharCode(97 + n))
  .join("");
console.log(JSON.stringify({ key: der.toString("base64"), extensionId: id }, null, 2));
