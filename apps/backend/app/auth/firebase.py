"""Firebase ID token verification (firebase-admin). ADC only; no service-account key files."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

import firebase_admin
from firebase_admin import auth as fb_auth

from ..config import get_settings


@dataclass(frozen=True)
class FirebaseIdentity:
    uid: str
    email: str | None
    name: str | None
    picture: str | None


@lru_cache
def _app() -> firebase_admin.App:
    settings = get_settings()
    if settings.firebase_auth_emulator_host:
        # firebase-admin reads this env var to talk to the local Auth emulator.
        os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", settings.firebase_auth_emulator_host)
    return firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})


def verify_firebase_token(token: str) -> FirebaseIdentity:
    """Raises ValueError (or a firebase_admin error) when the token is invalid."""
    claims = fb_auth.verify_id_token(token, app=_app())
    return FirebaseIdentity(
        uid=claims["uid"],
        email=claims.get("email"),
        name=claims.get("name"),
        picture=claims.get("picture"),
    )
