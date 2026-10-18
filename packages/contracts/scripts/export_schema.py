"""Export every public contract as one JSON Schema bundle for the TypeScript api-client.

Request models (Create/Request/Patch/Connect…) use *validation* mode so defaulted fields are
optional for callers; everything else uses *serialization* mode so response fields are required.

Run: uv run python packages/contracts/scripts/export_schema.py [--check]
"""

from __future__ import annotations

import inspect
import json
import re
import sys
from enum import Enum
from pathlib import Path

import ritme_contracts as c
from pydantic import BaseModel
from pydantic.json_schema import models_json_schema

OUT = Path(__file__).resolve().parents[1] / "schema" / "ritme.schema.json"
REQUEST_RE = re.compile(r"(Create|Request|Patch)$")


def _public_models() -> list[type[BaseModel]]:
    models = []
    for name, obj in vars(c).items():
        if name.startswith("_") or not inspect.isclass(obj):
            continue
        if obj.__module__.startswith("ritme_contracts") and issubclass(obj, BaseModel) and obj is not c.RitmeModel:
            models.append(obj)
    return sorted(models, key=lambda m: m.__name__)


def _enums() -> list[type[Enum]]:
    return sorted(
        (o for n, o in vars(c).items() if inspect.isclass(o) and issubclass(o, Enum) and o.__module__.startswith("ritme_contracts")),
        key=lambda e: e.__name__,
    )


def build() -> dict:
    models = _public_models()
    pairs = [(m, "validation" if REQUEST_RE.search(m.__name__) else "serialization") for m in models]
    _, defs = models_json_schema(pairs, ref_template="#/$defs/{model}")
    schema_defs = defs.get("$defs", {})
    # Enums only reachable through models are already in $defs; add stand-alone ones (e.g. ErrorCode).
    for e in _enums():
        schema_defs.setdefault(e.__name__, {"title": e.__name__, "enum": [m.value for m in e], "type": "string"})
    names = sorted(schema_defs)
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "RitmeContracts",
        "type": "object",
        "additionalProperties": False,
        "properties": {n: {"$ref": f"#/$defs/{n}"} for n in names},
        "$defs": schema_defs,
    }


def main() -> int:
    text = json.dumps(build(), indent=2, sort_keys=True) + "\n"
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("contracts drift: run `pnpm contracts:gen`", file=sys.stderr)
            return 1
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
