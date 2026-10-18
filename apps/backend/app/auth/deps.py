"""Authentication dependencies. Identity comes ONLY from a verified token, never from a request body."""

from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass

import jwt
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..db.models import ExtensionDevice, User
from ..db.session import get_session
from ..errors import forbidden, rate_limited, unauthenticated
from . import firebase, tokens

WEB_SCOPE = "*"


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    scopes: tuple[str, ...]
    device_id: uuid.UUID | None = None

    @property
    def is_web(self) -> bool:
        return WEB_SCOPE in self.scopes


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise unauthenticated()
    return token.strip()


def upsert_user(session: Session, ident: firebase.FirebaseIdentity) -> User:
    user = session.scalar(select(User).where(User.firebase_uid == ident.uid))
    if user is None:
        user = User(
            firebase_uid=ident.uid, email=ident.email, display_name=ident.name, photo_url=ident.picture
        )
        session.add(user)
        session.flush()
    else:
        user.email = ident.email or user.email
        user.display_name = ident.name or user.display_name
        user.photo_url = ident.picture or user.photo_url
    return user


def _principal(request: Request, session: Session, settings: Settings) -> Principal:
    token = _bearer(request)
    if tokens.is_extension_token(token):
        try:
            claims = tokens.verify_access_token(settings, token)
        except jwt.PyJWTError:
            raise unauthenticated("Your Ritme connection expired. Please reconnect.") from None
        device = session.get(ExtensionDevice, claims.device_id)
        if device is None or device.revoked_at is not None or device.user_id != claims.user_id:
            raise unauthenticated("This connection was removed. Please reconnect.")
        return Principal(claims.user_id, claims.scopes, claims.device_id)
    try:
        ident = firebase.verify_firebase_token(token)
    except Exception:  # firebase_admin raises several error types; all mean "not authenticated"
        raise unauthenticated() from None
    user = upsert_user(session, ident)
    return Principal(user.id, (WEB_SCOPE,))


def current_principal(
    request: Request, session: Session = Depends(get_session), settings: Settings = Depends(get_settings)
) -> Principal:
    principal = _principal(request, session, settings)
    request.state.user_id = principal.user_id
    return principal


def web_user(principal: Principal = Depends(current_principal)) -> uuid.UUID:
    """Full web session required. Extension tokens are rejected here (403)."""
    if not principal.is_web:
        raise forbidden("This connection can only save captures.")
    return principal.user_id


def capture_writer(principal: Principal = Depends(current_principal)) -> Principal:
    if not principal.is_web and tokens.SCOPE_CAPTURES_WRITE not in principal.scopes:
        raise forbidden("This connection can only save captures.")
    return principal


# ---------------------------------------------------------------- rate limiting
# Per-instance sliding window. It protects the model/capture endpoints from bursts; workflow
# correctness never depends on it (that lives in the database).

_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(bucket: str):
    def dep(user: Principal = Depends(current_principal), settings: Settings = Depends(get_settings)) -> None:
        now = time.monotonic()
        q = _hits[f"{bucket}:{user.user_id}"]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= settings.rate_limit_per_minute:
            raise rate_limited()
        q.append(now)

    return dep


def reset_rate_limits() -> None:
    _hits.clear()
