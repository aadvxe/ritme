"""Short-lived, scope-limited extension credentials (spec §5, §11).

Access token: HS256 JWT, 15 min, scope `captures:write` only. Refresh token: random, stored hashed,
revocable per device. The extension never receives the user's Firebase session.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt

from ..config import Settings

ISSUER = "ritme-extension"
SCOPE_CAPTURES_WRITE = "captures:write"


@dataclass(frozen=True)
class ExtensionClaims:
    user_id: uuid.UUID
    device_id: uuid.UUID
    scopes: tuple[str, ...]


def hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def issue_access_token(
    settings: Settings, user_id: uuid.UUID, device_id: uuid.UUID, now: datetime | None = None
) -> tuple[str, datetime]:
    now = now or datetime.now(UTC)
    exp = now + timedelta(seconds=settings.extension_access_ttl_seconds)
    token = jwt.encode(
        {
            "iss": ISSUER,
            "sub": str(user_id),
            "dev": str(device_id),
            "scope": SCOPE_CAPTURES_WRITE,
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        },
        settings.token_secret,
        algorithm="HS256",
    )
    return token, exp


def is_extension_token(token: str) -> bool:
    try:
        return jwt.decode(token, options={"verify_signature": False}).get("iss") == ISSUER
    except jwt.PyJWTError:
        return False


def verify_access_token(settings: Settings, token: str) -> ExtensionClaims:
    data = jwt.decode(token, settings.token_secret, algorithms=["HS256"], issuer=ISSUER)
    return ExtensionClaims(
        user_id=uuid.UUID(data["sub"]),
        device_id=uuid.UUID(data["dev"]),
        scopes=tuple(str(data["scope"]).split()),
    )
