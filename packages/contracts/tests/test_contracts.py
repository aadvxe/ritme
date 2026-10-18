import pytest
from pydantic import ValidationError
from ritme_contracts import (
    Certainty,
    Importance,
    RequirementItem,
    RequirementKind,
    WorkflowPlanDraft,
)
from ritme_contracts.plan import PlanTaskDraft, find_cycle


def _req(**kw):
    base = dict(
        id="r1",
        kind=RequirementKind.DELIVERABLE,
        text="Proposal",
        certainty=Certainty.EXPLICIT,
        importance=Importance.USEFUL,
        evidence=[],
    )
    base.update(kw)
    return RequirementItem(**base)


def test_explicit_requires_evidence():
    with pytest.raises(ValidationError):
        _req()
    ok = _req(evidence=[{"sourceId": "c1", "excerpt": "get the proposal over the line"}])
    assert ok.evidence[0].source_id == "c1"


def test_inferred_without_evidence_is_allowed():
    assert _req(certainty=Certainty.INFERRED).certainty == Certainty.INFERRED


def _task(i, deps=()):
    return PlanTaskDraft(draft_id=i, title=f"Do {i}", definition_of_done="done", depends_on_draft_ids=list(deps))


def test_plan_rejects_cycles_and_unknown_deps():
    with pytest.raises(ValidationError, match="cycle"):
        WorkflowPlanDraft(version=1, goal="g", tasks=[_task("a", ["b"]), _task("b", ["a"])])
    with pytest.raises(ValidationError, match="unknown"):
        WorkflowPlanDraft(version=1, goal="g", tasks=[_task("a", ["zzz"])])
    plan = WorkflowPlanDraft(version=1, goal="g", tasks=[_task("a"), _task("b", ["a"])])
    assert len(plan.tasks) == 2


def test_find_cycle_none_for_dag():
    assert find_cycle({"a": [], "b": ["a"], "c": ["a", "b"]}) is None


def test_wire_format_is_camel_case():
    dumped = _req(certainty=Certainty.INFERRED).model_dump(by_alias=True)
    assert "userConfirmedAt" in dumped
