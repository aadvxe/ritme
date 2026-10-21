/**
 * MV3 manifest, generated at build time (vite.config.ts) and asserted by tests.
 *
 * Deliberately minimal (spec §11 / §14.1): permissions are only contextMenus, activeTab, storage and
 * scripting; host_permissions is the API origin only; externally_connectable is the web origin only;
 * there are no static content scripts, no history, no <all_urls>. `scripting` is used only to inject
 * the extractor once, into the active tab, right after the user triggers a capture (activeTab).
 */

/** Public half of the pinned key pair. The private .pem is never committed. See README. */
export const EXTENSION_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnvQfJ/1zMSgZFMHep093V6Xep/C7dnG/Bsn661jreYsuCs3W2ms8ZAnyfWT3SVbxAT1y2TkeHXnba+/negsg7/smB7Q+PsG5N2S7/i4n+Qe3Dh3ZG2bWaMRywnXKTukHhMPbr7IltkpFJXZv9SiHvLievxvPepp581w8FiJzhv6wWAHAAnYYCRGcSybP0qX556OW9T73ZOQKwnH0FgX0R8LJCmE6/FCAy+WlK5F6PJRk0MSQK1vSVaKbQKGTa/TkrqVbMIK3OtQTVg4/+ljjcT9Z89HA4xaeF7jDQUdWjMGv1eqpkmtkSTwNgwk7p3Rg+KUaCyk4cU0a23/wSdUorwIDAQAB";

export const ALLOWED_PERMISSIONS = ["contextMenus", "activeTab", "storage", "scripting"] as const;

export interface ManifestInput {
  apiOrigin: string;
  webOrigin: string;
  version: string;
}

export function buildManifest({ apiOrigin, webOrigin, version }: ManifestInput) {
  return {
    manifest_version: 3,
    name: "Ritme",
    short_name: "Ritme",
    version,
    description: "Save a chat or email thread, or text you select, to Ritme. Nothing is read until you ask.",
    key: EXTENSION_PUBLIC_KEY,
    minimum_chrome_version: "116",
    icons: { "16": "icons/icon-16.png", "32": "icons/icon-32.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" },
    action: {
      default_title: "Ritme: save text",
      default_popup: "popup.html",
      default_icon: { "16": "icons/icon-16.png", "32": "icons/icon-32.png" },
    },
    commands: {
      "capture-conversation": {
        suggested_key: { default: "Alt+Shift+R" },
        description: "Save this conversation (or the selected text) to Ritme",
      },
    },
    background: { service_worker: "background.js", type: "module" },
    permissions: [...ALLOWED_PERMISSIONS],
    host_permissions: [`${apiOrigin}/*`],
    externally_connectable: { matches: [`${webOrigin}/*`] },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  };
}
