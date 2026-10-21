import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { buildManifest } from "./src/manifest";

function manifestPlugin(apiBase: string, webUrl: string): Plugin {
  return {
    name: "ritme-manifest",
    generateBundle() {
      const { version } = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version: string };
      const manifest = buildManifest({ apiOrigin: new URL(apiBase).origin, webOrigin: new URL(webUrl).origin, version });
      this.emitFile({ type: "asset", fileName: "manifest.json", source: JSON.stringify(manifest, null, 2) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "VITE_");
  const apiBase = env.VITE_API_BASE_URL || "http://localhost:8080";
  const webUrl = env.VITE_WEB_URL || "http://localhost:5173";
  return {
    plugins: [react(), manifestPlugin(apiBase, webUrl)],
    build: {
      outDir: "dist",
      emptyOutDir: false,
      target: "es2022",
      modulePreload: { polyfill: false },
      rollupOptions: {
        input: {
          popup: resolve(__dirname, "popup.html"),
          capture: resolve(__dirname, "capture.html"),
          background: resolve(__dirname, "src/background.ts"),
        },
        output: {
          // The service worker must keep a stable file name (referenced from the manifest).
          entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
        },
      },
    },
  };
});
