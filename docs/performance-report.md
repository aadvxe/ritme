# Ritme prototype: performance report and benchmark

Measured on 19 Oct 2026 at 01:33 Bangkok time (18:33 UTC on the 18th, which is why the result file is named with that UTC date) by `evals/benchmark.py`.
Raw numbers: `evals/results/benchmark-2026-10-18.json`. Reproduce: start the stack (see README), then `uv run python evals/benchmark.py`.

## What was measured, and what was not

| | |
|---|---|
| Measured | Ritme's own API, database access, orchestration, approval/execution/verification code, concurrency safety, bundle sizes |
| **Not measured** | **Live Gemini latency and quality** (the run used the scripted FakeLlm; no GCP project is connected), Cloud Run cold starts, real network latency, browser rendering metrics (LCP/TTI), real WhatsApp/Telegram/Teams pages |
| Setup | Intel Core Ultra 5 225H (14 logical cores), 15.4 GB RAM, Windows 11, Python 3.12.13, PostgreSQL 16 in Docker on the same machine, **one** uvicorn worker, Firebase Auth emulator tokens verified by firebase-admin on every request |

These are laptop numbers for a development setup. They show where Ritme's own code stands. They are not production figures and must not be quoted as such.

## 1. API latency (sequential, 150 requests per endpoint after warm-up, milliseconds)

| Endpoint | p50 | p95 | p99 | max | errors |
|---|---:|---:|---:|---:|---:|
| `GET /healthz` (no auth) | 1.4 | 2.1 | 2.3 | 2.6 | 0 |
| `GET /api/me` | 13.2 | 19.2 | 25.1 | 75.8 | 0 |
| `GET /api/dashboard` | 23.4 | 30.5 | 49.7 | 129.5 | 0 |
| `GET /api/workflows` | 16.2 | 27.3 | 44.4 | 70.5 | 0 |
| `GET /api/workflows/{id}` (whole Clarity Canvas payload) | 23.4 | 33.6 | 36.8 | 47.8 | 0 |
| `GET /api/calendar-overview` (30 days) | 17.8 | 26.2 | 33.6 | 48.6 | 0 |
| `POST /api/knowledge/search` (Postgres full-text) | 13.7 | 19.3 | 22.5 | 25.4 | 0 |
| `POST /api/captures` (create capture and workflow, enqueue analysis) | 28.0 | 34.7 | 37.3 | 40.0 | 0 |

Reading: every normal screen load is well under 100 ms of server time. About 12 ms of each authenticated request is token verification and the user lookup (compare `/healthz` with `/api/me`).

Rate limiting works as designed: the first 60 search calls in a minute from one user succeeded and the next ones returned `429`. The latency rows above rotate users so they time real work, not rejections.

## 2. The demo journey, stage by stage (12 runs, scripted model)

| Stage | p50 ms | p95 ms |
|---|---:|---:|
| Capture saved → Truth Board ready (retrieve + extract + store) | 74.7 | 89.5 |
| Blockers answered → plan drafted and proposed | 85.1 | 89.1 |
| Approve + execute + read-back verification | 82.2 | 96.3 |
| **Whole journey, capture to Verified tasks** | **342.7** | **378.5** |
| Executions verified | 12 of 12 | |

With real Gemini, the two model steps (extract, plan) will add seconds each. That cost is unmeasured here and will dominate what users feel. The design bounds it: at most 8 steps per run, a configurable per-call timeout (30 s default), one repair retry, and the work runs in a background worker so the page shows progress instead of blocking.

## 3. Concurrency and safety under load

| Test | Result |
|---|---|
| 8 parallel readers × 40 dashboard reads | 320 requests, 0 errors, 42.2 requests/s, p50 98 ms, p95 451 ms, p99 2183 ms |
| 16 parallel readers × 25 dashboard reads | 400 requests, 0 errors, 43.9 requests/s, p50 240 ms, p95 737 ms, p99 2324 ms |
| 10 users running the full journey at once | 10 of 10 reached Verified tasks, 3.77 s wall clock, p50 3.66 s per user |
| Same capture submitted by 20 threads at once | 1 created, 19 replayed, **0 errors**, 1 capture stored |
| One approved action executed by 12 threads at once | tasks planned 6, created 6, **duplicates 0** (5 callers got the finished result, 7 were told it was already running) |
| Write then immediate read over a different connection (60 rounds) | **0 stale reads** |

Reading: a single uvicorn worker tops out around 43 requests/s on this machine and the slowest 1% of requests wait over 2 seconds when many arrive at once. That is a throughput ceiling of one process on a laptop, not a correctness problem. In production it is addressed by Cloud Run concurrency and more instances, and by tuning the database connection pool; neither was tested.

## 4. Correctness benchmarks (20-scenario evaluation, scripted model, 19 Oct 2026)

From `evals/run.py`, quoted from its own report:

| Metric | Result |
|---|---|
| Scenarios passed | 20 of 20 |
| Extraction field accuracy | 100% (206/206 annotated fields) |
| Unsupported critical claims | 0 (227 claims checked) |
| Citation validity | 100% (112/112 resolve to a stored excerpt) |
| Actions verified by read-back | 14 of 14 |
| Duplicate writes | 0 |
| Writes without approval | 0 |

The runner also reported three known issues that were open at that time (deadline-only change returning 422, a lost queue message leaving "Analyse" inert, an injected sentence surviving in a stored summary). These are not counted as passes.
Caveat: with a scripted model these numbers test Ritme's rules (guards, approval gate, verification). They say nothing about how accurate Gemini is.

## 5. Size

| Artifact | Size |
|---|---|
| Frontend JavaScript | 908 KB (252.9 KB gzipped) in 4 files; the largest chunk is 665.6 KB |
| Frontend CSS and fonts | 36.8 KB CSS, 257.4 KB of Poppins font files |
| Extension package | 973 KB in total, of which JavaScript 344 KB; the on-demand page reader is 10.1 KB |

Findings: the 665 KB frontend chunk triggers Vite's size warning and should be code-split by route. The extension ships Poppins subsets for scripts it does not need; keeping only the Latin subset would cut most of its size.

## 6. Defects the benchmark found and fixed

1. **First requests after sign-in could return 500.** The web app fires several requests at once; each tried to create the same user row, and the losers hit a unique-constraint error. The user lookup is now an atomic upsert. A regression test covers 12 simultaneous first requests.
2. **A write could be invisible to the very next request.** The database transaction was committed after the HTTP response had gone out, so a quick follow-up (for example Execute right after Approve under load) could read stale data. The first benchmark run hit one `422` on Execute that is consistent with this. Sessions now commit before the response is sent; the final run shows 0 stale reads in 60 rounds and 12 of 12 verified executions.
3. **Tests depended on a developer's local `.env`.** One CORS test failed once local ports were changed; the test environment is now pinned.

## 7. Not yet measured (next steps)

- Live Vertex AI (Gemini): latency per step, token use, cost per capture, and real extraction accuracy on the 20 scenarios.
- Cloud Run: cold start, autoscaling under concurrent users, Cloud SQL connection limits.
- Browser: Lighthouse and keyboard/screen-reader accessibility results on the built site, extension capture time on real WhatsApp, Telegram, Teams, Slack, Gmail and Outlook pages.
- A usability test with real users: time to an actionable plan and number of interactions.
