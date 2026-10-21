// Rebuilds the extension (pages + service worker, and the page extractor) on change.
import { build } from "vite";
import "./clean.mjs";

const watch = { watch: {} };
await build({ configFile: "vite.config.ts", build: watch });
await build({ configFile: "vite.extract.config.ts", build: watch });
console.log("Watching. Reload the extension in chrome://extensions after changes.");
