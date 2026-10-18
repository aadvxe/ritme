"""Stable error shape (spec §10): { error: { code, message, retryable, requestId } }."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from ritme_contracts import ErrorBody, ErrorCode, ErrorResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .logging import get_logger, request_id_var

log = get_logger()


class AppError(Exception):
    def __init__(self, code: ErrorCode, message: str, status: int, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable


def invalid_input(message: str = "The request was not valid.") -> AppError:
    return AppError(ErrorCode.INVALID_INPUT, message, 400)


def unauthenticated(message: str = "Please sign in.") -> AppError:
    return AppError(ErrorCode.UNAUTHENTICATED, message, 401)


def forbidden(message: str = "You do not have access to this item.") -> AppError:
    return AppError(ErrorCode.FORBIDDEN, message, 403)


def not_found(what: str = "Item") -> AppError:
    return AppError(ErrorCode.NOT_FOUND, f"{what} was not found.", 404)


def conflict(message: str) -> AppError:
    return AppError(ErrorCode.CONFLICT, message, 409)


def invalid_action(message: str) -> AppError:
    return AppError(ErrorCode.INVALID_ACTION, message, 422)


def too_large(message: str) -> AppError:
    return AppError(ErrorCode.PAYLOAD_TOO_LARGE, message, 413)


def rate_limited() -> AppError:
    return AppError(ErrorCode.RATE_LIMITED, "Too many requests. Please wait a moment.", 429, True)


def _response(err: AppError) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorBody(
            code=err.code, message=err.message, retryable=err.retryable, request_id=request_id_var.get()
        )
    )
    return JSONResponse(status_code=err.status, content=body.model_dump(by_alias=True, mode="json"))


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _response(exc)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Report field locations only — never echo submitted values (they may be private text).
        fields = sorted({".".join(str(p) for p in e["loc"] if p != "body") for e in exc.errors()})
        return _response(invalid_input(f"Check these fields: {', '.join(f for f in fields if f)}."))

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        mapping = {
            401: ErrorCode.UNAUTHENTICATED,
            403: ErrorCode.FORBIDDEN,
            404: ErrorCode.NOT_FOUND,
            405: ErrorCode.INVALID_INPUT,
        }
        code = mapping.get(exc.status_code, ErrorCode.INTERNAL)
        return _response(AppError(code, "Request could not be completed.", exc.status_code))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        # Log the exception class only: messages can contain request content.
        log.error("unhandled_error", error_type=type(exc).__name__)
        return _response(AppError(ErrorCode.INTERNAL, "Something went wrong on our side.", 500, True))
