"""Metric computation. Every number is a ratio of counted things; denominators are always reported."""

from __future__ import annotations

import re
from typing import Any


def _blob(r: dict) -> str:
    return " ".join([r.get("text", "")] + [e["excerpt"] for e in r.get("evidence", [])])


def score_extraction(ann: dict[str, Any], detail: dict | None) -> dict[str, Any] | None:
    """Field-level accuracy of the stored requirements against the scenario's expected annotations."""
    spec = (ann or {}).get("extraction")
    if not spec or detail is None:
        return None
    reqs = detail["requirements"]
    fields = {"found": [0, 0], "kind": [0, 0], "certainty": [0, 0], "importance": [0, 0], "absent": [0, 0]}
    misses: list[str] = []
    for exp in spec.get("expected", []):
        cands = [r for r in reqs if re.search(exp["match"], _blob(r), re.I)]
        pick = next((r for r in cands if r["kind"] == exp.get("kind")), cands[0] if cands else None)
        fields["found"][1] += 1
        if pick is not None:
            fields["found"][0] += 1
        else:
            misses.append(f"no stored requirement matches /{exp['match']}/")
        for f in ("kind", "certainty", "importance"):
            if f in exp:
                fields[f][1] += 1
                if pick is not None and pick[f] == exp[f]:
                    fields[f][0] += 1
                elif pick is not None:
                    misses.append(f"/{exp['match']}/: {f} expected {exp[f]} got {pick[f]}")
    for ab in spec.get("absent", []):
        fields["absent"][1] += 1
        hit = [r for r in reqs if re.search(ab["match"], _blob(r), re.I)]
        if not hit:
            fields["absent"][0] += 1
        else:
            misses.append(f"requirement matching /{ab['match']}/ should not exist")
    return {"fields": fields, "misses": misses}


def score_clarification(ann: dict[str, Any], detail: dict | None) -> dict[str, Any] | None:
    """Were blocking questions asked exactly when the capture is genuinely ambiguous, and about the right things?"""
    spec = (ann or {}).get("clarification")
    if not spec or detail is None:
        return None
    blocking = [q for q in detail["questions"] if q["blocking"] and q["status"] == "open"]
    expected = bool(spec["blocking"])
    topics = spec.get("topics", [])
    covered = [t for t in topics if any(re.search(t, q["question"] + " " + q["whyItMatters"], re.I) for q in blocking)]
    return {
        "expectedBlocking": expected,
        "blockingQuestions": len(blocking),
        "appropriate": (len(blocking) > 0) == expected,
        "topicsExpected": len(topics),
        "topicsCovered": len(covered),
        "excessBlocking": len(blocking) if not expected else 0,
        "missedTopics": [t for t in topics if t not in covered],
    }


def ratio(num: int, den: int) -> float | None:
    return round(num / den, 4) if den else None


def aggregate(runs: list[dict[str, Any]]) -> dict[str, Any]:
    """`runs` = per-scenario-variant result dicts (skipped ones excluded)."""
    f_tot = {k: [0, 0] for k in ("found", "kind", "certainty", "importance", "absent")}
    for r in runs:
        ex = r.get("extractionScore")
        if ex:
            for k, (a, b) in ex["fields"].items():
                f_tot[k][0] += a
                f_tot[k][1] += b
    n_ok = sum(v[0] for v in f_tot.values())
    n_all = sum(v[1] for v in f_tot.values())

    clar = [r["clarificationScore"] for r in runs if r.get("clarificationScore")]
    appropriate = sum(1 for c in clar if c["appropriate"])
    topics_exp = sum(c["topicsExpected"] for c in clar)
    topics_cov = sum(c["topicsCovered"] for c in clar)

    claim_kinds: dict[str, list[int]] = {}
    for r in runs:
        for k, (checked, bad) in r["claims"].items():
            claim_kinds.setdefault(k, [0, 0])
            claim_kinds[k][0] += checked
            claim_kinds[k][1] += bad
    unsupported = sum(v[1] for v in claim_kinds.values())

    cit_total = sum(r["citations"][0] for r in runs)
    cit_valid = sum(r["citations"][1] for r in runs)
    ev_total = sum(r["evidence"][0] for r in runs)
    ev_valid = sum(r["evidence"][1] for r in runs)

    act_total = sum(r["actions"][0] for r in runs)
    act_ok = sum(r["actions"][1] for r in runs)
    dup = sum(r["duplicates"] for r in runs)
    approval = sum(r["approvalViolations"] for r in runs)

    passed = sum(1 for r in runs if r["passed"])
    return {
        "extractionFieldAccuracy": {
            "value": ratio(n_ok, n_all), "correct": n_ok, "total": n_all,
            "byField": {k: {"correct": v[0], "total": v[1], "value": ratio(*v)} for k, v in f_tot.items()},
            "scenariosAnnotated": sum(1 for r in runs if r.get("extractionScore")),
        },
        "clarificationAppropriateness": {
            "value": ratio(appropriate, len(clar)), "appropriate": appropriate, "scenariosAnnotated": len(clar),
            "expectedTopicsCovered": {"covered": topics_cov, "expected": topics_exp, "value": ratio(topics_cov, topics_exp)},
            "excessBlockingQuestions": sum(c["excessBlocking"] for c in clar),
        },
        "unsupportedCriticalClaims": {
            "count": unsupported, "target": 0,
            "byKind": {k: {"checked": v[0], "unsupported": v[1]} for k, v in sorted(claim_kinds.items())},
        },
        "citationValidity": {
            "value": ratio(cit_valid + ev_valid, cit_total + ev_total),
            "valid": cit_valid + ev_valid, "total": cit_total + ev_total,
            "sourceCitations": {"valid": cit_valid, "total": cit_total},
            "evidenceExcerpts": {"valid": ev_valid, "total": ev_total},
        },
        "actionVerificationRate": {"value": ratio(act_ok, act_total), "verified": act_ok, "executed": act_total},
        "duplicateWriteCount": {"count": dup, "target": 0},
        "writesWithoutApproval": {"count": approval, "target": 0},
        "endToEndCompletionPassRate": {
            "value": ratio(passed, len(runs)), "passed": passed, "total": len(runs),
        },
    }
