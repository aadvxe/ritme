from __future__ import annotations

import os

# Must be set before the app imports settings.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://ritme:ritme_local_only@localhost:5433/ritme_test"
)
os.environ["ENVIRONMENT"] = "local"
os.environ["LLM_PROVIDER"] = "fake"
os.environ["RUN_QUEUE"] = "local"

import psycopg  # noqa: E402
import pytest  # noqa: E402
from app.auth import deps, firebase  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db.models import Base  # noqa: E402
from app.db.session import get_engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.queue import set_queue  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402


class RecordingQueue:
    def __init__(self) -> None:
        self.run_ids: list = []

    def enqueue(self, run_id) -> None:  # type: ignore[no-untyped-def]
        self.run_ids.append(run_id)


def _ensure_database() -> None:
    url = make_url(get_settings().resolved_database_url)
    admin = url.set(drivername="postgresql", database="postgres")
    with psycopg.connect(admin.render_as_string(hide_password=False), autocommit=True) as conn:
        exists = conn.execute("select 1 from pg_database where datname = %s", (url.database,)).fetchone()
        if not exists:
            conn.execute(f'create database "{url.database}"')


@pytest.fixture(scope="session", autouse=True)
def _schema():
    _ensure_database()
    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def _clean(_schema):
    engine = get_engine()
    with engine.begin() as conn:
        names = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
        conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    deps.reset_rate_limits()
    yield


@pytest.fixture(autouse=True)
def _fake_firebase(monkeypatch):
    """Tokens look like `test:<uid>`; no Firebase project or emulator needed."""

    def verify(token: str) -> firebase.FirebaseIdentity:
        if not token.startswith("test:"):
            raise ValueError("bad token")
        uid = token.split(":", 1)[1]
        return firebase.FirebaseIdentity(uid=uid, email=f"{uid}@example.test", name=uid.title(), picture=None)

    monkeypatch.setattr(firebase, "verify_firebase_token", verify)


@pytest.fixture
def queue():
    q = RecordingQueue()
    set_queue(q)
    yield q
    set_queue(None)


@pytest.fixture
def client(queue):
    with TestClient(create_app(), raise_server_exceptions=False) as c:
        yield c


def auth(uid: str = "alice") -> dict[str, str]:
    return {"Authorization": f"Bearer test:{uid}"}


def capture_body(key: str = "key-12345678", **over):
    body = {
        "contentText": "Can you get the proposal over the line by Friday? Let's make sure everyone is aligned before we send it.",
        "sourceType": "browser_selection",
        "idempotencyKey": key,
        "sourceUrl": "https://mail.example.com/thread/1",
        "sourcePageTitle": "Re: Proposal",
        "userNote": "What do I need to do?",
    }
    body.update(over)
    return body
