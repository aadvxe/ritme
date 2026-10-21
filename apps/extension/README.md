# Ritme browser extension (`@ritme/extension`)

Chrome / Edge (Manifest V3) extension that saves **a conversation or text you choose** to Ritme. TypeScript + React, built with Vite into `dist/`.

It reads a page only when you ask, once: click the toolbar button, use the right-click menu, or press **Alt+Shift+R**. You then review exactly what will be sent and press **Save to Ritme**. Nothing runs in the background and nothing is sent before that.

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

Create `apps/extension/.env.local` to override, then rebuild. (Local run in this repo: API `http://localhost:8090`, web `http://localhost:5180`.)

## Build

From the repo root (Windows: wrap with `cmd /c "..."` to avoid PowerShell stderr noise):

```bash
pnpm --filter @ritme/extension build       # clean + typecheck + vite build (pages, service worker) + vite build (extractor) → apps/extension/dist
pnpm --filter @ritme/extension dev         # watch both builds (reload the extension in chrome://extensions after changes)
pnpm --filter @ritme/extension typecheck
pnpm --filter @ritme/extension lint
pnpm --filter @ritme/extension test
```

`dist/` contains `manifest.json`, `popup.html`, `capture.html`, `background.js` (service worker), `extract.js` (the page extractor, a single self-contained IIFE) and `assets/`.

## Load unpacked

1. Build: `pnpm --filter @ritme/extension build`.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and choose the `apps/extension/dist` folder.
4. Confirm the card shows ID `cglnncjoohcjooihmgfhdenaoikilpfg`. Pin the Ritme icon from the puzzle-piece menu.
5. Start the backend and website, sign in to the website, then click the Ritme toolbar icon → **Connect to Ritme** and press **Allow** on the website page.
6. Open a supported app (below) in a tab and click the Ritme icon → **Capture this conversation**. Review, then **Save to Ritme** → **Open workflow**.

After changing code, press the reload icon on the extension card. If you need to change the shortcut: `chrome://extensions/shortcuts`.

## How capture works

```text
toolbar popup / context menu / Alt+Shift+R      (each is a user action that grants activeTab for that tab)
        │
        ▼  service worker or popup
 chrome.scripting.executeScript({ files: ["extract.js"] })   → registers globalThis.__ritmeExtract
 chrome.scripting.executeScript({ func })                    → calls it ONCE, deletes it, returns the result
        │                                                      (top frame only; nothing stays in the page)
        ▼
 draft in chrome.storage.session ─▶ capture.html (preview) ─▶ POST /api/captures   (Cancel → nothing sent, draft discarded)
```

- **Triggers.** (1) Toolbar popup: *Capture this conversation* when the tab is a supported app (`<App> detected`), or *Save selected text* anywhere else. (2) Context menu: **Save selection to Ritme** (shown only when text is selected) and **Save this conversation to Ritme** (shown only on the supported sites, via `documentUrlPatterns`; this is a menu filter, not a permission). (3) Keyboard command `capture-conversation`, suggested **Alt+Shift+R**.
- **Selection first.** If text is selected, only the selection is captured; on supported apps it is still attributed to the sender (when it sits inside one message), chat title and app. Otherwise the newest **30** rendered messages of the open conversation are read (only what is on screen; the extension never scrolls, clicks or loads more).
- **Output** of the extractor: `{ app, chatTitle, domain, pageUrl, messages: [{ id, sender, time, text }], truncated }`. The preview turns it into a readable transcript: first line `Chat: <title> (<App>)`, then `[time] Sender: text` lines. `sourceType` is `browser_selection`; `sourceDomain` is the host; `sourcePageTitle` is the chat/subject title; `sourceUrl` is removable.
- **Size.** The newest messages that fit `MAX_CAPTURE_CHARS` are kept; older ones are left **unchecked** with the notice "Only the latest N messages fit". Nothing is cut silently, and Save stays disabled if what is left is still too long.
- **If nothing can be read** (selectors drifted, a restricted page, no selection on an unsupported site) a plain page says "Ritme couldn't read this chat. Select the text you want and try again." No draft is created, nothing is sent, and nothing is ever shown as saved.

## Preview (`capture.html`)

- A list of the messages with a checkbox each (all checked by default), the notice **"This includes messages written by other people. Send only what you need."**, and **Hide other people's names** (off by default): senders become Person A/B… consistently, your own messages stay "You", and the chat title is withheld while it is on (it is often a person's name). Names written inside message text are not changed.
- The final text box is editable and is exactly what is sent. Editing it by hand locks the checkboxes until you choose *Rebuild text from the checked messages*.
- Page title, address and website are each individually removable (removed ⇒ `null`); optional note "What do I need to do with this?"; privacy statement; **Save to Ritme** / **Cancel** (Cancel sends nothing).
- Sensitive-domain warning (health, banking/finance, HR portals) needs a per-capture confirmation before Save is possible. Removing the address from the capture does not remove the warning.
- Drafts live in `chrome.storage.session` (cleared when the browser closes, never synced). Cleared after a 2xx; kept on failure with **Retry** and **Copy text**. One idempotency key per draft, reused on retries; it only changes if you edit what would be sent.
- States: not connected (**Connect to Ritme**), offline, error, success (**Open workflow**). "Saved to Ritme" appears only after `POST /api/captures` returned 2xx with a capture. The workflow link is honoured only if it is on the Ritme web origin. 400 px layout, keyboard-operable, status as icon + text.
- Connecting: the popup/preview opens `{VITE_WEB_URL}/connect?ext=<id>`. After **Allow**, the website calls `chrome.runtime.sendMessage(<id>, { type: "ritme.connect", payload })`; the service worker accepts it only from the web origin, validates it, and stores the tokens in `chrome.storage.local`. Access tokens (scope `captures:write`, ~15 min) refresh through `/api/extension/refresh`; if the refresh token is revoked the extension returns to "Not connected". *Disconnect this browser* clears the local tokens; revoke the device server-side in Ritme's settings.

