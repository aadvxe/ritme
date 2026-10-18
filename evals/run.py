"""Ritme evaluation runner (spec §7 Evaluation, §18).

    uv run python evals/run.py                  # regression mode: real backend + real engine guards, FakeLlm
    uv run python evals/run.py --only s05,s13   # a subset
    uv run python evals/run.py --live           # LLM_PROVIDER=vertex (needs GCP credentials; see README)

Needs Postgres (`docker compose -f infra/docker-compose.yml up -d --wait`, host port 5433). Uses its
own database (`ritme_eval`) which it drops and recreates; override with EVAL_DATABASE_URL.
Exit code 0 only when every scenario passes and the zero-target metrics are zero.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from datetime import UTC, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from harness import boot  # noqa: E402


def load_scenarios(only: set[str] | None) -> list[dict]:
    out = []
    for p in sorted((HERE / "scenarios").glob("s*.json")):
        sc = json.loads(p.read_text(encoding="utf-8"))
        sc["_file"] = p.name
        if only and not any(sc["id"].startswith(o) or str(sc["specNumber"]) == o.lstrip("s0") for o in only):
            continue
        out.append(sc)
    return out


def run_variant(sc: dict, variant: dict | None, *, client, queue, live: bool, models_seen: set, prompts_seen: dict) -> dict:
    from app.engine_port import set_engine
    from app.queue import set_queue
    from harness import checks, metrics
    from harness.driver import Ctx, ScenarioError, deep_merge, run_steps, subst_params
    from harness.llm import ScenarioLlm, build_gateway

    name = variant["name"] if variant else None
    sc = deep_merge(sc, variant.get("override", {})) if variant else sc
    sc = subst_params(sc, sc.get("params", {}))
    sc["assertions"] = list(sc.get("assertions", [])) + list(sc.get("extraAssertions", []))
    started = time.perf_counter()
    boot.truncate_all()
    queue.run_ids.clear()
    set_queue(queue)
    now = datetime.now(UTC).replace(microsecond=0)

    holder: dict = {}

    def resolve_due(days: int) -> str:
        return holder["ctx"].due(f"+{days}d")

    llm = None if live else ScenarioLlm(sc.get("llm", {}), resolve_due)
    set_engine(None if live else build_gateway(llm))
    ctx = Ctx(scenario=sc, client=client, queue=queue, llm=llm, user=f"eval-{sc['id']}-{name or 'main'}"[:60], now=now, live=live)
    holder["ctx"] = ctx
    tracker = checks.Tracker(sc.get("annotations", {}))

    failures: list[dict] = []
    known_issues: list[dict] = []
    status_note = ""
    t_assert = 0

    def observe() -> None:
        detail = ctx.snapshot("_latest") if ctx.wf_id else None
        tracker.observe(ctx, detail, checks.load_db())

    try:
        if sc.get("preferences"):
            ctx.req("PATCH", "/preferences", json=sc["preferences"], expect=200)
        for doc in sc.get("knowledge", []):
            ctx.req("POST", "/knowledge/documents", json={"title": doc["title"], "content": doc["content"]}, expect=201)
        cap = sc.get("capture")
        if cap:
            body = {
                "contentText": cap["contentText"], "sourceType": cap.get("sourceType", "browser_selection"),
                "idempotencyKey": f"eval-{sc['id']}-{name or 'main'}-key-1",
                "sourceUrl": cap.get("sourceUrl"), "sourcePageTitle": cap.get("sourcePageTitle"),
                "userNote": cap.get("userNote"),
            }
            body = {k: v for k, v in body.items() if v is not None}
            sc["_capture_body"] = body
            r = ctx.req("POST", "/captures", json=body, expect=201)
            ctx.capture_id, ctx.wf_id = r.json()["capture"]["id"], r.json()["workflow"]["id"]
            if sc.get("drain", True):
                ctx.drain()
            ctx.snapshot("initial")
            observe()
        for step in sc.get("steps", []):
            run_steps(ctx, [step])
            if ctx.wf_id:
                observe()
        if ctx.wf_id:
            ctx.snapshot("final")
        db = checks.load_db()
        observe() if ctx.wf_id else tracker.observe(ctx, None, db)

        for idx, a in enumerate(sc.get("assertions", []), start=1):
            aid = a.get("id") or f"a{idx}"
            if live and a.get("fakeOnly"):
                continue
            try:
                ok, msg = checks.run_assertion(ctx, a, db)
            except Exception as exc:  # a malformed assertion is a scenario bug: fail loudly
                ok, msg = False, f"assertion could not be evaluated: {type(exc).__name__}: {exc}"
            t_assert += 1
            if not ok and a.get("knownIssue"):
                known_issues.append({"assertion": aid, "description": a.get("desc", a["check"]), "detail": msg, "issue": a["knownIssue"]})
            elif ok and a.get("knownIssue"):
                known_issues.append({"assertion": aid, "description": a.get("desc", a["check"]), "detail": "now passes: remove the knownIssue flag", "issue": a["knownIssue"], "resolved": True})
            elif not ok:
                failures.append({"assertion": aid, "description": a.get("desc", a["check"]), "detail": msg})
    except ScenarioError as exc:
        failures.append({"assertion": "scenario-step", "description": "a scripted user action did not behave as expected", "detail": str(exc)})
    except Exception as exc:  # noqa: BLE001
        failures.append({"assertion": "runner-error", "description": f"{type(exc).__name__}", "detail": "".join(traceback.format_exception_only(type(exc), exc)).strip()[:400] + " | " + " <- ".join(reversed(ctx.log[-3:]))})
        status_note = traceback.format_exc()[-1500:]

    # ---- invariants (always evaluated, independent of scenario assertions)
    inv: list[tuple[str, str, dict]] = [
        ("inv:citations-resolve", "every citation and evidence excerpt resolves to a stored chunk/capture excerpt",
         {**{str(k): v for k, v in tracker.citations.items() if v}, **{str(k): v for k, v in tracker.evidence.items() if v}}),
        ("inv:no-unsupported-critical-claims", "no explicit claim without evidence, no invented date/owner, no injected instruction promoted",
         {f"{k}:{key}": why for k, bad in tracker.claims_bad.items() for key, why in bad.items()}),
        ("inv:no-duplicate-writes", "no duplicate task/capture rows and no write beyond the approved payload",
         {str(k): v for k, v in tracker.duplicates.items()}),
        ("inv:approval-before-write", "no task exists without an approved action; unapproved actions wrote nothing",
         {str(k): v for k, v in tracker.approval_violations.items()}),
    ]
    if not sc.get("allowFailedActions"):
        inv.append(("inv:executed-actions-verified", "every executed action ended succeeded + verified, confirmed by an independent read-back",
                    {k: why for k, (ok, why) in tracker.actions.items() if not ok}))
    for iid, desc, bad in inv:
        if bad:
            failures.append({"assertion": iid, "description": desc, "detail": "; ".join(f"{v}" for v in list(bad.values())[:3])})

    # ---- record model/prompt metadata for the report
    db = checks.load_db()
    for run in db.runs:
        if run.model:
            models_seen.add(run.model)
        prompts_seen.update(run.prompt_versions or {})

    claims = {k: (len(tracker.claims_checked.get(k, ())), len(tracker.claims_bad.get(k, {}))) for k in tracker.claims_checked}
    ann = sc.get("annotations", {})
    extraction = metrics.score_extraction(ann, ctx.snaps.get((ann.get("extraction") or {}).get("snapshot", "initial")))
    clarification = metrics.score_clarification(ann, ctx.snaps.get((ann.get("clarification") or {}).get("snapshot", "initial")))
    return {
        "id": sc["id"], "variant": name, "specNumber": sc["specNumber"], "title": sc["title"],
        "passed": not failures, "failures": failures, "knownIssues": known_issues, "assertionsEvaluated": t_assert + len(inv),
        "durationMs": round((time.perf_counter() - started) * 1000),
        "claims": claims,
        "citations": (len(tracker.citations), sum(1 for v in tracker.citations.values() if v is None)),
        "evidence": (len(tracker.evidence), sum(1 for v in tracker.evidence.values() if v is None)),
        "actions": (len(tracker.actions), sum(1 for ok, _ in tracker.actions.values() if ok)),
        "duplicates": len(tracker.duplicates),
        "approvalViolations": len(tracker.approval_violations),
        "extractionScore": extraction, "clarificationScore": clarification,
        "modelCalls": None if llm is None else len(llm.calls),
        "debug": status_note or None,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Ritme scenario evals")
    ap.add_argument("--live", action="store_true", help="use LLM_PROVIDER=vertex (real model; needs GCP credentials)")
    ap.add_argument("--only", help="comma-separated scenario ids/prefixes/numbers, e.g. s05,13")
    ap.add_argument("--list", action="store_true", help="list scenarios and exit")
    ap.add_argument("--negative-control", choices=["guards-off", "random-task-ids", "no-approval-gate"],
                    help="break one safeguard in-process; exits 0 only if the evals detect it (never writes results)")
    ap.add_argument("--no-write", action="store_true", help="do not write evals/results/<date>.json")
    args = ap.parse_args()

    only = {x.strip() for x in args.only.split(",")} if args.only else None
    scenarios = load_scenarios(only)
    if args.list:
        for sc in scenarios:
            print(f"{sc['specNumber']:>2}  {sc['id']:<34} {sc['title']}")
        return 0
    if not scenarios:
        print("no scenarios matched", file=sys.stderr)
        return 2

    boot.configure(args.live)
    try:
        dbname = boot.prepare_database()
    except Exception as exc:  # noqa: BLE001
        print(f"Cannot reach Postgres ({type(exc).__name__}). Start it with:\n  docker compose -f infra/docker-compose.yml up -d --wait", file=sys.stderr)
        return 2
    boot.install_fake_firebase()
    if args.live:
        from app.config import get_settings as _gs

        if not _gs().gcp_project_id:
            print("--live needs GCP_PROJECT_ID (and Application Default Credentials for Vertex AI); see evals/README.md", file=sys.stderr)
            return 2
    control_note = None
    if args.negative_control:
        if args.live:
            print("--negative-control only makes sense in fake mode", file=sys.stderr)
            return 2
        from harness import mutations

        control_note = mutations.apply(args.negative_control)
        args.no_write = True
        print(f"NEGATIVE CONTROL '{args.negative_control}': {control_note}")

    from app.config import get_settings
    from app.main import create_app
    from fastapi.testclient import TestClient
    from harness.metrics import aggregate, ratio

    queue = boot.RecordingQueue()
    from app.queue import set_queue

    set_queue(queue)
    settings = get_settings()
    models_seen: set[str] = set()
    prompts_seen: dict = {}
    runs: list[dict] = []
    per_scenario: list[dict] = []
    skipped: list[dict] = []
    t0 = time.perf_counter()

    with TestClient(create_app(), raise_server_exceptions=False) as client:
        for sc in scenarios:
            if args.live and sc.get("liveSkip"):
                skipped.append({"id": sc["id"], "specNumber": sc["specNumber"], "reason": sc["liveSkip"]})
                continue
            variants = sc.get("variants") or [None]
            results = [run_variant(sc, v, client=client, queue=queue, live=args.live, models_seen=models_seen, prompts_seen=prompts_seen) for v in variants]
            runs.extend(results)
            per_scenario.append({
                "id": sc["id"], "specNumber": sc["specNumber"], "title": sc["title"],
                "passed": all(r["passed"] for r in results),
                "variants": [{"variant": r["variant"], "passed": r["passed"], "failures": r["failures"], "knownIssues": r["knownIssues"], "assertionsEvaluated": r["assertionsEvaluated"], "durationMs": r["durationMs"], "modelCalls": r["modelCalls"], "extractionMisses": (r["extractionScore"] or {}).get("misses", []), "clarification": r["clarificationScore"], **({"debug": r["debug"]} if r["debug"] else {})} for r in results],
            })

    m = aggregate(runs)
    passed = sum(1 for s in per_scenario if s["passed"])
    m["endToEndCompletionPassRate"] = {"value": ratio(passed, len(per_scenario)), "passed": passed, "total": len(per_scenario), "scenarioVariantsRun": len(runs)}
    m["notMeasured"] = {
        "accessibilityOfMainFlow": "not measured here: needs the browser (frontend/extension a11y checks); this runner drives the HTTP API only",
        "modelQuality": "not measured in fake mode: the model's outputs are scripted/fixture text, so extraction accuracy and clarification appropriateness describe the guards + persistence pipeline, not a language model" if not args.live else None,
        "extensionOfflineBehaviour": "client-side; only the API contract (no/invalid/expired token -> 401, nothing created) is asserted here",
    }
    m["notMeasured"] = {k: v for k, v in m["notMeasured"].items() if v}

    now = datetime.now(UTC)
    report = {
        "date": datetime.now().astimezone().date().isoformat(),  # the user's local day
        "generatedAt": now.isoformat(timespec="seconds"),
        "mode": "live" if args.live else "regression-fake",
        "database": dbname,
        "llm": {
            "provider": settings.llm_provider,
            "modelsObservedInRuns": sorted(models_seen),
            "configuredModels": {"fast": settings.llm_model_fast, "plan": settings.llm_model_plan} if args.live else None,
            "promptVersions": prompts_seen,
        },
        "durationSeconds": round(time.perf_counter() - t0, 1),
        "metrics": m,
        "scenarios": per_scenario,
        "skipped": skipped,
    }
    if not args.no_write:
        out = HERE / "results" / f"{report['date']}{'-live' if args.live else ''}.json"
        out.parent.mkdir(exist_ok=True)
        out.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        report["writtenTo"] = str(out.relative_to(HERE.parent))

    print_report(report, per_scenario, m, args.live)
    if args.negative_control:
        caught = [s["id"] for s in per_scenario if not s["passed"]]
        print(f"\nnegative control '{args.negative_control}' was detected by {len(caught)} scenario(s): {', '.join(caught) or 'NONE'}")
        return 0 if caught else 1
    zero_ok = m["unsupportedCriticalClaims"]["count"] == 0 and m["duplicateWriteCount"]["count"] == 0 and m["writesWithoutApproval"]["count"] == 0
    return 0 if passed == len(per_scenario) and zero_ok else 1


def pct(v: float | None) -> str:
    return "n/a" if v is None else f"{v * 100:.1f}%"


def print_report(report: dict, per: list[dict], m: dict, live: bool) -> None:
    print(f"\nRitme evals  mode={report['mode']}  db={report['database']}  {report['durationSeconds']}s\n")
    print(f"{'#':>2}  {'scenario':<34} {'result':<6} {'checks':>6}  {'time':>7}")
    print("-" * 64)
    for s in per:
        checks_n = sum(v["assertionsEvaluated"] for v in s["variants"])
        t = sum(v["durationMs"] for v in s["variants"])
        mark = "PASS" if s["passed"] else "FAIL"
        suffix = f" ({len(s['variants'])} variants)" if len(s["variants"]) > 1 else ""
        print(f"{s['specNumber']:>2}  {s['id']:<34} {mark:<6} {checks_n:>6}  {t:>5}ms{suffix}")
    failed = [s for s in per if not s["passed"]]
    for s in failed:
        print(f"\nFAILED {s['id']} — {s['title']}")
        for v in s["variants"]:
            for f in v["failures"]:
                tag = f" [{v['variant']}]" if v["variant"] else ""
                print(f"  x {f['assertion']}{tag}: {f['description']}\n      {f['detail']}")
    ki = [(s["id"], v["variant"], k) for s in per for v in s["variants"] for k in v["knownIssues"]]
    if ki:
        print("\nKNOWN ISSUES (reported, not counted as failures)")
        for sid, var, k in ki:
            tag = f" [{var}]" if var else ""
            state = "now passes" if k.get("resolved") else "still present"
            print(f"  ! {sid}{tag} {k['assertion']} ({state}): {k['issue']}\n      {k['detail']}")
    for sk in report["skipped"]:
        print(f"\nSKIPPED {sk['id']}: {sk['reason']}")

    def line(label: str, text: str) -> None:
        print(f"  {label:<34} {text}")

    ex, cl, uc, ci, av, dw, wa, e2e = (m[k] for k in ("extractionFieldAccuracy", "clarificationAppropriateness", "unsupportedCriticalClaims", "citationValidity", "actionVerificationRate", "duplicateWriteCount", "writesWithoutApproval", "endToEndCompletionPassRate"))
    print("\nMetrics (measured on this run only)")
    line("extraction field accuracy", f"{pct(ex['value'])}  ({ex['correct']}/{ex['total']} annotated fields, {ex['scenariosAnnotated']} scenario runs)")
    line("clarification appropriateness", f"{pct(cl['value'])}  ({cl['appropriate']}/{cl['scenariosAnnotated']} scenario runs; topics {cl['expectedTopicsCovered']['covered']}/{cl['expectedTopicsCovered']['expected']}; excess blockers {cl['excessBlockingQuestions']})")
    line("unsupported critical claims", f"{uc['count']}  (target 0; {sum(v['checked'] for v in uc['byKind'].values())} claims checked)")
    line("citation validity", f"{pct(ci['value'])}  ({ci['valid']}/{ci['total']} citations+evidence resolve)")
    line("action verification rate", f"{pct(av['value'])}  ({av['verified']}/{av['executed']} executed actions verified)")
    line("duplicate-write count", f"{dw['count']}  (target 0)")
    line("writes without approval", f"{wa['count']}  (target 0)")
    line("end-to-end completion pass rate", f"{pct(e2e['value'])}  ({e2e['passed']}/{e2e['total']} scenarios)")
    for k, v in m["notMeasured"].items():
        line(f"not measured: {k}", v[:90] + ("…" if len(v) > 90 else ""))
    if report.get("writtenTo"):
        print(f"\nresults -> {report['writtenTo']}")


if __name__ == "__main__":
    raise SystemExit(main())
