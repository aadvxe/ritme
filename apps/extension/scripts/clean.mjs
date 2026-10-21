import { rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

rmSync(resolve(dirname(fileURLToPath(import.meta.url)), "../dist"), { recursive: true, force: true });