## Supported apps (web versions only)

| App | Hosts | Adapter |
|---|---|---|
| WhatsApp Web | `web.whatsapp.com` | [`whatsapp.ts`](src/extract/adapters/whatsapp.ts) |
| Telegram Web (/a and /k) | `web.telegram.org` | [`telegram.ts`](src/extract/adapters/telegram.ts) |
| Microsoft Teams | `teams.microsoft.com`, `teams.live.com`, `teams.cloud.microsoft` | [`teams.ts`](src/extract/adapters/teams.ts) |
| Slack | `app.slack.com` | [`slack.ts`](src/extract/adapters/slack.ts) |
| Gmail | `mail.google.com` | [`gmail.ts`](src/extract/adapters/gmail.ts) |
| Outlook on the web | `outlook.office.com`, `outlook.office365.com`, `outlook.live.com`, `outlook.cloud.microsoft` | [`outlook.ts`](src/extract/adapters/outlook.ts) |
| Any other site | — | Selected text only (never page content) |

**Limitations.** Web versions only: not the WhatsApp, Telegram or Teams desktop apps, nor phone apps. Only the top frame, only what is rendered (virtualised lists render only the visible window; collapsed Gmail messages have no body in the DOM). Your own messages are shown as "You" where the app marks them (WhatsApp, Telegram); Teams, Slack, Gmail and Outlook show your own name like anyone else's.

### These adapters are best effort and UNTESTED on live accounts

They are written from known DOM hooks and tested against **synthetic fixtures** (`src/test/fixtures.ts`), not against real WhatsApp/Telegram/Teams/Slack/Gmail/Outlook sessions. These apps change their markup without notice, and Outlook's obfuscated class names make it the least certain. Each adapter is one table of selectors with 2–3 fallback strategies (the first strategy that finds a message wins).

### Verify a site manually

1. Build and load unpacked (above); sign in to the app in a normal tab; open a conversation (Gmail/Outlook: open a thread/message).
2. Click the Ritme icon. You should see `<App> detected`. Click **Capture this conversation**.
3. In the preview check: chat title/subject, sender and time of each message, that your own messages say "You" where expected, that quoted text/timestamps do not leak into message text, that media-only rows are skipped, and that only visible messages are included.
4. Select one message's text and capture again: only the selection is captured, with the correct sender.
5. In an empty/new chat, capture: you should get "Ritme couldn't read this chat…" and **no** draft.
6. Cancel at the end; confirm in DevTools → Network (extension's service worker/preview tab) that no `/api/captures` request was made.

### Fix selectors when a site changes

Open the page's DevTools → Elements, find the message container, sender, time and text nodes, and update the matching table in `src/extract/adapters/<app>.ts` (`scope`, `title`, and each strategy's `messages`/`text`/`sender`/`time`). Add the new markup as a fixture in `src/test/fixtures.ts`, extend `src/extract/adapters.test.ts`, then rebuild and reload. The engine (`src/extract/engine.ts`) does not need to change.

## Permissions (asserted by `src/manifest.test.ts`)

| Permission | Why |
|---|---|
| `contextMenus` | "Save selection to Ritme" / "Save this conversation to Ritme" |
| `activeTab` | Granted by the user's click/shortcut for the current tab only; lets us read that tab's URL/title and inject the extractor |
| `storage` | Draft (session) and connection tokens (local) |
| `scripting` | Inject `extract.js` once, into the active tab, after a user-triggered capture |

- `host_permissions`: the API origin only. No chat/mail hosts: access to those pages comes only from `activeTab`, one tab at a time, when you trigger a capture.
- `externally_connectable.matches`: the web origin only.
- No static `content_scripts`, no `history`, no `tabs`, no `<all_urls>`, no remote code. Fonts (Poppins) are bundled locally; there is no analytics.

## Tests

`vitest` + Testing Library with an in-memory `chrome.*` mock (`src/test/chrome-mock.ts`). They cover: adapter extraction against fixture HTML for all six apps (including fallback strategies, selection attribution, 30-message cap, `no_messages_found`, generic selection-only fallback); injection (extractor injected once as a file, called by a self-contained function that removes it); context menus (selection only; conversation item only on supported hosts) and the keyboard command; nothing is injected or sent without a trigger; include/exclude and hide-names change the payload; truncation notice and never-silent-cut; cancel sends no request; edited text (not the original) is sent; removed URL ⇒ `sourceUrl: null`; same idempotency key on retry; offline / unauthenticated / rejected token / unreadable chat never show success; sensitive-domain confirmation; connect-message origin validation; token refresh; popup states; and the manifest permission allowlist.

**Not covered by automated tests:** loading the built extension in a real Chrome profile, the real `chrome.scripting` behaviour, live WhatsApp/Telegram/Teams/Slack/Gmail/Outlook pages, and a real backend round trip. Verify those manually.
