"""Scenario driver: executes scripted user actions against the real FastAPI app via TestClient."""

from __future__ import annotations

import copy
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any


class ScenarioError(Exception):
    """A scripted expectation inside a step was violated (named in the report)."""


def deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def subst_params(value: Any, params: dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {k: subst_params(v, params) for k, v in value.items()}
    if isinstance(value, list):
        return [subst_params(v, params) for v in value]
    if isinstance(value, str) and value.startswith("$param:"):
        return params[value.split(":", 1)[1]]
    return value


@dataclass
class Ctx:
    scenario: dict[str, Any]
    client: Any
    queue: Any
    llm: Any
    user: str
    now: datetime
    live: bool = False
    capture_id: str | None = None
    wf_id: str | None = None
    saved: dict[str, Any] = field(default_factory=dict)
    snaps: dict[str, Any] = field(default_factory=dict)
    confirmed_dates: list[datetime] = field(default_factory=list)
    executed_actions: set[str] = field(default_factory=set)
    log: list[str] = field(default_factory=list)
    ext: dict[str, Any] = field(default_factory=dict)

    # ---------------------------------------------------------------- time helpers
    def due(self, rel: str) -> str:
        days = int(rel.rstrip("d"))
        d = (self.now + timedelta(days=days)).replace(hour=17, minute=0, second=0, microsecond=0)
        return d.isoformat()

    # ---------------------------------------------------------------- http
    def headers(self, auth: str = "web") -> dict[str, str]:
        if auth == "none":
            return {}
        if auth == "web":
            return {"Authorization": f"Bearer test:{self.user}"}
        if auth == "invalid":
            return {"Authorization": "Bearer definitely-not-a-valid-token"}
        if auth == "malformed":
            return {"Authorization": "Token abc"}
        if auth == "ext":
            return {"Authorization": f"Bearer {self.ext['access']}"}
        if auth == "ext_expired":
            from app.auth import tokens
            from app.config import get_settings

            tok, _ = tokens.issue_access_token(
                get_settings(), uuid.UUID(self.ext["userId"]), uuid.UUID(self.ext["deviceId"]),
                now=self.now - timedelta(hours=2),
            )
            return {"Authorization": f"Bearer {tok}"}
        raise ScenarioError(f"unknown auth kind {auth!r}")

    def req(self, method: str, path: str, *, auth: str = "web", json: Any = None, expect: int | None = None, params=None):
        r = self.client.request(method, f"/api{path}", headers=self.headers(auth), json=json, params=params)
        self.log.append(f"{method} {path} -> {r.status_code}")
        if expect is not None and r.status_code != expect:
            raise ScenarioError(f"{method} {path}: expected HTTP {expect}, got {r.status_code} {r.text[:200]}")
        return r

    def drain(self) -> int:
        from app.worker.orchestrator import execute_run

        n = 0
        while self.queue.run_ids:
            execute_run(self.queue.run_ids.pop(0))
            n += 1
        return n

    def detail(self) -> dict:
        return self.req("GET", f"/workflows/{self.wf_id}", expect=200).json()

    def snapshot(self, name: str) -> dict | None:
        try:
            d = self.detail()
        except ScenarioError:
            return None
        self.snaps[name] = d
        return d

    # ---------------------------------------------------------------- resolution helpers
    def action(self, which: str) -> dict:
        acts = self.detail()["actions"]  # newest first
        if which == "latest":
            cands = acts
        elif which in ("pending", "approved", "rejected", "executing", "succeeded", "failed"):
            key = "pending_approval" if which == "pending" else which
            cands = [a for a in acts if a["status"] == key]
        else:
            cands = [a for a in acts if a["id"] == which]
        if not cands:
            raise ScenarioError(f"no action matching '{which}' (statuses: {[a['status'] for a in acts]})")
        return cands[0]

    def question_ids(self, which: str) -> list[str]:
        qs = self.detail()["questions"]
        if which == "blocking":
            return [q["id"] for q in qs if q["blocking"] and q["status"] == "open"]
        if which == "open":
            return [q["id"] for q in qs if q["status"] == "open"]
        return [which]


# ---------------------------------------------------------------------------- steps


def _json(r) -> Any:
    try:
        return r.json()
    except Exception:
        return {"_text": r.text[:500]}


def _step(ctx: Ctx, s: dict) -> None:
    do = s["do"]
    expect = s.get("expect")
    ok_default = None if expect == "any" else 200  # "any": record the response, assert on it later
    if expect == "any":
        expect = None
    save = s.get("save")

    def keep(r):
        if save:
            ctx.saved[save] = {"status": r.status_code, "body": _json(r)}
        return r

    if do == "drain":
        ctx.drain()
    elif do == "snapshot":
        ctx.snapshot(s["name"])
    elif do == "answer":
        due = ctx.due(s["due"]) if s.get("due") else None
        for qid in ctx.question_ids(s.get("question", "blocking")):
            body: dict[str, Any] = {"answer": s.get("answer", "")}
            if due:
                body["confirmedDueAt"] = due
                ctx.confirmed_dates.append(datetime.fromisoformat(due))
            keep(ctx.req("POST", f"/workflows/{ctx.wf_id}/questions/{qid}/answer", json=body, expect=expect or 200))
        if s.get("drain", True):
            ctx.drain()
    elif do == "defer":
        for qid in ctx.question_ids(s.get("question", "blocking")):
            body = {"disposition": "defer_nonblocking", "assumptionLabel": s.get("label", "Assumption: to be confirmed later.")}
            keep(ctx.req("POST", f"/workflows/{ctx.wf_id}/questions/{qid}/answer", json=body, expect=expect or 200))
        if s.get("drain", True):
            ctx.drain()
    elif do == "edit_requirement":
        keep(ctx.req("PATCH", f"/workflows/{ctx.wf_id}/requirements/{s['requirement']}", json={"text": s["text"]}, expect=expect or 200))
    elif do == "confirm_requirement":
        keep(ctx.req("PATCH", f"/workflows/{ctx.wf_id}/requirements/{s['requirement']}", json={"confirm": True}, expect=expect or 200))
    elif do == "reject_requirement":
        keep(ctx.req("PATCH", f"/workflows/{ctx.wf_id}/requirements/{s['requirement']}", json={"reject": True}, expect=expect or 200))
    elif do == "plan":
        keep(ctx.req("POST", f"/workflows/{ctx.wf_id}/plan", expect=expect or 200))
    elif do == "approve":
        a = ctx.action(s.get("action", "pending"))
        for _ in range(s.get("times", 1)):
            keep(ctx.req("POST", f"/actions/{a['id']}/approve", expect=expect or 200))
    elif do == "reject":
        a = ctx.action(s.get("action", "pending"))
        keep(ctx.req("POST", f"/actions/{a['id']}/reject", expect=expect or 200))
    elif do == "execute":
        a = ctx.action(s.get("action", "approved"))
        for _ in range(s.get("times", 1)):
            r = keep(ctx.req("POST", f"/actions/{a['id']}/execute", expect=expect))
            if r.status_code == 200:
                ctx.executed_actions.add(a["id"])
    elif do == "approve_execute":
        a = ctx.action(s.get("action", "pending"))
        ctx.req("POST", f"/actions/{a['id']}/approve", expect=200)
        keep(ctx.req("POST", f"/actions/{a['id']}/execute", expect=expect or 200))
        ctx.executed_actions.add(a["id"])
    elif do == "complete_task":
        tasks = ctx.detail()["tasks"]
        if s.get("title"):
            import re as _re

            hit = [t for t in tasks if _re.search(s["title"], t["title"], _re.I)]
            if not hit:
                raise ScenarioError(f"no task title matches /{s['title']}/ among {[t['title'] for t in tasks]}")
            t = hit[0]
        else:
            t = tasks[s.get("index", 0)]
        keep(ctx.req("PATCH", f"/tasks/{t['id']}", json={"status": "done"}, expect=expect or 200))
    elif do == "replan":
        body = {"trigger": s.get("trigger", "request_changed")}
        if s.get("due"):
            body["newDueAt"] = ctx.due(s["due"])
            ctx.confirmed_dates.append(datetime.fromisoformat(body["newDueAt"]))
        if s.get("requirement"):
            body["requirementId"] = s["requirement"]
            body["newText"] = s["newText"]
        keep(ctx.req("POST", f"/workflows/{ctx.wf_id}/replan", json=body, expect=expect or ok_default))
    elif do == "delete_capture":
        keep(ctx.req("DELETE", f"/captures/{ctx.capture_id}", expect=expect or 200))
    elif do == "draft":
        which = s.get("question", "blocking")
        qid = ctx.question_ids(which)[0] if which in ("blocking", "open") else which
        keep(ctx.req("POST", f"/workflows/{ctx.wf_id}/questions/{qid}/draft", expect=expect or 200))
    elif do == "analyze":
        keep(ctx.req("POST", f"/captures/{ctx.capture_id}/analyze", expect=expect or 200))
        ctx.drain()
    elif do == "resubmit_capture":
        keep(ctx.req("POST", "/captures", json=ctx.scenario["_capture_body"], expect=expect or 200))
    elif do == "http":
        path = s["path"].replace("{wf}", str(ctx.wf_id)).replace("{capture}", str(ctx.capture_id))
        keep(ctx.req(s.get("method", "GET"), path, auth=s.get("auth", "web"), json=s.get("body"), expect=expect, params=s.get("params")))
    elif do == "extension_connect":
        j = ctx.req("POST", "/extension/connect", json={"extensionId": "a" * 32, "label": "Eval browser"}, expect=200).json()
        me = ctx.req("GET", "/me", expect=200).json()
        ctx.ext = {"access": j["accessToken"], "deviceId": j["deviceId"], "userId": me["id"]}
    elif do == "extension_revoke":
        ctx.req("DELETE", f"/extension/devices/{ctx.ext['deviceId']}", expect=200)
    elif do == "inject":
        _inject(ctx, s)
    elif do == "sleep":
        time.sleep(float(s.get("seconds", 0)))
    else:
        raise ScenarioError(f"unknown step '{do}'")


# ---------------------------------------------------------------------------- failure injection


def _inject(ctx: Ctx, s: dict) -> None:
    """Simulate infrastructure faults by writing the DB state those faults would leave behind."""
    from app.db import models as m
    from app.db.session import new_session
    from app.queue import create_run
    from app.tools import tasks as tools
    from ritme_contracts import AgentRunTrigger
    from sqlalchemy import select

    kind = s["kind"]
    with new_session() as session:
        if kind == "write_ok_response_lost":
            # The tool wrote (all or part of) the tasks and committed, then the request timed out before
            # verification/ack: the action is left `executing` and stale. The next execute must verify first.
            a = session.get(m.ProposedAction, uuid.UUID(ctx.action(s.get("action", "approved"))["id"]))
            assert a is not None
            payload_tasks = tools.validate_create_payload(a.payload_json)
            n = len(payload_tasks) if s.get("written", "all") == "all" else int(s["written"])
            tools._insert_tasks(session, a.user_id, a, payload_tasks[:n])
            a.status = "executing"
            a.updated_at = datetime.now(UTC) - timedelta(minutes=5)
            session.commit()
            ctx.log.append(f"inject write_ok_response_lost: wrote {n}/{len(payload_tasks)} tasks, action left executing")
        elif kind == "interrupt_run":
            # Worker died mid-run: run row stuck `running`, workflow stuck `analyzing`; the run id is redelivered.
            wf = session.get(m.Workflow, uuid.UUID(ctx.wf_id))
            assert wf is not None
            run = session.scalar(select(m.AgentRun).where(m.AgentRun.workflow_id == wf.id).order_by(m.AgentRun.started_at.desc()))
            assert run is not None
            run.status = "running"
            if s.get("workflow_status"):
                wf.status = s["workflow_status"]
            session.commit()
            ctx.queue.run_ids.append(run.id)
            ctx.log.append("inject interrupt_run: run left `running`, redelivered")
        elif kind == "rerun_analysis":
            wf = session.get(m.Workflow, uuid.UUID(ctx.wf_id))
            assert wf is not None
            run = create_run(session, wf.user_id, wf.id, AgentRunTrigger.RESUME)
            session.commit()
            ctx.queue.run_ids.append(run.id)
            ctx.log.append("inject rerun_analysis: new resume run queued")
        elif kind == "redeliver_runs":
            for run in session.scalars(select(m.AgentRun).where(m.AgentRun.workflow_id == uuid.UUID(ctx.wf_id))):
                ctx.queue.run_ids.append(run.id)
            ctx.log.append("inject redeliver_runs: every run id enqueued again")
        elif kind == "drop_enqueue":
            ctx.queue.run_ids.clear()  # the queue message was lost; the run row stays `waiting`
            ctx.log.append("inject drop_enqueue: queued run message lost")
        else:
            raise ScenarioError(f"unknown inject kind {kind}")


def run_steps(ctx: Ctx, steps: list[dict]) -> None:
    for i, step in enumerate(steps, start=1):
        try:
            _step(ctx, step)
        except ScenarioError as exc:
            raise ScenarioError(f"step {i} ({step['do']}): {exc}") from None
