import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { answerDemoBlockers, demoWorkflowId, executeDemoPlan, makeEnv, proposeDemoPlan, renderApp } from "@/test/utils";

const region = (name: RegExp) => screen.getByRole("region", { name });

describe("Clarity Canvas: Truth Board", () => {
  it("sorts the seeded request into Known / Assumptions / Missing, each with an icon-and-word label", async () => {
    const env = makeEnv();
    renderApp(`/workflows/${demoWorkflowId(env)}`, env);
    await screen.findByRole("heading", { level: 1, name: /Get the proposal over the line/ });

    const known = region(/Known facts & rules/);
    const assumptions = region(/Assumptions to confirm/);
    const missing = region(/Missing or unclear/);

    // Text labels, not colour alone.
    expect(within(known).getAllByText("Known").length).toBeGreaterThan(0);
    expect(within(assumptions).getAllByText("Assumption").length).toBeGreaterThan(0);
    expect(within(missing).getAllByText("Missing").length).toBeGreaterThan(0);

    // The deliverable and the rule from the user's own document are known facts.
    expect(within(known).getByText("The proposal")).toBeInTheDocument();
    expect(within(known).getAllByText(/48-hour peer review/).length).toBeGreaterThan(0);
    // "Friday" and "everyone aligned" are blocker cards, not invented answers.
    expect(within(missing).getByText(/which Friday/)).toBeInTheDocument();
    expect(within(missing).getByText(/who needs to agree is not stated/)).toBeInTheDocument();
    expect(within(missing).getAllByText("Blocks the plan")).toHaveLength(2);
  });

  it("shows the evidence excerpt inline, with where it came from", async () => {
    const env = makeEnv();
    renderApp(`/workflows/${demoWorkflowId(env)}`, env);
    const known = await screen.findByRole("region", { name: /Known facts & rules/ });
    expect(within(known).getByText(/“get the proposal over the line”/)).toBeInTheDocument();
    expect(within(known).getAllByText(/From Message from your manager/).length).toBeGreaterThan(0);
    expect(within(known).getByText(/From Intern Onboarding Doc/)).toBeInTheDocument();
    expect(within(known).getByText(/All client decks require a 48-hour peer review/)).toBeInTheDocument();
  });

  it("an assumption stays an assumption until the user confirms it, then reads 'Confirmed by you'", async () => {
    const env = makeEnv();
    renderApp(`/workflows/${demoWorkflowId(env)}`, env);
    const assumptions = await screen.findByRole("region", { name: /Assumptions to confirm/ });
    expect(within(assumptions).queryByText("Confirmed by you")).toBeNull();
    await userEvent.click(within(assumptions).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: /Known facts & rules/ })).getByText("Confirmed by you")).toBeInTheDocument());
    expect(within(screen.getByRole("region", { name: /Assumptions to confirm/ })).getByText("No assumptions to check.")).toBeInTheDocument();
  });

  it("lets the user edit an item, which then counts as confirmed", async () => {
    const env = makeEnv();
    renderApp(`/workflows/${demoWorkflowId(env)}`, env);
    const known = await screen.findByRole("region", { name: /Known facts & rules/ });
    const card = within(known).getByText("The proposal").closest("li") as HTMLElement;
    await userEvent.click(within(card).getByRole("button", { name: "Edit" }));
    const dlg = await screen.findByRole("dialog");
    const input = within(dlg).getByLabelText("What it should say");
    await userEvent.clear(input);
    await userEvent.type(input, "The proposal and a one-page summary");
    await userEvent.click(within(dlg).getByRole("button", { name: "Save and confirm" }));
    await waitFor(() => expect(screen.getByText("The proposal and a one-page summary")).toBeInTheDocument());
  });

  it("lets the user reject an item after confirming", async () => {
    const env = makeEnv();
    renderApp(`/workflows/${demoWorkflowId(env)}`, env);
    const assumptions = await screen.findByRole("region", { name: /Assumptions to confirm/ });
    await userEvent.click(within(assumptions).getByRole("button", { name: "Reject" }));
    const dlg = await screen.findByRole("dialog");
    await userEvent.click(within(dlg).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: /Assumptions to confirm/ })).getByText("No assumptions to check.")).toBeInTheDocument());
  });
});

