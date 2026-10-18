"""Environment + app boot. `configure()` MUST run before anything imports `app` (settings are cached)."""

from __future__ import annotations

import os

DEFAULT_EVAL_DB = "postgresql+psycopg://ritme:ritme_local_only@localhost:5433/ritme_eval"


def configure(live: bool) -> None:
    os.environ["DATABASE_URL"] = os.environ.get("EVAL_DATABASE_URL", DEFAULT_EVAL_DB)
    os.environ["ENVIRONMENT"] = "local"
    os.environ["LLM_PROVIDER"] = "vertex" if live else "fake"
    os.environ["RUN_QUEUE"] = "local"
    # Evals fire many requests per minute from one identity; the rate limiter is not under test.
    os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "100000")
    os.environ.setdefault("LOG_LEVEL", "error")  # keep the report readable; run_failed lines are expected in failure scenarios


def prepare_database() -> str:
    """Create the eval database if missing and rebuild the schema. Refuses non-eval databases."""
    import psycopg
    from app.config import get_settings
    from app.db.models import Base
    from app.db.session import get_engine
    from sqlalchemy.engine import make_url

    url = make_url(get_settings().resolved_database_url)
    if not url.database or not ("eval" in url.database or "test" in url.database):
        raise SystemExit(
            f"Refusing to wipe database '{url.database}': the eval runner only drops/truncates "
            "databases whose name contains 'eval' or 'test'. Set EVAL_DATABASE_URL."
        )
    admin = url.set(drivername="postgresql", database="postgres")
    with psycopg.connect(admin.render_as_string(hide_password=False), autocommit=True) as conn:
        if not conn.execute("select 1 from pg_database where datname = %s", (url.database,)).fetchone():
            conn.execute(f'create database "{url.database}"')
    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    return url.database


def truncate_all() -> None:
    from app.auth import deps
    from app.db.models import Base
    from app.db.session import get_engine
    from sqlalchemy import text

    with get_engine().begin() as conn:
        names = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
        conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    deps.reset_rate_limits()


def install_fake_firebase() -> None:
    """Tokens look like `test:<uid>`; no Firebase project or emulator needed (same as pytest conftest)."""
    from app.auth import firebase

    def verify(token: str) -> firebase.FirebaseIdentity:
        if not token.startswith("test:"):
            raise ValueError("bad token")
        uid = token.split(":", 1)[1]
        return firebase.FirebaseIdentity(uid=uid, email=f"{uid}@example.test", name=uid.title(), picture=None)

    firebase.verify_firebase_token = verify  # type: ignore[assignment]


class RecordingQueue:
    def __init__(self) -> None:
        self.run_ids: list = []

    def enqueue(self, run_id) -> None:  # type: ignore[no-untyped-def]
        self.run_ids.append(run_id)
