"""FastAPI application (ROLE=api). Serves the JSON API and, when built, the static SPA."""

from __future__ import annotations

import time
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .api import routes_core, routes_extension, routes_misc, routes_workflow
from .config import get_settings
from .errors import AppError, install_error_handlers, too_large
from .logging import configure_logging, get_logger, request_id_var

log = get_logger()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(title="Ritme API", version="0.1.0", docs_url="/api/docs" if settings.environment == "local" else None)
    install_error_handlers(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "If-Match", "x-request-id"],
        expose_headers=["x-request-id"],
        max_age=600,
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token = request_id_var.set(rid)
        started = time.perf_counter()
        try:
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > settings.max_body_bytes:
                from .errors import _response  # noqa: PLC0415

                return _response(too_large("That request is too large."))
            response: Response = await call_next(request)
        except AppError as exc:
            from .errors import _response  # noqa: PLC0415

            response = _response(exc)
        response.headers["x-request-id"] = rid
        # Allowlisted fields only: never the body, headers, or query string values.
        route = request.scope.get("route")
        log.info(
            "request",
            method=request.method,
            route=getattr(route, "path", "unmatched"),
            status=response.status_code,
            duration_ms=round((time.perf_counter() - started) * 1000),
        )
        request_id_var.reset(token)
        return response

    @app.get("/healthz", include_in_schema=False)
    def healthz() -> dict[str, str]:
        return {"status": "ok", "role": settings.role}

    app.include_router(routes_core.router, prefix="/api")
    app.include_router(routes_workflow.router, prefix="/api")
    app.include_router(routes_misc.router, prefix="/api")
    app.include_router(routes_extension.router, prefix="/api")
    _mount_spa(app)
    return app


def _mount_spa(app: FastAPI) -> None:
    """Serve the built frontend from the same origin (spec §6) when apps/frontend/dist exists."""
    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if not dist.is_dir():
        return
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):  # type: ignore[no-untyped-def]
        if path.startswith("api/"):
            return JSONResponse({"error": {"code": "not_found", "message": "Not found.", "retryable": False, "requestId": request_id_var.get()}}, status_code=404)
        candidate = dist / path
        return FileResponse(candidate if candidate.is_file() else dist / "index.html")


app = create_app()
