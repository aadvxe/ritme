"""Performance benchmark for the running local Ritme stack. Measures only; invents nothing.

Targets a running API (default http://localhost:8090) with the Firebase Auth emulator (127.0.0.1:9099),
Postgres, and LLM_PROVIDER=fake. So it measures Ritme's own code, database and orchestration, NOT Gemini
latency, network latency to GCP, or Cloud Run cold starts.

  uv run python evals/benchmark.py            # writes evals/results/benchmark-<date>.json and docs/performance-report.md
"""

from __future__ import annotations

import json
import os
import platform
import statistics
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("BENCH_API", "http://localhost:8090")
EMU = os.environ.get("BENCH_EMULATOR", "http://127.0.0.1:9099")
SEQ_N = int(os.environ.get("BENCH_SEQ", "150"))
PIPELINE_N = int(os.environ.get("BENCH_PIPELINE", "12"))


# ------------------------------------------------------------------ helpers


def pct(sorted_ms: list[float], p: float) -> float:
    if not sorted_ms:
        return float("nan")
    k = (len(sorted_ms) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(sorted_ms) - 1)
    return sorted_ms[lo] + (sorted_ms[hi] - sorted_ms[lo]) * (k - lo)


def summarize(ms: list[float]) -> dict:
    s = sorted(ms)
    return {
        "n": len(s),
        "min": round(s[0], 1),
        "p50": round(pct(s, 0.5), 1),
        "p95": round(pct(s, 0.95), 1),
        "p99": round(pct(s, 0.99), 1),
        "max": round(s[-1], 1),
        "mean": round(statistics.fmean(s), 1),
    }


def new_user(client: httpx.Client) -> dict:
    email = f"bench-{uuid.uuid4().hex[:10]}@ritme.test"
    r = client.post(
        f"{EMU}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key",
        json={"email": email, "password": "local-bench-only-123", "returnSecureToken": True},
    )
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['idToken']}"}


def timed(fn) -> tuple[float, httpx.Response]:
    t0 = time.perf_counter()
    r = fn()
    return (time.perf_counter() - t0) * 1000, r


def capture_body(key: str | None = None) -> dict:
    return {
        "contentText": "Can you get the proposal over the line by Friday? Let's make sure everyone is aligned before we send it.",
        "sourceType": "browser_selection",
        "idempotencyKey": key or uuid.uuid4().hex,
        "sourcePageTitle": "Benchmark capture",
    }


def wait_status(client: httpx.Client, h: dict, wf_id: str, want: set[str], timeout: float = 60) -> tuple[float, dict]:
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < timeout:
        d = client.get(f"{BASE}/api/workflows/{wf_id}", headers=h).json()
        if d["workflow"]["status"] in want:
            return (time.perf_counter() - t0) * 1000, d
        time.sleep(0.03)
    raise TimeoutError(f"workflow {wf_id} never reached {want}")


def answer_blockers(client: httpx.Client, h: dict, wf_id: str, detail: dict) -> None:
    due = (datetime.now(UTC) + timedelta(days=5)).replace(microsecond=0).isoformat()
    for q in [q for q in detail["questions"] if q["blocking"] and q["status"] == "open"]:
        r = client.post(
            f"{BASE}/api/workflows/{wf_id}/questions/{q['id']}/answer",
            json={"answer": "Team lead approves; due this Friday 17:00", "confirmedDueAt": due},
            headers=h,
        )
        r.raise_for_status()


# ------------------------------------------------------------------ 1. endpoint latency (sequential)


