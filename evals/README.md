# Ritme evals

The 20 end-to-end scenarios from spec §18 plus a runner (spec §7 "Evaluation"). The runner drives the **real
FastAPI app** (TestClient), the real orchestrator, the real `RitmeAiEngine` adapter and the real engine
guards against a **real Postgres**. Only the model call is replaced, by a scripted `FakeLlm`.

```bash
docker compose -f infra/docker-compose.yml up -d --wait      # Postgres on host port 5433
$env:UV_PYTHON_DOWNLOADS='never'                              # Windows PowerShell
uv run python evals/run.py                                    # same as `pnpm eval`
uv run python evals/run.py --only s05,13 --no-write           # subset, don't write results
uv run python evals/run.py --negative-control guards-off      # prove the evals can fail (see below)
uv run python evals/run.py --live                             # real model (see "Live mode")
```

Exit code is `0` only if every scenario passes and the zero-target metrics (unsupported claims, duplicate
writes, writes without approval) are zero. A failure names the violated assertion. Results go to
`evals/results/<date>.json` (`-live` suffix in live mode).

The runner uses its own database, `ritme_eval` (override with `EVAL_DATABASE_URL`). It **drops and recreates
the schema** on start and truncates between scenarios, and refuses any database whose name does not contain
`eval` or `test`.

## What a scenario is

`scenarios/sNN_*.json`, one per spec scenario. Each has: the capture text, an explicit preference profile
(optional), knowledge documents (optional), scripted "model" behaviour, scripted user actions, expected
annotations (for the metrics) and assertions.

