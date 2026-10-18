"""Private worker service (ROLE=worker). Only Cloud Tasks may call it.

Cloud Tasks sends an OIDC token for the invoker service account. In production the worker is also
deployed as a non-public Cloud Run service (IAM `run.invoker` for that account only), so this check
is defence in depth. Local development uses the in-process queue and does not need this app.
"""

from __future__ import annotations

import uuid

from fastapi import FastAPI, Header, HTTPException

from ..config import get_settings
from ..logging import configure_logging, get_logger
from .orchestrator import execute_run

log = get_logger()


def _verify_oidc(authorization: str | None) -> None:
    s = get_settings()
    if s.environment == "local":
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401)
    from google.auth.transport import requests as g_requests  # noqa: PLC0415
    from google.oauth2 import id_token  # noqa: PLC0415

    try:
        id_token.verify_oauth2_token(authorization.split(" ", 1)[1], g_requests.Request(), audience=s.worker_audience or s.worker_url)
    except Exception:
        raise HTTPException(status_code=403) from None


def create_worker_app() -> FastAPI:
    configure_logging(get_settings().log_level)
    app = FastAPI(title="Ritme worker", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok", "role": "worker"}

    @app.post("/internal/runs/{run_id}")
    def run(run_id: uuid.UUID, authorization: str | None = Header(default=None)) -> dict[str, str]:
        _verify_oidc(authorization)
        # execute_run is idempotent: finished runs are ignored, interrupted runs resume from stored state.
        execute_run(run_id)
        log.info("run_executed", run_id=str(run_id))
        return {"status": "done"}

    return app


app = create_worker_app()
