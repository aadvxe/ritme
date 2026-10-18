"""google.genai only inside ritme_ai/llm/; the engine imports no backend, DB or HTTP framework.

`uv run lint-imports` enforces this too; this test keeps the rule checked even where the
import-linter contract cannot express it (it cannot forbid a sub-package of an external package).
"""

from __future__ import annotations

import ast
from pathlib import Path

import ritme_ai

ENGINE_SRC = Path(ritme_ai.__file__).parent
REPO = ENGINE_SRC.parents[3]
FORBIDDEN_IN_ENGINE = {"sqlalchemy", "fastapi", "psycopg", "app", "firebase_admin"}


def imported_modules(path: Path) -> set[str]:
    found: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            found.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            found.add(node.module)
            found.update(f"{node.module}.{a.name}" for a in node.names)
    return found


def uses_genai(path: Path) -> bool:
    return any(m == "google.genai" or m.startswith("google.genai.") for m in imported_modules(path))


def test_google_genai_is_imported_only_inside_llm_package():
    offenders = []
    roots = [ENGINE_SRC, REPO / "apps" / "backend", REPO / "packages" / "contracts" / "src"]
    for root in roots:
        for path in root.rglob("*.py"):
            if ".venv" in path.parts or "tests" in path.parts:
                continue
            inside_llm = path.is_relative_to(ENGINE_SRC / "llm")
            if uses_genai(path) and not inside_llm:
                offenders.append(str(path.relative_to(REPO)))
    assert offenders == []


def test_vertex_adapter_is_the_only_module_that_imports_the_sdk():
    users = {p.name for p in (ENGINE_SRC / "llm").glob("*.py") if uses_genai(p)}
    assert users == {"vertex.py"}


def test_engine_never_imports_backend_db_or_http_framework():
    for path in ENGINE_SRC.rglob("*.py"):
        top = {m.split(".")[0] for m in imported_modules(path)}
        assert not (top & FORBIDDEN_IN_ENGINE), path


def test_vertex_adapter_uses_adc_only():
    source = (ENGINE_SRC / "llm" / "vertex.py").read_text(encoding="utf-8")
    assert "google.auth.default" in source
    for needle in ("api_key", "API_KEY", "service_account", "from_service_account"):
        assert needle not in source, needle