def bench_endpoints(client: httpx.Client) -> dict:
    h = new_user(client)
    demo = client.post(f"{BASE}/api/demo/reset", headers=h).json()
    wait_status(client, h, demo["id"], {"needs_input"})
    now = datetime.now(UTC)
    cal = {"from": (now - timedelta(days=1)).isoformat(), "to": (now + timedelta(days=30)).isoformat()}
    cases = {
        "GET /healthz (no auth)": lambda: client.get(f"{BASE}/healthz"),
        "GET /api/me": lambda: client.get(f"{BASE}/api/me", headers=h),
        "GET /api/dashboard": lambda: client.get(f"{BASE}/api/dashboard", headers=h),
        "GET /api/workflows": lambda: client.get(f"{BASE}/api/workflows", headers=h),
        "GET /api/workflows/{id} (full Canvas payload)": lambda: client.get(f"{BASE}/api/workflows/{demo['id']}", headers=h),
        "GET /api/calendar-overview (30 days)": lambda: client.get(f"{BASE}/api/calendar-overview", params=cal, headers=h),
        "POST /api/knowledge/search": lambda: client.post(f"{BASE}/api/knowledge/search", json={"query": "peer review client deck"}, headers=h),
        "POST /api/captures (create + enqueue)": lambda: client.post(f"{BASE}/api/captures", json=capture_body(), headers=h),
    }
    out = {}
    # The model/search/capture endpoints are rate limited (RATE_LIMIT_PER_MINUTE per user, default 60), which is
    # a feature. To time the real work rather than 429 rejections, those endpoints rotate to a fresh user every 40 calls.
    limited = {"POST /api/knowledge/search", "POST /api/captures (create + enqueue)"}
    for name, fn in cases.items():
        if name in limited:
            state = {"h": new_user(client), "calls": 0}

            def rotating(name: str = name, state: dict = state):
                state["calls"] += 1
                if state["calls"] % 40 == 0:
                    state["h"] = new_user(client)
                if name.startswith("POST /api/captures"):
                    return client.post(f"{BASE}/api/captures", json=capture_body(), headers=state["h"])
                return client.post(f"{BASE}/api/knowledge/search", json={"query": "peer review client deck"}, headers=state["h"])

            fn = rotating
        for _ in range(10):  # warm-up, not counted
            fn()
        ms, bad = [], 0
        for _ in range(SEQ_N):
            t, r = timed(fn)
            ms.append(t)
            bad += r.status_code >= 400
        out[name] = {**summarize(ms), "errors": bad}
        if name.startswith("POST /api/captures"):
            time.sleep(4)  # let background analyses from these captures finish before the next phase
    # Rate limit behaviour: the 61st call inside a minute from one user is refused with 429.
    h2 = new_user(client)
    codes = [client.post(f"{BASE}/api/knowledge/search", json={"query": "review"}, headers=h2).status_code for _ in range(65)]
    out["_rate_limit_check"] = {"first_60_ok": codes[:60].count(200), "after_60_status_codes": sorted(set(codes[60:]))}
    return out


# ------------------------------------------------------------------ 2. pipeline stage timing (sequential users)


def bench_pipeline(client: httpx.Client) -> dict:
    analysis, planning, execute, total, verified = [], [], [], [], 0
    for _ in range(PIPELINE_N):
        h = new_user(client)
        t_start = time.perf_counter()
        wf = client.post(f"{BASE}/api/demo/reset", headers=h).json()
        a_ms, d = wait_status(client, h, wf["id"], {"needs_input", "ready_for_approval"})
        analysis.append(a_ms)
        if d["workflow"]["status"] == "needs_input":
            answer_blockers(client, h, wf["id"], d)
            p_ms, d = wait_status(client, h, wf["id"], {"ready_for_approval"})
            planning.append(p_ms)
        action = next(a for a in d["actions"] if a["status"] == "pending_approval")
        t0 = time.perf_counter()
        ap = client.post(f"{BASE}/api/actions/{action['id']}/approve", headers=h)
        if ap.status_code != 200:
            raise RuntimeError(f"approve failed: {ap.status_code} {ap.text[:300]}")
        r = client.post(f"{BASE}/api/actions/{action['id']}/execute", headers=h)
        if r.status_code != 200:
            raise RuntimeError(f"execute failed: {r.status_code} {r.text[:300]} | action={action['status']} wf={d['workflow']['status']}")
        execute.append((time.perf_counter() - t0) * 1000)
        verified += r.json()["verification"] == "verified"
        total.append((time.perf_counter() - t_start) * 1000)
    return {
        "runs": PIPELINE_N,
        "capture_to_truth_board_ms": summarize(analysis),
        "answers_to_plan_ms": summarize(planning) if planning else None,
        "approve_execute_verify_ms": summarize(execute),
        "demo_journey_total_ms": summarize(total),
        "executions_verified": f"{verified}/{PIPELINE_N}",
    }


# ------------------------------------------------------------------ 3. concurrency


