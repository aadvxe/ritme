"""Async run queue port. Production = Cloud Tasks → private worker; local = in-process thread.

Runs are persisted first (`agent_runs`), then enqueued by id only, so a lost message can be re-sent
and a restarted worker resumes from stored state (spec §8.2 step 13).
"""

from __future__ import annotations

import threading
import uuid
from typing import Protocol

from ritme_contracts import AgentRunStatus, AgentRunTrigger
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import models as m
from .logging import get_logger

log = get_logger()


class RunQueue(Protocol):
    def enqueue(self, run_id: uuid.UUID) -> None: ...


class LocalQueue:
    """Runs the orchestrator in a background thread (development and tests)."""

    def enqueue(self, run_id: uuid.UUID) -> None:
        def _go() -> None:
            try:
                from .worker.orchestrator import execute_run
            except ImportError:  # orchestrator not built yet
                log.warning("run_not_executed", run_id=str(run_id), error_type="no_orchestrator")
                return
            execute_run(run_id)

        threading.Thread(target=_go, name=f"run-{run_id}", daemon=True).start()


class CloudTasksQueue:
    """Creates an HTTP task targeting the private worker with an OIDC token (service-account identity)."""

    def __init__(self, settings: Settings):
        from google.cloud import tasks_v2

        self._tasks = tasks_v2
        self._client = tasks_v2.CloudTasksClient()
        self._settings = settings

    def enqueue(self, run_id: uuid.UUID) -> None:
        s = self._settings
        parent = self._client.queue_path(s.gcp_project_id, s.gcp_region, s.cloud_tasks_queue)
        oidc_token: dict[str, str] = {"audience": s.worker_audience or s.worker_url}
        if s.invoker_sa_email:
            oidc_token["service_account_email"] = s.invoker_sa_email
        task = {
            "name": f"{parent}/tasks/run-{run_id}",  # task name = idempotent enqueue
            "http_request": {
                "http_method": self._tasks.HttpMethod.POST,
                "url": f"{s.worker_url.rstrip('/')}/internal/runs/{run_id}",
                "oidc_token": oidc_token,
            },
        }
        self._client.create_task(parent=parent, task=task)


_queue: RunQueue | None = None


def get_queue() -> RunQueue:
    global _queue
    if _queue is None:
        s = get_settings()
        _queue = CloudTasksQueue(s) if s.run_queue == "cloudtasks" else LocalQueue()
    return _queue


def set_queue(q: RunQueue | None) -> None:
    """Tests inject a recording queue."""
    global _queue
    _queue = q


def create_run(
    session: Session,
    user_id: uuid.UUID,
    workflow_id: uuid.UUID,
    trigger: AgentRunTrigger,
    params: dict | None = None,
) -> m.AgentRun:
    """Persist a run record. Caller commits, THEN calls `get_queue().enqueue(run.id)`."""
    run = m.AgentRun(
        user_id=user_id,
        workflow_id=workflow_id,
        trigger=trigger.value,
        status=AgentRunStatus.WAITING.value,
        input_json=params or {},
    )
    session.add(run)
    session.flush()
    return run