describe("Clarity Canvas: blocker cards", () => {
  it("answering a blocker saves it and moves the item to known", async () => {
    const env = makeEnv();
    renderApp(`/workflows/${demoWorkflowId(env)}`, env);
    const missing = await screen.findByRole("region", { name: /Missing or unclear/ });
    const block = within(missing).getAllByTestId("question-block")[0]!;
    await userEvent.click(within(block).getByRole("button", { name: "This Friday, end of day" }));
    expect(within(block).getByLabelText("Your answer")).toHaveValue("This Friday, end of day");
    await userEvent.click(within(block).getByRole("button", { name: "Save answer" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: /Known facts & rules/ })).getByText(/Deadline: This Friday, end of day/)).toBeInTheDocument());
    // The deadline is now confirmed and shown in the header.
    expect(await screen.findByText(/Deadline .*5:00 PM/)).toBeInTheDocument();
  });

  it("'Draft clarification' gives an editable, copy-only message and sends nothing", async () => {
    const env = makeEnv();
    renderApp(`/workflows/${demoWorkflowId(env)}`, env);
    const missing = await screen.findByRole("region", { name: /Missing or unclear/ });
    const block = within(missing).getAllByTestId("question-block")[0]!;
    const before = env.calls.filter((c) => c.method !== "GET").length;
    await userEvent.click(within(block).getByRole("button", { name: "Draft clarification" }));
    const dlg = await screen.findByRole("dialog");
    const box = within(dlg).getByLabelText(/Message \(editable, copy-only\)/) as HTMLTextAreaElement;
    expect(box.value).toMatch(/Which Friday/);
    await userEvent.type(box, " Thanks!");
    expect(box.value).toMatch(/Thanks!$/);
    expect(within(dlg).getByText(/Ritme does not send it/)).toBeInTheDocument();
    // Only the draft request went out: no other write, nothing "sent".
    const writes = env.calls.filter((c) => c.method !== "GET").slice(before);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toMatch(/\/questions\/.+\/draft$/);
  });

  it("deferring continues with a visible assumption label that is not a confirmed fact", async () => {
    const env = makeEnv();
    renderApp(`/workflows/${demoWorkflowId(env)}`, env);
    const missing = await screen.findByRole("region", { name: /Missing or unclear/ });
    const block = within(missing).getAllByTestId("question-block")[1]!;
    await userEvent.click(within(block).getByRole("button", { name: "Continue with an assumption" }));
    const dlg = await screen.findByRole("dialog");
    await userEvent.type(within(dlg).getByLabelText("Assumption to plan with"), "Priya and Sam approve");
    await userEvent.click(within(dlg).getByRole("button", { name: "Continue with this assumption" }));
    const label = await screen.findByTestId("assumption-label");
    expect(label).toHaveTextContent("Working assumption: Priya and Sam approve");
    // Still in "Missing or unclear", never promoted to known.
    expect(within(screen.getByRole("region", { name: /Missing or unclear/ })).getByTestId("assumption-label")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: /Known facts & rules/ })).queryByText(/Priya and Sam approve/)).toBeNull();
  });

  it("won't offer a plan while blocking questions are open", async () => {
    const env = makeEnv();
    renderApp(`/workflows/${demoWorkflowId(env)}`, env);
    expect(await screen.findByTestId("plan-blocked")).toHaveTextContent(/2 questions are still open/);
    expect(screen.queryByRole("button", { name: "Create a plan draft" })).toBeNull();
  });
});

