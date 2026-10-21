import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ORIGIN, WEB_ORIGIN } from "./config";
import { ALLOWED_PERMISSIONS, EXTENSION_PUBLIC_KEY, buildManifest } from "./manifest";

const manifest = buildManifest({ apiOrigin: API_ORIGIN, webOrigin: WEB_ORIGIN, version: "0.1.0" });

function extensionIdFromKey(base64Key: string): string {
  const digest = createHash("sha256").update(Buffer.from(base64Key, "base64")).digest().subarray(0, 16);
  return [...digest].flatMap((b) => [b >> 4, b & 15]).map((n) => String.fromCharCode(97 + n)).join("");
}

describe("manifest", () => {
  it("requests exactly contextMenus, activeTab, storage and scripting", () => {
    expect([...manifest.permissions].sort()).toEqual(["activeTab", "contextMenus", "scripting", "storage"]);
    expect(manifest.permissions).toEqual([...ALLOWED_PERMISSIONS]);
  });

  it("has no optional permissions, content scripts, history or broad host access", () => {
    const raw = JSON.stringify(manifest);
    expect(manifest).not.toHaveProperty("optional_permissions");
    expect(manifest).not.toHaveProperty("optional_host_permissions");
    expect(manifest).not.toHaveProperty("content_scripts");
    expect(manifest).not.toHaveProperty("web_accessible_resources");
    expect(raw).not.toMatch(/history|webRequest|"tabs"|<all_urls>|webNavigation|cookies|declarativeNetRequest|\*:\/\/\*\/\*/);
  });

  it("limits host_permissions to the API origin (no chat or mail app hosts)", () => {
    expect(manifest.host_permissions).toEqual([`${API_ORIGIN}/*`]);
    expect(JSON.stringify(manifest.host_permissions)).not.toMatch(/whatsapp|telegram|slack|google|microsoft|outlook|office/);
  });

  it("declares a keyboard command and no static content scripts", () => {
    expect(manifest.commands["capture-conversation"].suggested_key.default).toBe("Alt+Shift+R");
    expect(manifest).not.toHaveProperty("content_scripts");
  });

  it("limits externally_connectable to the web origin", () => {
    expect(manifest.externally_connectable).toEqual({ matches: [`${WEB_ORIGIN}/*`] });
  });

  it("is Manifest V3 with a module service worker", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: "background.js", type: "module" });
  });

  it("pins a public key only, and the README records the resulting extension ID", () => {
    expect(manifest.key).toBe(EXTENSION_PUBLIC_KEY);
    expect(EXTENSION_PUBLIC_KEY).not.toMatch(/PRIVATE/);
    const readme = readFileSync(resolve(__dirname, "../README.md"), "utf8");
    expect(readme).toContain(extensionIdFromKey(EXTENSION_PUBLIC_KEY));
  });
});
