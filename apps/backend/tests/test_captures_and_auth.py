from __future__ import annotations

from app.db import models as m
from app.db.session import new_session
from sqlalchemy import func, select

from .conftest import auth, capture_body


def _count(model) -> int:
    with new_session() as s:
        return s.scalar(select(func.count()).select_from(model)) or 0


def test_requires_authentication(client):
    assert client.post("/api/captures", json=capture_body()).status_code == 401
    r = client.get("/api/workflows", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthenticated"
    assert r.json()["error"]["requestId"]


def test_capture_creates_workflow_and_never_claims_analysis(client, queue):
    r = client.post("/api/captures", json=capture_body(), headers=auth())
    assert r.status_code == 201
    body = r.json()
    assert body["created"] is True
    assert body["workflow"]["status"] == "captured"  # not analysed yet
    assert body["capture"]["status"] == "submitted"
    assert body["nextUrl"] == f"/workflows/{body['workflow']['id']}"
    assert len(queue.run_ids) == 1  # analysis is enqueued, not claimed done


def test_capture_is_idempotent_on_key(client, queue):
    first = client.post("/api/captures", json=capture_body("same-key-123"), headers=auth())
    second = client.post("/api/captures", json=capture_body("same-key-123"), headers=auth())
    assert first.status_code == 201 and second.status_code == 200
    assert second.json()["created"] is False
    assert second.json()["capture"]["id"] == first.json()["capture"]["id"]
    assert _count(m.Capture) == 1 and _count(m.Workflow) == 1
    assert len(queue.run_ids) == 1  # replay does not enqueue again


def test_idempotency_key_is_scoped_per_user(client):
    a = client.post("/api/captures", json=capture_body("shared-key-1"), headers=auth("alice"))
    b = client.post("/api/captures", json=capture_body("shared-key-1"), headers=auth("bob"))
    assert a.status_code == b.status_code == 201
    assert a.json()["capture"]["id"] != b.json()["capture"]["id"]


def test_removed_source_url_is_persisted_as_null(client):
    r = client.post(
        "/api/captures",
        json=capture_body("nourl-12345", sourceUrl=None, sourceDomain=None, sourcePageTitle=None),
        headers=auth(),
    )
    assert r.status_code == 201
    cap = r.json()["capture"]
    assert cap["sourceUrl"] is None and cap["sourceDomain"] is None and cap["sourcePageTitle"] is None


def test_oversize_capture_is_rejected_not_truncated(client):
    r = client.post("/api/captures", json=capture_body("big-123456", contentText="x" * 20_001), headers=auth())
    assert r.status_code in (400, 413)
    assert _count(m.Capture) == 0


def test_validation_errors_do_not_echo_submitted_text(client):
    secret = "my private health note"
    r = client.post("/api/captures", json={"contentText": secret, "sourceType": "bogus", "idempotencyKey": "k"}, headers=auth())
    assert r.status_code == 400
    assert secret not in r.text


def test_user_cannot_read_modify_or_delete_another_users_data(client):
    created = client.post("/api/captures", json=capture_body(), headers=auth("alice")).json()
    cap_id, wf_id = created["capture"]["id"], created["workflow"]["id"]
    bob = auth("bob")
    assert client.get(f"/api/captures/{cap_id}", headers=bob).status_code == 403
    assert client.get(f"/api/workflows/{wf_id}", headers=bob).status_code == 403
    assert client.patch(f"/api/workflows/{wf_id}", json={"version": 1, "title": "pwned"}, headers=bob).status_code == 403
    assert client.post(f"/api/workflows/{wf_id}/cancel", headers=bob).status_code == 403
    assert client.delete(f"/api/captures/{cap_id}", headers=bob).status_code == 403
    assert client.get("/api/workflows", headers=bob).json() == []
    assert client.get("/api/captures", headers=bob).json() == []
    # untouched
    assert client.get(f"/api/workflows/{wf_id}", headers=auth("alice")).json()["workflow"]["title"] != "pwned"


def test_missing_item_is_404(client):
    r = client.get("/api/workflows/00000000-0000-0000-0000-000000000000", headers=auth())
    assert r.status_code == 404


def test_delete_capture_removes_workflow_and_derived_data(client):
    created = client.post("/api/captures", json=capture_body(), headers=auth()).json()
    cap_id = created["capture"]["id"]
    r = client.delete(f"/api/captures/{cap_id}", headers=auth())
    assert r.status_code == 200 and r.json()["deleted"] is True
    assert _count(m.Capture) == 0 and _count(m.Workflow) == 0
    with new_session() as s:
        kinds = s.scalars(select(m.ActivityEvent.event_type)).all()
    assert kinds == ["capture_deleted"]  # only a minimal audit event remains


def test_workflow_patch_version_conflict(client):
    wf = client.post("/api/captures", json=capture_body(), headers=auth()).json()["workflow"]
    ok = client.patch(f"/api/workflows/{wf['id']}", json={"version": 1, "title": "Proposal"}, headers=auth())
    assert ok.status_code == 200 and ok.json()["version"] == 2
    stale = client.patch(f"/api/workflows/{wf['id']}", json={"version": 1, "title": "Other"}, headers=auth())
    assert stale.status_code == 409


def test_pause_resume_cancel_are_idempotent(client):
    wf_id = client.post("/api/captures", json=capture_body(), headers=auth()).json()["workflow"]["id"]
    for _ in range(2):
        assert client.post(f"/api/workflows/{wf_id}/pause", headers=auth()).json()["paused"] is True
    for _ in range(2):
        assert client.post(f"/api/workflows/{wf_id}/resume", headers=auth()).json()["paused"] is False
    for _ in range(2):
        assert client.post(f"/api/workflows/{wf_id}/cancel", headers=auth()).json()["status"] == "cancelled"
    events = client.get(f"/api/workflows/{wf_id}/activity", headers=auth()).json()["items"]
    assert [e["eventType"] for e in events].count("workflow_cancelled") == 1


def test_workflow_detail_shape_and_resume_card(client):
    wf_id = client.post("/api/captures", json=capture_body(), headers=auth()).json()["workflow"]["id"]
    d = client.get(f"/api/workflows/{wf_id}", headers=auth()).json()
    assert d["requirements"] == [] and d["questions"] == [] and d["tasks"] == []
    assert d["sources"][0]["sourceKind"] == "capture"
    assert d["resume"]["sourceTitle"] == "Re: Proposal"
    assert d["resume"]["userNote"] == "What do I need to do?"


def test_preferences_roundtrip_and_reset(client):
    assert client.get("/api/preferences", headers=auth()).json()["isSet"] is False
    r = client.patch("/api/preferences", json={"taskGranularity": "small_steps", "planLayout": "one_step"}, headers=auth())
    body = r.json()
    assert body["taskGranularity"] == "small_steps" and body["planLayout"] == "one_step"
    assert body["isSet"] is True and body["consentVersion"]
    assert client.patch("/api/preferences", json={"taskGranularity": "nope"}, headers=auth()).status_code == 400
    reset = client.delete("/api/preferences", headers=auth()).json()
    assert reset["isSet"] is False and reset["taskGranularity"] == "balanced"


# ------------------------------------------------------------------ extension credentials


def _connect(client, uid="alice"):
    r = client.post("/api/extension/connect", json={"extensionId": "abcdefghijklmnop"}, headers=auth(uid))
    assert r.status_code == 200, r.text
    return r.json()


def test_extension_token_can_only_save_captures(client):
    tok = _connect(client)
    assert tok["scopes"] == ["captures:write"]
    ext = {"Authorization": f"Bearer {tok['accessToken']}"}
    assert client.post("/api/captures", json=capture_body("ext-key-1234"), headers=ext).status_code == 201
    for path in ("/api/workflows", "/api/captures", "/api/preferences", "/api/me", "/api/activity"):
        assert client.get(path, headers=ext).status_code == 403, path
    # cannot mint more credentials
    assert client.post("/api/extension/connect", json={"extensionId": "abcdefghijklmnop"}, headers=ext).status_code == 403
    # the capture belongs to the connected user
    assert len(client.get("/api/captures", headers=auth("alice")).json()) == 1


def test_extension_refresh_rotates_and_revoke_blocks_everything(client):
    tok = _connect(client)
    r1 = client.post("/api/extension/refresh", json={"refreshToken": tok["refreshToken"]})
    assert r1.status_code == 200
    # old refresh token no longer works (rotation)
    assert client.post("/api/extension/refresh", json={"refreshToken": tok["refreshToken"]}).status_code == 401

    devices = client.get("/api/extension/devices", headers=auth()).json()
    assert len(devices) == 1
    assert client.delete(f"/api/extension/devices/{devices[0]['id']}", headers=auth()).status_code == 200
    ext = {"Authorization": f"Bearer {r1.json()['accessToken']}"}
    assert client.post("/api/captures", json=capture_body("after-revoke-1"), headers=ext).status_code == 401
    assert client.post("/api/extension/refresh", json={"refreshToken": r1.json()["refreshToken"]}).status_code == 401


def test_other_user_cannot_revoke_my_device(client):
    _connect(client, "alice")
    dev_id = client.get("/api/extension/devices", headers=auth("alice")).json()[0]["id"]
    assert client.delete(f"/api/extension/devices/{dev_id}", headers=auth("bob")).status_code == 403


def test_tampered_extension_token_is_rejected(client):
    tok = _connect(client)["accessToken"]
    bad = {"Authorization": f"Bearer {tok[:-4]}AAAA"}
    assert client.post("/api/captures", json=capture_body("tamper-1234"), headers=bad).status_code == 401


def test_cors_allows_web_origin_only(client):
    ok = client.options(
        "/api/captures",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    evil = client.options(
        "/api/captures",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in evil.headers


def test_first_requests_race_creates_one_user_and_no_500s():
    """After sign-in the web app fires several requests at once; each used to INSERT the same user."""
    from concurrent.futures import ThreadPoolExecutor

    from fastapi.testclient import TestClient

    from app.main import create_app

    app = create_app()

    def hit(_i: int) -> int:
        with TestClient(app, raise_server_exceptions=False) as c:
            return c.get("/api/me", headers=auth("newcomer")).status_code

    with ThreadPoolExecutor(12) as ex:
        codes = list(ex.map(hit, range(12)))
    assert codes == [200] * 12
    assert _count(m.User) == 1
