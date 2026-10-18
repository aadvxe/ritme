"""Package boundaries that import-linter cannot express (spec §6, §20)."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
LLM_SDK = re.compile(r"^\s*(from\s+google\s+import\s+genai|from\s+google\.genai|import\s+google\.genai)", re.M)
SERVER_ONLY = re.compile(r"^\s*(from|import)\s+(firebase_admin|sqlalchemy|psycopg|fastapi)\b", re.M)


def _py_files(*parts: str) -> list[Path]:
    return [p for p in (ROOT.joinpath(*parts)).rglob("*.py") if ".venv" not in p.parts]


def test_llm_sdk_is_imported_only_inside_ai_engine_llm_package():
    offenders = []
    for base in (("apps",), ("packages",)):
        for f in _py_files(*base):
            if LLM_SDK.search(f.read_text(encoding="utf-8")) and "ritme_ai/llm" not in f.as_posix():
                offenders.append(f.relative_to(ROOT).as_posix())
    assert not offenders, f"google.genai imported outside ritme_ai/llm: {offenders}"


def test_contracts_and_engine_have_no_database_or_web_framework_imports():
    offenders = []
    for base in (("packages", "contracts", "src"), ("packages", "ai-engine", "src")):
        for f in _py_files(*base):
            if SERVER_ONLY.search(f.read_text(encoding="utf-8")):
                offenders.append(f.relative_to(ROOT).as_posix())
    assert not offenders, offenders


def test_no_service_account_keys_or_secrets_committed():
    risky = re.compile(r"BEGIN (RSA )?PRIVATE KEY|\"type\":\s*\"service_account\"|AIza[0-9A-Za-z_\-]{30,}")
    hits = []
    for base in ("apps", "packages", "infra", "docs"):
        for f in (ROOT / base).rglob("*"):
            if f.is_file() and f.suffix in {".py", ".ts", ".tsx", ".json", ".md", ".yml", ".yaml", ".env", ".toml"} and "node_modules" not in f.parts and ".venv" not in f.parts:
                if risky.search(f.read_text(encoding="utf-8", errors="ignore")):
                    hits.append(f.relative_to(ROOT).as_posix())
    assert not hits, hits
