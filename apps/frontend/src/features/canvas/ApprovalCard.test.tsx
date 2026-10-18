import type { ApiClient, ProposedActionOut } from "@ritme/api-client";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Providers, makeEnv } from "@/test/utils";
import { ApprovalCard } from "./ApprovalCard";
import { VerifiedSummary } from "./VerifiedSummary";
import { previewOf } from "./approval";

const createAction: ProposedActionOut = {
  id: "act_1",
  workflowId: "wf_1",
  actionType: "create_tasks",
  status: "pending_approval",
  provider: "ritme",
  planVersionId: "plan_1",
  reasonSummary: "Create 2 tasks in Ritme from plan version 1",
  payload: {
    tasks: [
      { draftId: "d1", title: "Outline the proposal", definitionOfDone: "Every section has a heading", estimatedMinutes: 15, dueAt: null, dependsOnDraftIds: [] },
      { draftId: "d2", title: "Write the draft", definitionOfDone: "Every section has text", estimatedMinutes: 45, dueAt: "2026-10-22T10:00:00Z", dependsOnDraftIds: ["d1"] },
    ],
  },
  resultIds: [],
  resultSummary: null,
  verification: "not_run",
  errorCode: null,
  createdAt: "2026-10-19T00:00:00Z",
  approvedAt: null,
  executedAt: null,
};

function stubApi(overrides: Partial<ProposedActionOut> = {}) {
  const order: string[] = [];
  const api = {
    actions: {
      approve: vi.fn(async () => (order.push("approve"), { ...createAction, status: "approved" as const })),
      execute: vi.fn(async () => (order.push("execute"), { ...createAction, status: "succeeded" as const, verification: "verified" as const, resultIds: ["task_1", "task_2"], ...overrides })),
      reject: vi.fn(async () => (order.push("reject"), { ...createAction, status: "rejected" as const })),
    },
    workflows: { draftClarification: vi.fn(async () => ({ questionId: "q", message: "Drafted", notes: null })) },
  } as unknown as ApiClient;
  return { api, order };
}

const setup = (action = createAction, extra: { onEdit?: () => void } = {}) => {
  const { api, order } = stubApi();
  const env = { ...makeEnv(), api };
  render(
    <Providers env={env}>
      <ApprovalCard action={action} prefs={undefined} questions={[]} disabled={false} {...extra} />
    </Providers>,
  );
  return { api, order };
};

describe("approval card", () => {
  it("previews exactly what will be written, and writes nothing until approved", () => {
    const { api } = setup();
    expect(screen.getByTestId("approval-count")).toHaveTextContent("Create 2 tasks");
    const list = screen.getByTestId("approval-list");
    expect(within(list).getByText("Outline the proposal")).toBeInTheDocument();
    expect(within(list).getByText(/Done when: Every section has text/)).toBeInTheDocument();
    expect(within(list).getByText(/Waits for: Outline the proposal/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing else is created or changed. No messages are sent/)).toBeInTheDocument();
    expect(api.actions.approve).not.toHaveBeenCalled();
    expect(api.actions.execute).not.toHaveBeenCalled();
  });

  it("offers Approve, Edit, Ask a question, Skip and Reject", () => {
    setup(createAction, { onEdit: () => undefined });
    for (const name of ["Approve & create tasks", "Edit", "Ask a question", "Not now", "Reject"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("approves first, then executes, and never the other way round", async () => {
    const { api, order } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Approve & create tasks" }));
    await waitFor(() => expect(api.actions.execute).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["approve", "execute"]);
  });

  it("Not now leaves the proposal alone and creates nothing", async () => {
    const { api } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByTestId("approval-skipped")).toHaveTextContent("Nothing was created");
    expect(api.actions.approve).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Review the approval again" }));
    expect(screen.getByTestId("approval-card")).toBeInTheDocument();
  });

  it("Reject asks first, then rejects without executing", async () => {
    const { api } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    const dlg = await screen.findByRole("dialog");
    expect(api.actions.reject).not.toHaveBeenCalled();
    await userEvent.click(within(dlg).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(api.actions.reject).toHaveBeenCalledTimes(1));
    expect(api.actions.execute).not.toHaveBeenCalled();
  });

  it("Ask a question opens an editable, copy-only draft and sends nothing", async () => {
    const { api } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Ask a question" }));
    const dlg = await screen.findByRole("dialog");
    const box = within(dlg).getByRole("textbox", { name: /Your message/ });
    expect((box as HTMLTextAreaElement).value).toMatch(/before I go ahead with this plan/);
    await userEvent.type(box, "Is Friday firm?");
    expect(within(dlg).getByText(/Ritme never sends it/)).toBeInTheDocument();
    expect(api.actions.approve).not.toHaveBeenCalled();
  });

  it("does not offer Edit for a change proposal (an approved payload is immutable)", () => {
    setup({ ...createAction, actionType: "update_tasks", payload: { updates: [] } }, { onEdit: () => undefined });
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("shows a change proposal as before and after, not a loose summary", () => {
    const preview = previewOf({
      actionType: "update_tasks",
      payload: {
        diff: [
          { changeType: "update", existingTaskId: "t1", before: { title: "Write the draft", dueAt: "2026-10-23T10:00:00Z" }, after: { title: "Write the draft", dueAt: "2026-10-21T10:00:00Z" }, reason: "Deadline moved earlier" },
          { changeType: "keep", existingTaskId: "t0", before: { title: "Done thing" }, after: { title: "Done thing" }, reason: "Already finished" },
        ],
      },
    });
    expect(preview.kind).toBe("update");
    if (preview.kind === "update") {
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0]).toMatchObject({ title: "Write the draft", beforeDue: "2026-10-23T10:00:00Z", afterDue: "2026-10-21T10:00:00Z" });
    }
  });

  it("falls back to the raw payload rather than hiding an unknown shape", () => {
    expect(previewOf({ actionType: "create_tasks", payload: { surprise: 1 } }).kind).toBe("raw");
  });
});

describe("verified badge", () => {
  const base = { ...createAction, status: "succeeded" as const, resultIds: ["task_0021", "task_0022"], resultSummary: "Created 2 tasks" };

  it("shows Verified with the real task IDs", () => {
    render(<VerifiedSummary action={{ ...base, verification: "verified" }} />);
    const el = screen.getByTestId("verified-summary");
    expect(el).toHaveTextContent("Verified");
    expect(screen.getByTestId("verified-ids")).toHaveTextContent("task_0021, task_0022");
  });

  it("never says Verified when verification was inconclusive", () => {
    render(<VerifiedSummary action={{ ...base, verification: "unverified" }} />);
    const el = screen.getByTestId("verified-summary");
    expect(el).toHaveTextContent("Unverified");
    expect(el.textContent).not.toMatch(/(^|[^n])Verified/);
  });
});
