"""Fixtures. No network, no GCP: everything uses FakeLlm."""

from __future__ import annotations

import pytest
from ritme_ai import Engine
from ritme_ai.llm.fake import FakeLlm


@pytest.fixture
def llm() -> FakeLlm:
    return FakeLlm()


@pytest.fixture
def engine(llm: FakeLlm) -> Engine:
    return Engine(llm, timeout_ms=5000)
