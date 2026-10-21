"""Extension connection: short-lived, scope-limited credentials (spec §5, §11)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from ritme_contracts import (
    ConnectedDevice,
    ExtensionConnectRequest,
    ExtensionRefreshRequest,
    ExtensionTokenResponse,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import tokens
from ..auth.deps import web_user
from ..config import Settings, get_settings
from ..db import models as m
from ..db.session import get_session
from ..errors import unauthenticated
from ..repos import get_owned, log_event

router = APIRouter(prefix="/extension")


def _device_out(d: m.ExtensionDevice) -> ConnectedDevice:
    return ConnectedDevice(
        id=d.id, label=d.label, created_at=d.created_at, last_used_at=d.last_used_at, revoked_at=d.revoked_at
    )


def _response(settings: Settings, user_id: uuid.UUID, device_id: uuid.UUID, refresh: str) -> ExtensionTokenResponse:
    access, exp = tokens.issue_access_token(settings, user_id, device_id)
    return ExtensionTokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_at=exp,
        scopes=[tokens.SCOPE_CAPTURES_WRITE],
        device_id=device_id,
    )


@router.post("/connect", response_model=ExtensionTokenResponse, response_model_by_alias=True)
def connect(
    body: ExtensionConnectRequest,
    user_id: uuid.UUID = Depends(web_user),  # needs the real web session — extension tokens cannot mint more
    session: Session = Depends(get_session, scope="function"),
    settings: Settings = Depends(get_settings),
) -> ExtensionTokenResponse:
    refresh = tokens.new_refresh_token()
    device = m.ExtensionDevice(
        user_id=user_id,
        extension_id=body.extension_id,
        label=body.label,
        refresh_token_hash=tokens.hash_refresh(refresh),
    )
    session.add(device)
    session.flush()
    log_event(session, user_id, "extension_connected", "A browser extension was connected.")
    return _response(settings, user_id, device.id, refresh)


@router.post("/refresh", response_model=ExtensionTokenResponse, response_model_by_alias=True)
def refresh(
    body: ExtensionRefreshRequest,
    session: Session = Depends(get_session, scope="function"),
    settings: Settings = Depends(get_settings),
) -> ExtensionTokenResponse:
    device = session.scalar(
        select(m.ExtensionDevice).where(m.ExtensionDevice.refresh_token_hash == tokens.hash_refresh(body.refresh_token))
    )
    now = datetime.now(UTC)
    if (
        device is None
        or device.revoked_at is not None
        or now - device.created_at > timedelta(days=settings.extension_refresh_ttl_days)
    ):
        raise unauthenticated("Your Ritme connection expired. Please reconnect.")
    new_refresh = tokens.new_refresh_token()  # rotate on every use
    device.refresh_token_hash = tokens.hash_refresh(new_refresh)
    device.last_used_at = now
    return _response(settings, device.user_id, device.id, new_refresh)


@router.get("/devices", response_model=list[ConnectedDevice], response_model_by_alias=True)
def devices(user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> list[ConnectedDevice]:
    rows = session.scalars(
        select(m.ExtensionDevice).where(m.ExtensionDevice.user_id == user_id).order_by(m.ExtensionDevice.created_at.desc())
    ).all()
    return [_device_out(d) for d in rows]


@router.delete("/devices/{device_id}", response_model=ConnectedDevice, response_model_by_alias=True)
def revoke(device_id: uuid.UUID, user_id: uuid.UUID = Depends(web_user), session: Session = Depends(get_session, scope="function")) -> ConnectedDevice:
    d = get_owned(session, m.ExtensionDevice, device_id, user_id, "Device")
    if d.revoked_at is None:
        d.revoked_at = datetime.now(UTC)
        log_event(session, user_id, "extension_revoked", "A browser extension connection was removed.")
    return _device_out(d)