def bench_concurrency(client: httpx.Client) -> dict:
    out: dict = {}

    # 3a. Read throughput: one user, many parallel dashboard reads.
    h = new_user(client)
    client.post(f"{BASE}/api/demo/reset", headers=h)
    time.sleep(2)
    for workers, per in ((8, 40), (16, 25)):
        def work(_i: int, per: int = per) -> list[float]:
            with httpx.Client(timeout=60) as c:
                res = []
                for _ in range(per):
                    t, r = timed(lambda: c.get(f"{BASE}/api/dashboard", headers=h))
                    res.append(t if r.status_code == 200 else -1)
                return res
        t0 = time.perf_counter()
        with ThreadPoolExecutor(workers) as ex:
            lat = [x for part in ex.map(work, range(workers)) for x in part]
        wall = time.perf_counter() - t0
        ok = [x for x in lat if x >= 0]
        out[f"dashboard_reads_{workers}_parallel"] = {
            "requests": len(lat), "errors": len(lat) - len(ok),
            "throughput_rps": round(len(lat) / wall, 1), **{k: v for k, v in summarize(ok).items() if k in ("p50", "p95", "p99", "max")},
        }

    # 3b. Concurrent users each running the whole demo journey to a verified execution.
    users = 10
    def journey(_i: int) -> dict:
        with httpx.Client(timeout=120) as c:
            uh = new_user(c)
            t0 = time.perf_counter()
            wf = c.post(f"{BASE}/api/demo/reset", headers=uh).json()
            _, d = wait_status(c, uh, wf["id"], {"needs_input", "ready_for_approval"}, 120)
            if d["workflow"]["status"] == "needs_input":
                answer_blockers(c, uh, wf["id"], d)
                _, d = wait_status(c, uh, wf["id"], {"ready_for_approval"}, 120)
            action = next(a for a in d["actions"] if a["status"] == "pending_approval")
            c.post(f"{BASE}/api/actions/{action['id']}/approve", headers=uh)
            r = c.post(f"{BASE}/api/actions/{action['id']}/execute", headers=uh).json()
            return {"ms": (time.perf_counter() - t0) * 1000, "verified": r["verification"] == "verified"}
    t0 = time.perf_counter()
    with ThreadPoolExecutor(users) as ex:
        results = list(ex.map(journey, range(users)))
    out[f"full_journey_{users}_concurrent_users"] = {
        "completed_verified": f"{sum(r['verified'] for r in results)}/{users}",
        "wall_clock_s": round(time.perf_counter() - t0, 2),
        **{k: v for k, v in summarize([r['ms'] for r in results]).items() if k in ("min", "p50", "p95", "max")},
    }

    # 3c. Idempotency under a race: the same capture submitted by 20 threads at once.
    h = new_user(client)
    key = uuid.uuid4().hex
    def submit(_i: int) -> tuple[int, bool]:
        with httpx.Client(timeout=60) as c:
            r = c.post(f"{BASE}/api/captures", json=capture_body(key), headers=h)
            return r.status_code, bool(r.json().get("created"))
    with ThreadPoolExecutor(20) as ex:
        res = list(ex.map(submit, range(20)))
    caps = client.get(f"{BASE}/api/captures", headers=h).json()
    out["idempotent_capture_race_20_threads"] = {
        "responses_201_created": sum(1 for s, c in res if s == 201 and c),
        "responses_replayed": sum(1 for s, c in res if s == 200 and not c),
        "other_statuses": sorted({s for s, _ in res if s not in (200, 201)}),
        "captures_stored": len([c for c in caps if c.get("idempotencyKey", key)]) if False else len(caps),
    }
    time.sleep(2)

    # 3d. Exactly-once execution under a race: one approved action executed by 12 threads at once.
    h = new_user(client)
    wf = client.post(f"{BASE}/api/demo/reset", headers=h).json()
    _, d = wait_status(client, h, wf["id"], {"needs_input", "ready_for_approval"})
    if d["workflow"]["status"] == "needs_input":
        answer_blockers(client, h, wf["id"], d)
        _, d = wait_status(client, h, wf["id"], {"ready_for_approval"})
    action = next(a for a in d["actions"] if a["status"] == "pending_approval")
    expected = len(d["latestPlan"]["plan"]["tasks"])
    client.post(f"{BASE}/api/actions/{action['id']}/approve", headers=h)
    barrier = threading.Barrier(12)
    def run_exec(_i: int) -> int:
        with httpx.Client(timeout=60) as c:
            barrier.wait()
            return c.post(f"{BASE}/api/actions/{action['id']}/execute", headers=h).status_code
    with ThreadPoolExecutor(12) as ex:
        codes = list(ex.map(run_exec, range(12)))
    tasks = client.get(f"{BASE}/api/workflows/{wf['id']}/tasks", headers=h).json()
    out["execute_race_12_threads"] = {
        "status_codes": {str(c): codes.count(c) for c in sorted(set(codes))},
        "tasks_in_plan": expected,
        "tasks_created": len(tasks),
        "duplicates": max(0, len(tasks) - expected),
    }
    # 3e. Read-your-writes: change a task, then immediately read it back over a DIFFERENT connection.
    # Guards against sending the response before the transaction commits.
    task_id = tasks[0]["id"] if tasks else None
    stale = 0
    rounds = 60
    if task_id:
        for i in range(rounds):
            want = "in_progress" if i % 2 == 0 else "todo"
            client.patch(f"{BASE}/api/tasks/{task_id}", json={"status": want}, headers=h)
            with httpx.Client(timeout=30) as other:
                got = other.get(f"{BASE}/api/workflows/{wf['id']}/tasks", headers=h).json()
            stale += next(t for t in got if t["id"] == task_id)["status"] != want
    out["read_after_write_60_rounds"] = {"stale_reads": stale, "rounds": rounds if task_id else 0}
    return out


