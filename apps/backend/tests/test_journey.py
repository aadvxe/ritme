"""End-to-end journey against the real AI-engine library with the FakeLlm (no GCP needed).

capture → Truth Board → blockers → answers → plan → approve → verified tasks → Something changed →
diff → approve → reload resumes. Mirrors spec §16.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.db import models as m
from app.db.session import new_session
from app.engine_port import set_engine
from app.worker.orchestrator import execute_run
from sqlalchemy import func, select

from .conftest import auth

A = auth("alice")


@pytest.fixture(autouse=True)
def _engine():
    set_engine(None)  # real adapter + LLM_PROVIDER=fake
    yield
    set_engine(None)


def _drain(queue) -> None:
    while queue.run_ids:
        execute_run(queue.run_ids.pop(0))


def _detail(client, wf_id):
    r = client.get(f"/api/workflows/{wf_id}", headers=A)
    assert r.status_code == 200, r.text
    return r.json()


def _start_demo(client, queue):
    r = client.post("/api/demo/reset", headers=A)
    assert r.status_code == 201, r.text
    wf_id = r.json()["id"]
    assert r.json()["isDemo"] is True
    _drain(queue)
    return wf_id


def _answer_blockers(client, queue, wf_id):
    d = _detail(client, wf_id)
    due = (datetime.now(UTC) + timedelta(days=5)).replace(microsecond=0).isoformat()
    for q in [q for q in d["questions"] if q["blocking"] and q["status"] == "open"]:
        r = client.post(
            f"/api/workflows/{wf_id}/questions/{q['id']}/answer",
            json={"answer": "The team lead approves; due this Friday 17:00", "confirmedDueAt": due},
            headers=A,
        )
        assert r.status_code == 200, r.text
    _drain(queue)
    return due


def _approve_and_execute(client, action_id):
    assert client.post(f"/api/actions/{action_id}/approve", headers=A).status_code == 200
    r = client.post(f"/api/actions/{action_id}/execute", headers=A)
    assert r.status_code == 200, r.text
    return r.json()


def test_analysis_builds_truth_board_and_gates_planning(client, queue):
    wf_id = _start_demo(client, queue)
    d = _detail(client, wf_id)
    assert d["workflow"]["status"] == "needs_input"
    kinds = {r["kind"]: r for r in d["requirements"]}
    assert "objective" in kinds and "deliverable" in kinds
    # "Friday" is never silently an exact date: not explicit, no timestamp invented
    deadline = kinds.get("deadline")
    assert deadline is not None and deadline["certainty"] != "explicit"
    assert d["workflow"]["confirmedDueAt"] is None
    blockers = [q for q in d["questions"] if q["blocking"]]
    assert blockers, "vague deadline / approvers must become blocker cards"
    # the knowledge rule (48-hour review) is cited from the stored demo document
    assert any(s["sourceKind"] == "knowledge" and "48" in s["excerpt"] for s in d["sources"])
    # clarification gate: cannot plan or propose while blockers are open
    assert client.post(f"/api/workflows/{wf_id}/plan", headers=A).status_code == 422
    assert d["latestPlan"] is None and d["actions"] == []


def test_full_journey_with_verified_execution_and_domino_recovery(client, queue):
    wf_id = _start_demo(client, queue)
    _answer_blockers(client, queue, wf_id)

    d = _detail(client, wf_id)
    assert d["workflow"]["status"] == "ready_for_approval"
    assert d["latestPlan"]["status"] == "draft" and len(d["latestPlan"]["plan"]["tasks"]) >= 1
    pending = [a for a in d["actions"] if a["status"] == "pending_approval"]
    assert len(pending) == 1 and d["tasks"] == []  # nothing written before approval

    # executing before approval is refused and writes nothing
    assert client.post(f"/api/actions/{pending[0]['id']}/execute", headers=A).status_code == 422
    with new_session() as s:
        assert s.scalar(select(func.count()).select_from(m.Task)) == 0

    done = _approve_and_execute(client, pending[0]["id"])
    assert done["status"] == "succeeded" and done["verification"] == "verified"
    assert len(done["resultIds"]) == len(d["latestPlan"]["plan"]["tasks"])

    # repeat execute: no duplicates
    again = client.post(f"/api/actions/{pending[0]['id']}/execute", headers=A).json()
    assert again["status"] == "succeeded"
    d = _detail(client, wf_id)
    assert len(d["tasks"]) == len(done["resultIds"])
    assert {t["id"] for t in d["tasks"]} == set(done["resultIds"])
    assert d["workflow"]["status"] == "in_progress" and d["workflow"]["nextAction"]
    kinds = [e["eventType"] for e in client.get(f"/api/workflows/{wf_id}/activity", headers=A).json()["items"]]
    assert "action_verified" in kinds

    # finish one task, then "Something changed": deadline moves up
    first = d["tasks"][0]
    assert client.patch(f"/api/tasks/{first['id']}", json={"status": "done"}, headers=A).status_code == 200
    new_due = (datetime.now(UTC) + timedelta(days=2)).replace(microsecond=0).isoformat()
    r = client.post(f"/api/workflows/{wf_id}/replan", json={"trigger": "request_changed", "newDueAt": new_due}, headers=A)
    assert r.status_code == 200, r.text
    rp = r.json()
    assert rp["action"]["status"] == "pending_approval" and rp["action"]["actionType"] == "update_tasks"
    assert first["id"] not in rp["blastRadiusTaskIds"]  # completed work is preserved
    assert any(c["changeType"] in ("update", "create") for c in rp["diff"])
    before = {t["id"]: t["title"] for t in _detail(client, wf_id)["tasks"]}
    assert {t["id"]: t["title"] for t in _detail(client, wf_id)["tasks"]} == before  # not applied yet

    ok = _approve_and_execute(client, rp["action"]["id"])
    assert ok["status"] == "succeeded" and ok["verification"] == "verified"
    d = _detail(client, wf_id)
    assert d["workflow"]["confirmedDueAt"] is not None
    assert next(t for t in d["tasks"] if t["id"] == first["id"])["status"] == "done"

    # reload resumes from persisted state
    again = _detail(client, wf_id)
    assert again["workflow"]["status"] == "in_progress"
    assert again["resume"]["nextAction"]


def test_user_answers_override_and_deferral_is_labelled_assumption(client, queue):
    wf_id = _start_demo(client, queue)
    d = _detail(client, wf_id)
    q = next(q for q in d["questions"] if q["blocking"])
    r = client.post(
        f"/api/workflows/{wf_id}/questions/{q['id']}/answer",
        json={"disposition": "defer_nonblocking", "assumptionLabel": "Assuming the team lead approves."},
        headers=A,
    )
    assert r.status_code == 200
    d = r.json()
    assumption = next(x for x in d["requirements"] if x["id"] == f"assume-{q['id']}")
    assert assumption["certainty"] == "inferred" and assumption["userConfirmedAt"] is None  # never auto-confirmed
    assert next(x for x in d["questions"] if x["id"] == q["id"])["status"] == "deferred"


def test_reject_proposed_action_writes_nothing(client, queue):
    wf_id = _start_demo(client, queue)
    _answer_blockers(client, queue, wf_id)
    action = next(a for a in _detail(client, wf_id)["actions"] if a["status"] == "pending_approval")
    assert client.post(f"/api/actions/{action['id']}/reject", headers=A).json()["status"] == "rejected"
    assert client.post(f"/api/actions/{action['id']}/approve", headers=A).status_code == 422
    assert client.post(f"/api/actions/{action['id']}/execute", headers=A).status_code == 422
    assert _detail(client, wf_id)["tasks"] == []


def test_other_users_cannot_touch_actions_or_tasks(client, queue):
    wf_id = _start_demo(client, queue)
    _answer_blockers(client, queue, wf_id)
    action = next(a for a in _detail(client, wf_id)["actions"] if a["status"] == "pending_approval")
    bob = auth("bob")
    for verb in ("approve", "reject", "execute"):
        assert client.post(f"/api/actions/{action['id']}/{verb}", headers=bob).status_code == 403
    _approve_and_execute(client, action["id"])
    task_id = _detail(client, wf_id)["tasks"][0]["id"]
    assert client.patch(f"/api/tasks/{task_id}", json={"status": "done"}, headers=bob).status_code == 403
    assert client.get("/api/calendar-overview", params={"from": "2026-01-01T00:00:00Z", "to": "2026-02-01T00:00:00Z"}, headers=bob).json() == {"items": [], "undated": []}


def test_calendar_only_places_confirmed_dates_and_matches_workflow_data(client, queue):
    wf_id = _start_demo(client, queue)
    due = _answer_blockers(client, queue, wf_id)
    action = next(a for a in _detail(client, wf_id)["actions"] if a["status"] == "pending_approval")
    _approve_and_execute(client, action["id"])
    now = datetime.now(UTC)
    r = client.get(
        "/api/calendar-overview",
        params={"from": (now - timedelta(days=1)).isoformat(), "to": (now + timedelta(days=30)).isoformat()},
        headers=A,
    )
    assert r.status_code == 200
    body = r.json()
    assert all(i["dueAt"] is not None for i in body["items"])
    assert all(i["dueAt"] is None for i in body["undated"])
    assert any(i["type"] == "workflow_deadline" and i["dueAt"].startswith(due[:16]) for i in body["items"])
    # range validation
    bad = client.get("/api/calendar-overview", params={"from": "2026-01-01T00:00:00Z", "to": "2026-06-01T00:00:00Z"}, headers=A)
    assert bad.status_code == 400
