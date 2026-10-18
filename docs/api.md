# Ritme API & integration contract

Source of truth for shapes: `packages/contracts` (Pydantic, camelCase on the wire). TypeScript types are generated into
`packages/api-client/src/types.generated.ts` (`pnpm contracts:gen`). The typed fetch client is
`packages/api-client/src/client.ts` — it lists every endpoint below. **Do not hand-edit generated types.**

All endpoints are under `/api`, JSON, `Authorization: Bearer <token>`. Errors: `{ error: { code, message, retryable, requestId } }`
(400 invalid, 401 unauth, 403 forbidden, 404, 409 stale version/state, 413, 422 invalid action, 429, 5xx).
Identity comes only from the verified token — never from a request body.

| Area | Endpoints |
|---|---|
| Identity | `GET /me` · `POST /me/onboarding` (marks first-run done/skipped) |
| Dashboard | `GET /dashboard` · `GET /calendar-overview?from&to` (≤ 62 days; dated items + `undated`) |
| Captures | `POST /captures` (idempotent on `idempotencyKey`) · `GET /captures?limit` · `GET/DELETE /captures/{id}` · `POST /captures/{id}/analyze` |
| Workflows | `GET /workflows?status` · `GET/PATCH/DELETE /workflows/{id}` · `POST /workflows/{id}/{pause,resume,cancel}` · `GET /workflows/{id}/activity?cursor&limit` · `GET /activity` |
| Truth Board | `PATCH /workflows/{id}/requirements/{rid}` (confirm / edit / reject) · `POST /workflows/{id}/questions/{qid}/answer` · `POST /workflows/{id}/questions/{qid}/draft` (copy-only message, never sent) |
| Plan | `POST /workflows/{id}/plan` · `PATCH /plan-versions/{id}` (`If-Match: <rowVersion>`) · `POST /workflows/{id}/replan` (Domino Recovery → diff + proposed action) |
| Actions | `POST /workflows/{id}/actions` · `POST /actions/{id}/{approve,reject,execute}` — execute only an approved action, once, then verify by fresh read |
| Tasks | `GET /workflows/{id}/tasks` · `PATCH /tasks/{id}` (status/text only; dates change via replan) |
| Preferences | `GET/PATCH/DELETE /preferences` · `GET /preferences/export` · `POST /preferences/import` · `POST /preferences/collab-guide` |
| Context Library | `POST/GET /knowledge/documents` · `DELETE /knowledge/documents/{id}` · `POST /knowledge/search` |
| Extension | `POST /extension/connect` (needs the web user session) · `POST /extension/refresh` · `GET /extension/devices` · `DELETE /extension/devices/{id}` |
| Privacy | `GET /privacy` · `GET /privacy/export` · `DELETE /privacy/account` |
| Demo | `POST /demo/reset` (re-seeds the labelled demo workflow + "Intern Onboarding Doc") |
| Ops | `GET /healthz` (no auth) |

## Behaviours the UI depends on (implemented in `apps/backend`)

- **Pipeline:** capture → workflow `captured` → worker analyses → `needs_input` (blocker cards) or straight to `ready_for_approval`.
  After the last blocking question is answered or deferred the server enqueues planning itself; poll `GET /workflows/{id}`
  (status `planning` → `ready_for_approval`). A draft plan always comes with exactly one `pending_approval` action in `actions[]`.
- **Clarification gate:** `POST /workflows/{id}/plan` returns 422 while blocking questions are open.
- **Answering:** `AnswerRequest.confirmedDueAt` is the only way a deadline becomes a real date (vague text like "Friday" is
  never converted). `disposition: "defer_nonblocking"` creates an `assume-<questionId>` requirement (kind `assumption`,
  `certainty: inferred`, never auto-confirmed). Answer returns the full `WorkflowDetail`.
- **Approval flow:** `approve` then `execute` (the "Approve & Create Tasks" button calls both). `execute` on an unapproved action → 422.
  Result: `status: succeeded` + `verification: verified` + `resultIds` (task ids). A failed/inconclusive read-back is
  `status: failed`, `verification: unverified` — show **Unverified**, never Verified.
- **Editing a draft plan** (`PATCH /plan-versions/{id}`) cancels the old pending action and creates a new one; `rowVersion` mismatch → 409.
- **Domino Recovery:** `POST /workflows/{id}/replan` (needs an approved plan) returns `{ plan, action, blastRadiusTaskIds, diff }`;
  the action is `update_tasks` (`payload.updates`, `payload.creates`, optional `workflowChanges`/`requirementChange`).
  Nothing changes until approve + execute. Completed tasks are never in the radius.
- **Calendar:** `items` = dated tasks and `workflow_deadline`s (past-dated open items included; the client groups them under
  "Earlier, still open"); `undated` = tasks without a date. `dependsOn` is only for the Timeline links.
- **Provider failures** on synchronous steps (`/draft`, `/plan`, `/replan`) are 502 `provider_error` with `retryable: true`.
  A failed background analysis leaves the workflow `failed` with a plain `nextAction`; `POST /captures/{id}/analyze` retries.
- **Demo:** `POST /demo/reset` creates the labelled demo workflow (`isDemo: true`) + "Intern Onboarding Doc (demo document)"
  and starts analysis.
- **Extension tokens** are rejected (403) on every route except `POST /captures`.

## Auth

- **Web:** Firebase Google sign-in → ID token → `Authorization: Bearer`. Backend verifies with firebase-admin (ADC; emulator when
  `FIREBASE_AUTH_EMULATOR_HOST` is set).
- **Extension token:** only valid for `POST /api/captures` (scope `captures:write`); 15-minute access token + revocable refresh
  token. Any other route with an extension token → 403.

## Extension connect protocol

1. Extension opens `{WEB_URL}/connect?ext=<EXTENSION_ID>` in a tab (user must be signed in on the website).
2. The page shows exactly what is granted ("save text you choose to Ritme; nothing else") and an **Allow** button.
3. On Allow the page calls `POST /api/extension/connect` (web ID token) and sends the result to the extension with
   `chrome.runtime.sendMessage(EXTENSION_ID, { type: "ritme.connect", payload: ExtensionTokenResponse })`.
   The manifest declares `externally_connectable.matches` = the web origin only.
4. Extension stores tokens in `chrome.storage.local`, refreshes via `/extension/refresh`, and shows "Connect to Ritme" when
   unauthenticated. It never claims a capture is saved unless `POST /api/captures` returned 2xx.

## Capture rules the server enforces

Idempotent on `idempotencyKey` (replay returns the existing capture with `created:false`); size limit `MAX_CAPTURE_CHARS`
(reject, never truncate); `sourceUrl` may be `null` (user removed it) and is stored as `null`; creating a capture creates a
workflow in `captured` — it never claims analysis finished.