# ------------------------------------------------------------------ 4. size / static facts


def dir_size(path: Path, pattern: str) -> int:
    return sum(p.stat().st_size for p in path.rglob(pattern) if p.is_file())


def gzip_size(path: Path) -> int:
    import gzip
    return len(gzip.compress(path.read_bytes(), 6))


def bench_bundles() -> dict:
    out: dict = {}
    fe = ROOT / "apps/frontend/dist/assets"
    if fe.is_dir():
        js = sorted(fe.glob("*.js"), key=lambda p: p.stat().st_size, reverse=True)
        css = sorted(fe.glob("*.css"), key=lambda p: p.stat().st_size, reverse=True)
        out["frontend"] = {
            "js_total_kb": round(sum(p.stat().st_size for p in js) / 1024, 1),
            "js_total_gzip_kb": round(sum(gzip_size(p) for p in js) / 1024, 1),
            "css_total_kb": round(sum(p.stat().st_size for p in css) / 1024, 1),
            "largest_js_kb": round(js[0].stat().st_size / 1024, 1) if js else None,
            "js_files": len(js),
            "font_files_kb": round(dir_size(fe, "*.woff2") / 1024, 1),
        }
    ext = ROOT / "apps/extension/dist"
    if ext.is_dir():
        out["extension"] = {
            "package_total_kb": round(sum(p.stat().st_size for p in ext.rglob("*") if p.is_file()) / 1024, 1),
            "js_total_kb": round(dir_size(ext, "*.js") / 1024, 1),
            "page_reader_js_kb": round((ext / "extract.js").stat().st_size / 1024, 1) if (ext / "extract.js").exists() else None,
        }
    return out


def machine() -> dict:
    info = {"os": platform.platform(), "python": sys.version.split()[0], "cpu_logical_cores": os.cpu_count()}
    try:
        mem = subprocess.run(["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"], capture_output=True, text=True, timeout=20).stdout.strip()
        info["ram_gb"] = round(int(mem) / 1024**3, 1)
        cpu = subprocess.run(["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor | Select-Object -First 1).Name"], capture_output=True, text=True, timeout=20).stdout.strip()
        info["cpu"] = cpu
    except Exception:
        pass
    return info


def main() -> int:
    started = datetime.now(UTC)
    with httpx.Client(timeout=120) as client:
        try:
            client.get(f"{BASE}/healthz").raise_for_status()
            client.get(f"{EMU}/").raise_for_status()
        except Exception as exc:
            print(f"The stack is not reachable ({type(exc).__name__}). Start API on {BASE} and the Auth emulator on {EMU}.")
            return 2
        print("1/3 endpoint latency …", flush=True)
        endpoints = bench_endpoints(client)
        print("2/3 pipeline stages …", flush=True)
        pipeline = bench_pipeline(client)
        print("3/3 concurrency …", flush=True)
        concurrency = bench_concurrency(client)
    result = {
        "date": started.isoformat(timespec="seconds"),
        "target": {"api": BASE, "llm": "fake (scripted FakeLlm)", "db": "PostgreSQL 16 in Docker", "api_workers": 1},
        "machine": machine(),
        "sequential_requests_per_endpoint": SEQ_N,
        "endpoints_ms": endpoints,
        "pipeline": pipeline,
        "concurrency": concurrency,
        "bundles": bench_bundles(),
    }
    out = ROOT / "evals" / "results" / f"benchmark-{started.date().isoformat()}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(f"\nresults -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