describe("Clarity Canvas: plan, approval, verification", () => {
  it("drafts a plan once blockers are handled, defaulting to one step because plan_layout says so", async () => {
    const env = makeEnv();
    await answerDemoBlockers(env);
    await env.api.preferences.patch({ taskGranularity: "small_steps", planLayout: "one_step" });
    renderApp(`/workflows/${demoWorkflowId(env)}`, env);
    await userEvent.click(await screen.findByRole("button", { name: "Create a plan draft" }));
    const plan = await screen.findByTestId("view-one-step");
    expect(within(plan).getAllByTestId("plan-item")).toHaveLength(1);
    expect(screen.getByTestId("steps-waiting")).toHaveTextContent("5 more steps waiting");
    expect(screen.getByTestId("plan-why")).toHaveTextContent(/one step at a time because your default plan view/i);
    expect(screen.getByRole("tab", { name: "One step" })).toHaveAttribute("aria-selected", "true");

    // Per-session override: switch to the checklist and the same six steps all show.
    await userEvent.click(screen.getByRole("tab", { name: "Checklist" }));
    expect(await screen.findByTestId("view-checklist")).toBeInTheDocument();
    expect(screen.getAllByTestId("plan-item")).toHaveLength(6);
    expect(screen.getByTestId("plan-why")).toHaveTextContent(/switched views for this visit/i);
    await userEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(await screen.findByTestId("view-timeline")).toBeInTheDocument();
    expect(screen.getAllByTestId("plan-item")).toHaveLength(6);
  });

  it("creates no tasks until Approve, then verifies by reading back and shows the real IDs", async () => {
    const env = makeEnv();
    const { id } = await proposeDemoPlan(env);
    renderApp(`/workflows/${id}`, env);
    const card = await screen.findByTestId("approval-card");
    expect(within(card).getByTestId("approval-count")).toHaveTextContent("Create 6 tasks");
    const rec = () => env.mock.store.db.workflows.find((w) => w.summary.id === id)!;
    expect(rec().tasks).toHaveLength(0);

    const before = env.calls.length;
    await userEvent.click(within(card).getByRole("button", { name: "Approve & create tasks" }));
    const verified = await screen.findByTestId("verified-summary");
    expect(verified).toHaveTextContent("Verified");
    expect(rec().tasks).toHaveLength(6);
    const ids = rec().tasks.map((t) => t.id);
    expect(screen.getByTestId("verified-ids")).toHaveTextContent(ids.join(", "));

    // Approve came strictly before execute.
    const writes = env.calls.slice(before).filter((c) => c.method === "POST").map((c) => c.path.split("/").slice(-1)[0]);
    expect(writes.indexOf("approve")).toBeGreaterThanOrEqual(0);
    expect(writes.indexOf("approve")).toBeLessThan(writes.indexOf("execute"));

    // Tasks list shows the same IDs; the activity timeline records the Verified outcome with IDs.
    expect(screen.getAllByTestId("task-row").map((r) => (r as HTMLElement).dataset.taskId)).toEqual(ids);
    const activity = await screen.findByRole("region", { name: "Activity" });
    await waitFor(() => expect(within(activity).getByText(/Created 6 tasks \(Verified\)/)).toBeInTheDocument());
    expect(within(activity).getByText(ids[0]!, { exact: false })).toBeInTheDocument();
  });

  it("Reject creates nothing", async () => {
    const env = makeEnv();
    const { id } = await proposeDemoPlan(env);
    renderApp(`/workflows/${id}`, env);
    const card = await screen.findByTestId("approval-card");
    await userEvent.click(within(card).getByRole("button", { name: "Reject" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.queryByTestId("approval-card")).toBeNull());
    expect(env.mock.store.db.workflows.find((w) => w.summary.id === id)!.tasks).toHaveLength(0);
  });

  it("editing the plan saves a new draft and prepares a fresh approval for exactly that version", async () => {
    const env = makeEnv();
    const { id } = await proposeDemoPlan(env);
    renderApp(`/workflows/${id}`, env);
    const card = await screen.findByTestId("approval-card");
    await userEvent.click(within(card).getByRole("button", { name: "Edit" }));
    const dlg = await screen.findByRole("dialog", { name: "Edit plan" });
    const first = within(dlg).getAllByTestId("editor-task")[0]!;
    const title = within(first).getByLabelText("Step");
    await userEvent.clear(title);
    await userEvent.type(title, "Write down the names");
    await userEvent.click(within(dlg).getByRole("button", { name: "Save and review" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit plan" })).toBeNull());
    await waitFor(() => expect(within(screen.getByTestId("approval-list")).getByText("Write down the names")).toBeInTheDocument());
    const rec = env.mock.store.db.workflows.find((w) => w.summary.id === id)!;
    expect(rec.tasks).toHaveLength(0);
    expect(rec.actions.filter((a) => a.status === "pending_approval")).toHaveLength(1);
  });

  it("reload resumes from saved state: tasks, Verified badge and next step are still there", async () => {
    const env = makeEnv();
    const { id } = await executeDemoPlan(env);
    const first = renderApp(`/workflows/${id}`, env);
    await screen.findByTestId("verified-summary");
    first.unmount();
    renderApp(`/workflows/${id}`, env);
    expect(await screen.findByTestId("verified-summary")).toHaveTextContent("Verified");
    expect(screen.getAllByTestId("task-row")).toHaveLength(6);
    expect(screen.getByTestId("resume-card")).toHaveTextContent(/Created 6 tasks/);
    expect(screen.getByTestId("resume-card")).toHaveTextContent(/List who needs to agree on the proposal/);
  });

  it("marks a task done and moves the next step along", async () => {
    const env = makeEnv();
    const { id } = await executeDemoPlan(env);
    renderApp(`/workflows/${id}`, env);
    const view = await screen.findByTestId("view-one-step");
    expect(within(view).getByRole("heading", { name: "List who needs to agree on the proposal" })).toBeInTheDocument();
    await userEvent.click(within(view).getByRole("button", { name: /Mark done: List who needs to agree/ }));
    await waitFor(() => expect(within(screen.getByTestId("view-one-step")).getByRole("heading", { name: "Draft the outline of the proposal" })).toBeInTheDocument());
  });
});

describe("Clarity Canvas: Something changed (Domino Recovery)", () => {
  it("offers two paths with no justification field, then Before/After and a single approval", async () => {
    const env = makeEnv();
    const { id } = await executeDemoPlan(env);
    renderApp(`/workflows/${id}`, env);
    await screen.findByTestId("verified-summary");
    await userEvent.click(screen.getByRole("button", { name: "Something changed" }));
    const dlg = await screen.findByRole("dialog", { name: "Something changed" });
    expect(within(dlg).getByRole("radio", { name: /The request changed/ })).toBeChecked();
    expect(within(dlg).getByRole("radio", { name: /I couldn't work on this/ })).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole("radio", { name: /I couldn't work on this/ }));
    // No "why" box on this path, and no guilt copy.
    expect(within(dlg).queryByRole("textbox")).toBeNull();
    expect(dlg.textContent).not.toMatch(/overdue|late|missed|behind|sorry|failed to/i);

    await userEvent.click(within(dlg).getByRole("radio", { name: /The request changed/ }));
    const due = within(dlg).getByLabelText("New deadline");
    await userEvent.clear(due);
    await userEvent.type(due, "2026-10-21T17:00");
    await userEvent.click(within(dlg).getByRole("button", { name: "Show what would change" }));

    const diff = await screen.findByTestId("diff");
    expect(within(screen.getByTestId("blast-count")).getByText(/tasks? affected/)).toBeInTheDocument();
    expect(within(diff).getAllByTestId("diff-row").length).toBeGreaterThan(0);
    expect(within(diff).getAllByText("Before").length).toBeGreaterThan(0);
    expect(within(diff).getAllByText("After").length).toBeGreaterThan(0);

    // Nothing has changed yet.
    const rec = env.mock.store.db.workflows.find((w) => w.summary.id === id)!;
    const oldDeadline = rec.summary.confirmedDueAt;
    const oldDates = rec.tasks.map((t) => t.dueAt);

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve changes" }));
    await waitFor(() => expect(rec.summary.confirmedDueAt).not.toBe(oldDeadline));
    expect(rec.tasks.map((t) => t.dueAt)).not.toEqual(oldDates);
    expect(rec.summary.confirmedDueAt && new Date(rec.summary.confirmedDueAt).getDate()).toBe(21);
  });

  it("preserves completed tasks", async () => {
    const env = makeEnv();
    const { id } = await executeDemoPlan(env);
    const rec = env.mock.store.db.workflows.find((w) => w.summary.id === id)!;
    const firstId = rec.tasks[0]!.id;
    await env.api.tasks.patch(firstId, { status: "done" });
    const doneDue = rec.tasks[0]!.dueAt;
    const res = await env.api.workflows.replan(id, { trigger: "could_not_work" });
    const kept = res.diff.find((d) => d.existingTaskId === firstId);
    expect(kept?.changeType).toBe("keep");
    await env.api.actions.approve(res.action.id);
    await env.api.actions.execute(res.action.id);
    expect(rec.tasks[0]!.dueAt).toBe(doneDue);
    expect(rec.tasks[0]!.status).toBe("done");
  });
});
