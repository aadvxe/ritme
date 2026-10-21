import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Builds the on-demand page extractor as ONE self-contained IIFE (dist/extract.js).
 * It is injected with chrome.scripting.executeScript only after a user-triggered capture;
 * it is never declared as a content script.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "es2022",
    minify: true,
    lib: {
      entry: resolve(__dirname, "src/extract/entry.ts"),
      formats: ["iife"],
      name: "RitmeExtract",
      fileName: () => "extract.js",
    },
  },
});
