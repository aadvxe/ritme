import pytest
from app.domain import state_machine as sm
from app.errors import AppError


def test_valid_workflow_path():
    path = ["captured", "analyzing", "needs_input", "planning", "ready_for_approval", "in_progress", "completed"]
    for a, b in zip(path, path[1:], strict=False):
        sm.assert_workflow(a, b)


@pytest.mark.parametrize(
    "src,dst",
    [("captured", "completed"), ("cancelled", "planning"), ("analyzing", "in_progress"), ("completed", "captured")],
)
def test_invalid_workflow_transitions_rejected(src, dst):
    with pytest.raises(AppError) as e:
        sm.assert_workflow(src, dst)
    assert e.value.status == 422


def test_action_lifecycle_cannot_skip_approval():
    sm.assert_action("pending_approval", "approved")
    sm.assert_action("approved", "executing")
    sm.assert_action("executing", "succeeded")
    for src, dst in [("pending_approval", "executing"), ("pending_approval", "succeeded"), ("rejected", "approved"), ("succeeded", "executing")]:
        with pytest.raises(AppError):
            sm.assert_action(src, dst)


def test_task_transitions():
    sm.assert_task("todo", "in_progress")
    sm.assert_task("done", "todo")  # reopen is allowed
    sm.assert_task("todo", "todo")  # no-op is fine
