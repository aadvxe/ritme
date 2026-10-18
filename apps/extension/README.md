# Ritme browser extension (`@ritme/extension`)

Chrome / Edge (Manifest V3) extension for saving text **you choose** to Ritme. TypeScript + React, built with Vite into `dist/`.

It never captures a page on its own: text only enters Ritme when you select it (right-click → **Save selection to Ritme**) or paste it into the toolbar popup, review it in a preview, and press **Save to Ritme**.

## Pinned extension ID

| | |
|---|---|
| **Extension ID** | `cglnncjoohcjooihmgfhdenaoikilpfg` |
| Public key | `EXTENSION_PUBLIC_KEY` in [`src/manifest.ts`](src/manifest.ts) (goes into the manifest `key`) |
| Private key | **Not in this repository.** Generated once with `scripts/generate-key.mjs`; it is only needed to pack a `.crx` yourself. Never commit a `.pem` (`*.pem` is git-ignored here). |

The `key` field makes the ID identical on every machine and build, so the backend can allow `chrome-extension://cglnncjoohcjooihmgfhdenaoikilpfg` in CORS and the website's `/connect?ext=<id>` page can message it. Set the backend's `EXTENSION_ID` to this value.

To rotate the key: `node scripts/generate-key.mjs <path-outside-the-repo>/key.pem`, paste the printed `key` into `src/manifest.ts`, update the ID above and in the backend config. (`src/manifest.test.ts` fails if the README ID and the key disagree.)

## Configuration

Build-time Vite env (see [`.env.example`](.env.example); all values are public):

| Variable | Default | Used for |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080` | API origin. Becomes the **only** `host_permissions` entry. |
| `VITE_WEB_URL` | `http://localhost:5173` | Ritme website. Becomes the **only** `externally_connectable` origin; used for `/connect` and "Open workflow". |
| `VITE_MAX_CAPTURE_CHARS` | `20000` | Mirrors the backend's `MAX_CAPTURE_CHARS`. Longer text must be shortened by the user; it is never truncated. |

Create `apps/extension/.env.local` to override, then rebuild.

## Build

From the repo root (Windows: wrap with `cmd /c "..."` to avoid PowerShell stderr noise):

```bash
pnpm --filter @ritme/extension build       # typecheck + vite build → apps/extension/dist
pnpm --filter @ritme/extension dev         # rebuild on change (reload the extension in chrome://extensions)
pnpm --filter @ritme/extension typecheck
pnpm --filter @ritme/extension lint
pnpm --filter @ritme/extension test
```

## Load unpacked

1. Build: `pnpm --filter @ritme/extension build`.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and choose the `apps/extension/dist` folder.
4. Confirm the card shows ID `cglnncjoohcjooihmgfhdenaoikilpfg`. Pin the Ritme icon from the puzzle-piece menu if you like.
5. Start the backend (`pnpm dev:backend`) and website (`pnpm dev:frontend`), sign in to the website, then click the Ritme toolbar icon → **Connect to Ritme** and press **Allow** on the website page.
6. Try it: select text on any page → right-click → **Save selection to Ritme** → review → **Save to Ritme** → **Open workflow**.

After changing code, press the reload icon on the extension card (and refresh any open Ritme tabs).

## How it works

```text
right-click selection ─┐
toolbar popup (paste) ─┴─▶ draft in chrome.storage.session ─▶ capture.html (preview) ─▶ POST /api/captures
                                                                         │ Cancel → nothing sent, draft discarded
```

- **Entry points.** The context-menu item is registered for `contexts: ["selection"]`, so it only appears when text is selected; the handler also ignores empty selections. The popup has a paste box; ticking *Also attach this tab's title and address* is the only time it reads the active tab (via `activeTab`), and the result is shown in the preview.
- **Preview (`capture.html`).** Editable text; page title, address and website are each individually removable (removed ⇒ sent as `null`); optional note "What do I need to do with this?"; a privacy statement; **Save to Ritme** / **Cancel**. Only what is currently on screen is sent. Works at 400 px and is fully keyboard-operable.
- **Drafts.** Kept in `chrome.storage.session` (cleared when the browser closes, never synced). Cleared after a 2xx; kept on any failure with **Retry** and **Copy text**.
- **Idempotency.** Each draft has one idempotency key, reused on every retry. It only rotates if you change what would be sent after an attempt.
- **Sensitive sites.** Hostnames that look like health, banking/finance or HR/employee-record portals show a warning and Save stays disabled until you tick a per-capture confirmation (see `src/lib/sensitive.ts`). Removing the address from the capture does not remove the warning.
- **States.** Not connected (**Connect to Ritme**), offline, error, success (**Open workflow**). "Saved to Ritme" appears only after `POST /api/captures` returned 2xx with a capture. The workflow link is only honoured if it is on the Ritme web origin.
- **Connecting.** The popup/preview opens `{VITE_WEB_URL}/connect?ext=<id>`. After **Allow**, the website calls `chrome.runtime.sendMessage(<id>, { type: "ritme.connect", payload })`; the service worker accepts it only from the web origin, validates it, and stores the tokens in `chrome.storage.local`. Access tokens (scope `captures:write`, ~15 min) are refreshed through `/api/extension/refresh`; if the refresh token is revoked the extension returns to "Not connected". *Disconnect this browser* in the popup clears the local tokens; use Ritme's settings to revoke the device server-side.

## Permissions (asserted by `src/manifest.test.ts`)

- `permissions`: `contextMenus`, `activeTab`, `storage` — nothing else.
- `host_permissions`: the API origin only.
- `externally_connectable.matches`: the web origin only.
- No content scripts, no `history`, no `tabs`, no `scripting`, no `<all_urls>`. Fonts (Poppins) are bundled locally; there are no remote scripts or analytics.

## Tests

`vitest` + Testing Library with an in-memory `chrome.*` mock (`src/test/chrome-mock.ts`). They cover: context menu only for selections; cancel sends no request; edited text (not the original selection) is what is sent; removed URL ⇒ `sourceUrl: null`; same idempotency key on retry; offline / unauthenticated / rejected token never show success; sensitive-domain confirmation; connect-message origin validation; token refresh; popup draft creation; and the manifest permission allowlist.

Manual end-to-end check against a real backend is described in the plan's section 6 (extension Cancel sends nothing; removed URL stored as null; repeated execute creates no duplicates).