| field | meaning |
|---|---|
| `capture`, `preferences`, `knowledge` | the synthetic input; sent through the public API (`POST /captures`, `PATCH /preferences`, `POST /knowledge/documents`) |
| `llm` | per engine step (`extract`, `plan`, `replan`, `draft_clarification`): a queue of model outputs, then the shipped fixture. Items: a JSON model output (camelCase; `"$capture"`, `"$knowledge"`, `"$due:+5d"` placeholders), `{"$fail": "timeout"}`, `{"$raw": "not json"}`. See `harness/llm.py`. |
| `steps` | scripted user actions: `answer`, `defer`, `edit_requirement`, `confirm_requirement`, `plan`, `approve`, `reject`, `execute`, `approve_execute`, `complete_task`, `replan`, `delete_capture`, `draft`, `analyze`, `http`, `extension_connect`, `inject`, … (`harness/driver.py`). `inject` simulates infrastructure faults by writing the DB state they leave behind (interrupted run, tool write committed but response lost, lost queue message). |
| `annotations` | expected requirements (`kind`/`certainty`/`importance`), requirements that must be absent, whether blocking questions are expected and about what, scenario-forbidden text |
| `assertions` | checks on API snapshots and DB rows (`harness/checks.py`). `fakeOnly` = only meaningful with scripted model output (skipped in live mode). `knownIssue` = a real defect found by the evals: reported, not counted as a failure (flips to "now passes" when fixed). |
| `variants` | the same scenario with overrides (e.g. a full vs partial write in #12); the scenario passes only if all variants pass |

Scripted model output includes deliberate *naive-model traps* (a model that calls "Friday" an exact date,
invents an owner, repeats an injected instruction, fabricates a guideline excerpt, returns a dependency
cycle, ignores the task-count limit, gives masking advice…). Those scenarios test that the **code** around
the model holds.

## Invariants checked in every scenario

Independent of the engine's own guard code, after every scripted step:
every citation/evidence excerpt resolves to a stored chunk or capture; no unsupported critical claim; no
duplicate write; no task exists without an approved action; every executed action ended `succeeded` +
`verified` and an independent read-back (task ids and rows) agrees.

## Metrics (what each number is)

All counts are measured; the runner prints numerators and denominators. Latest run: see
`results/<date>.json`.

| metric | definition | measured how |
|---|---|---|
| extraction field accuracy | correct annotated fields / annotated fields (requirement found, `kind`, `certainty`, `importance`; "absent" items count 1 each) | stored requirements vs `annotations.extraction` |
| clarification appropriateness | scenario runs where "has blocking question" equals the annotation, plus expected topics covered, plus excess blockers | `annotations.clarification` vs stored questions |
| unsupported critical claims (target 0) | explicit requirement without resolvable evidence; deadline marked explicit without a calendar date; non-explicit owner; task/workflow date no user-confirmed value supports; instruction-like text promoted into a requirement/task; scenario-forbidden text | final DB state, with per-kind denominators |
| citation validity | source citations and evidence excerpts that resolve to a stored capture/chunk / all | API responses vs DB |
| action verification rate | executed actions that ended succeeded + verified + independently read back / executed actions | DB |
| duplicate-write count (target 0) | duplicate task rows, duplicate capture rows, writes beyond the approved payload, >1 succeeded create per plan | DB |
| writes without approval (target 0) | tasks without an approved action; unapproved actions that wrote | DB |
| end-to-end completion pass rate | scenarios whose scripted flow and all assertions pass / 20 | runner |

### What is **not** measured

* **Model quality.** In regression (fake) mode the model output is scripted or fixture text, so extraction
  accuracy and clarification appropriateness describe the guards + persistence pipeline, **not** a language
  model. Those two numbers only become model measurements in `--live` mode.
* **Accessibility of the main flow** (spec §18): needs a browser; not covered by this API-level runner.
* **Extension offline behaviour** is client-side. #17 asserts only the API contract: no, malformed, invalid,
  expired or revoked credentials → 401 and nothing is created; an extension token cannot read workflows.

## Negative controls

`--negative-control guards-off | random-task-ids | no-approval-gate` breaks one safeguard in-process and exits
0 only if the evals notice. Last verified: `guards-off` fails 10 scenarios, `random-task-ids` fails #12,
`no-approval-gate` fails #1 — so a green run is not vacuous.

## Live mode

`--live` sets `LLM_PROVIDER=vertex` and needs `GCP_PROJECT_ID` + Application Default Credentials. Scripted
model output is ignored, `fakeOnly` assertions are skipped, and scenarios that need scripted failures or ids
(#1, #11, #17, #19) are skipped and listed. The report records the configured model ids, the model ids seen in
agent runs, prompt versions and the date. **Live mode has not been run** (no GCP credentials in the
environment where this was built); it was only checked to fail cleanly without credentials. With a real model
some structural assertions may legitimately fail — those are findings, not harness bugs.

## Findings (real defects the evals surfaced; nothing was fixed outside `evals/`)

Each is encoded as a `knownIssue` assertion, so it shows in every run until fixed.

1. **backend — replan with only a deadline change returns 422** (`s13` variant
   `deadline_moves_no_task_needs_editing`). `POST /workflows/{id}/replan` with `newDueAt` fails with
   "There is nothing to change" when the model leaves every task untouched (e.g. tasks are undated), because
   `actions.propose` → `tools.validate_update_payload` rejects an `update_tasks` payload with no task
   updates/creates although `payload.workflowChanges.confirmedDueAt` carries the user's new deadline.
2. **backend — a lost queue message strands a capture** (`s20` variant `queue_message_lost`). If the run is
   persisted but never delivered (the enqueue error is swallowed in `post_capture`), the run row stays
   `waiting`; `POST /captures/{id}/analyze` sees a "live" run and returns without re-enqueueing, so the
   workflow stays `captured` and "Analyse" does nothing.
3. **ai-engine — injected sentence survives in the stored summary** (`s14`). `apply_extraction_guards`
   scrubs emotion/date claims from `summary` and `objective`, but not instruction-like sentences. A model that
   copies the injected sentence into its summary stores it in `workflow.state_json.summary`. Low severity: it
   is not promoted to a requirement or task and no API returns the summary today.

## Adding or changing a scenario

Copy the nearest `scenarios/*.json`. Use the generic `value` assertion (`snap`, dotted `path` with `*`
projection, `op`) for response checks and `count` for DB rows. Run it alone with `--only`, then run
`--negative-control guards-off` to confirm the new assertions can fail. All data must stay synthetic or
de-identified.
