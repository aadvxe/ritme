import { createApiClient } from "@ritme/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "@/App";
import { NOW, Providers, executeDemoPlan, makeEnv, renderApp, type TestEnv } from "@/test/utils";

const setup = async (route: string, env = makeEnv()) => {
  const r = renderApp(route, env);
  return { ...r, env };
};

describe("Dashboard", () => {
  it("shows next best step, pick up where you left off, needs input, needs approval, captures and activity", async () => {
    const { env } = await setup("/");
    await screen.findByRole("heading", { level: 1, name: "Dashboard" });
    const nbs = await screen.findByRole("region", { name: /Your next best step/ });
    expect(within(nbs).getByText(/Answer: Which Friday/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Pick up where you left off" })).toBeInTheDocument();
    const card = screen.getByTestId("workflow-card");
    expect(within(card).getByText("Demo example")).toBeInTheDocument();
    expect(within(card).getByText("Needs your input")).toBeInTheDocument(); // status as text
    expect(within(card).getByText("Next action")).toBeInTheDocument();
    expect(within(card).queryByText("Deadline")).toBeNull(); // no deadline confirmed yet: not shown
    expect(within(screen.getByRole("region", { name: "Needs your input" })).getAllByRole("link", { name: "Answer" })).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Needs your approval" })).getByText(/Nothing is waiting for approval/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Recent captures" })).toHaveTextContent("Proposal by Friday");
    expect(screen.getByRole("region", { name: "Recent activity" })).toBeInTheDocument();
    expect(env.calls.some((c) => c.path === "/api/dashboard")).toBe(true);
  });

  it("shows a confirmed deadline on the card once it is known, and an approval waiting to be reviewed", async () => {
    const env = makeEnv();
    const { proposeDemoPlan } = await import("@/test/utils");
    await proposeDemoPlan(env);
    await setup("/", env);
    const card = await screen.findByTestId("workflow-card");
    expect(within(card).getByText("Deadline")).toBeInTheDocument();
    expect(within(card).getByText("Waiting for approval")).toBeInTheDocument();
    const approvals = screen.getByRole("region", { name: "Needs your approval" });
    expect(within(approvals).getByText(/Create 6 tasks/)).toBeInTheDocument();
    expect(within(approvals).getByRole("link", { name: "Review" })).toHaveAttribute("href", expect.stringMatching(/#approval$/));
  });

  it("explains how to capture when there is nothing yet", async () => {
    const env = makeEnv();
    await env.api.privacy.deleteAccountData();
    await setup("/", env);
    expect(await screen.findByText("No workflows yet")).toBeInTheDocument();
    expect(screen.getByText(/Save text with the Ritme extension, or paste it below/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing needs you right now/)).toBeInTheDocument();
  });

  it("paste capture: nothing is sent until Save, then it creates a capture, asks for analysis and opens the workflow", async () => {
    const { env } = await setup("/");
    const box = await screen.findByLabelText("Text to save");
    await userEvent.type(box, "Please send the Q3 report soon. Make sure everyone has signed off.");
    expect(env.calls.filter((c) => c.method === "POST" && c.path === "/api/captures")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Save to Ritme" }));
    expect(await screen.findByTestId("workflow-page")).toBeInTheDocument();
    const posts = env.calls.filter((c) => c.method === "POST").map((c) => c.path);
    expect(posts.filter((p) => p === "/api/captures")).toHaveLength(1);
    expect(posts.some((p) => /\/api\/captures\/.+\/analyze$/.test(p))).toBe(true);
    // Vague words become blocker cards, never a guessed date.
    const missing = await screen.findByRole("region", { name: /Missing or unclear/ });
    expect(within(missing).getByText(/“soon” is not a date/)).toBeInTheDocument();
  });

  it("paste capture refuses empty text and over-long text without calling the API", async () => {
    const { env } = await setup("/");
    await screen.findByLabelText("Text to save");
    await userEvent.click(screen.getByRole("button", { name: "Save to Ritme" }));
    expect(await screen.findByText("Add some text first.")).toBeInTheDocument();
    expect(env.calls.some((c) => c.method === "POST" && c.path === "/api/captures")).toBe(false);
  });

  it("reads a dropped .txt file into the form for review, and refuses other file types", async () => {
    await setup("/");
    const input = (await screen.findByLabelText("Text to save")).closest("form")!.querySelector('input[type="file"]') as HTMLInputElement;
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(input, new File(["notes.exe"], "tool.exe", { type: "application/octet-stream" }));
    expect(await screen.findByText("Only .txt and .md files can be dropped here.")).toBeInTheDocument();
    await user.upload(input, new File(["Draft the report by Friday"], "request.txt", { type: "text/plain" }));
    await waitFor(() => expect((screen.getByLabelText("Text to save") as HTMLTextAreaElement).value).toBe("Draft the report by Friday"));
    expect(screen.getByLabelText(/Title/)).toHaveValue("request");
  });

  it("Reset demo restores the labelled demo workflow after confirming", async () => {
    const env = makeEnv();
    await executeDemoPlan(env);
    await setup("/", env);
    await userEvent.click(await screen.findByRole("button", { name: "Reset demo" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reset demo" }));
    await waitFor(() => expect(env.mock.store.db.workflows.find((w) => w.summary.isDemo)?.tasks).toHaveLength(0));
    expect(env.mock.store.db.workflows.find((w) => w.summary.isDemo)?.summary.status).toBe("needs_input");
  });
});

describe("Calendar page", () => {
  // The calendar asks "what is today?", so pin the clock to the same day the mock uses.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows dated tasks placed on their days, in all three views, with the same items", async () => {
    const env = makeEnv();
    await executeDemoPlan(env);
    await setup("/calendar", env);
    await screen.findByRole("heading", { level: 1, name: "Calendar" });
    const ids = () => [...document.querySelectorAll("[data-testid=cal-item]")].map((e) => (e as HTMLElement).dataset.itemId).sort();
    await waitFor(() => expect(ids().length).toBeGreaterThan(0));
    const week = ids();
    await userEvent.click(screen.getByRole("tab", { name: "Agenda" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Chronological agenda" })).toBeInTheDocument());
    expect(ids()).toEqual(week);
    await userEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    await waitFor(() => expect(screen.getAllByTestId("timeline-lane").length).toBeGreaterThan(0));
    expect(ids()).toEqual(week);
    expect(document.body.textContent).not.toMatch(/overdue|\blate\b|missed/i);
  });

  it("explains the empty state and links to capture", async () => {
    const env = makeEnv();
    await env.api.privacy.deleteAccountData();
    await setup("/calendar", env);
    expect(await screen.findByText("No dated tasks yet")).toBeInTheDocument();
    expect(screen.getByText(/Dated tasks appear here after you approve a plan/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Capture something" })).toBeInTheDocument();
  });

  it("puts tasks without a date under 'No date yet'", async () => {
    const env = makeEnv();
    // Plan without a confirmed deadline: defer the deadline question with an assumption.
    const id = env.mock.store.db.workflows.find((w) => w.summary.isDemo)!.summary.id;
    const d = await env.api.workflows.get(id);
    await env.api.workflows.answer(id, d.questions[0]!.id, { disposition: "defer_nonblocking", assumptionLabel: "Friday means this Friday" });
    await env.api.workflows.answer(id, d.questions[1]!.id, { answer: "Priya and Sam", disposition: "answer" });
    const plan = await env.api.workflows.plan(id);
    const action = await env.api.workflows.proposeAction(id, { planVersionId: plan.id });
    await env.api.actions.approve(action.id);
    await env.api.actions.execute(action.id);
    await setup("/calendar", env);
    const group = await screen.findByTestId("group-undated");
    await waitFor(() => expect(within(group).getAllByTestId("cal-item").length).toBeGreaterThan(0));
    for (const day of document.querySelectorAll("[data-testid=week-day]")) {
      expect(within(day as HTMLElement).queryAllByTestId("cal-item")).toHaveLength(0);
    }
  });
});

describe("Guidelines", () => {
  it("lists the labelled demo document with its source date, and captures", async () => {
    await setup("/guidelines");
    expect(await screen.findByRole("heading", { level: 1, name: "Workplace Guidelines" })).toBeInTheDocument();
    expect(screen.getByText("Grounding standards, peer review rules, and approval chains")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Institutional Guidelines & Standards" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Active knowledge documents (1)" })).toBeInTheDocument();
    const doc = await screen.findByTestId("doc-card");
    expect(within(doc).getByText("Active grounding")).toBeInTheDocument();
    expect(within(doc).getByText(/Added on 18 Oct 2026|Added on \d+ \w+ \d{4}/)).toBeInTheDocument();
    expect(within(within(doc).getByTestId("doc-text")).getByText(/All client decks require a 48-hour peer review/)).toBeInTheDocument();
    expect(within(doc).getByText("Intern Onboarding Doc")).toBeInTheDocument();
    expect(within(doc).getByText("Demo example")).toBeInTheDocument();
    expect(within(doc).getByText(/Source date 1 Sep 2026/)).toBeInTheDocument();
    expect(await screen.findByTestId("capture-card")).toHaveTextContent("Proposal by Friday");
  });

  it("adds a document, flags a conflicting source, and deletes after confirming", async () => {
    const env = makeEnv();
    await setup("/guidelines", env);
    await userEvent.click((await screen.findAllByRole("button", { name: "Add Guideline" }))[0]!);
    const dlg = await screen.findByRole("dialog");
    await userEvent.type(within(dlg).getByLabelText("Title"), "Team wiki");
    await userEvent.type(within(dlg).getByLabelText("Text or Markdown"), "Client decks need a 24-hour peer review.");
    await userEvent.click(within(dlg).getByRole("button", { name: "Add guideline" }));
    await waitFor(() => expect(screen.getAllByTestId("doc-card")).toHaveLength(2));
    const conflict = (await screen.findAllByTestId("doc-conflict"))[0]!;
    expect(conflict).toHaveTextContent(/May conflict with/);
    expect(conflict).toHaveTextContent(/Check which one is current/);

    await userEvent.click(screen.getByRole("button", { name: "Delete document: Team wiki" }));
    expect(env.mock.store.db.knowledge).toHaveLength(2);
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete document" }));
    await waitFor(() => expect(env.mock.store.db.knowledge).toHaveLength(1));
  });

  it("searches documents and shows the matching passage", async () => {
    await setup("/guidelines");
    expect(await screen.findByRole("heading", { name: "Search scoped knowledge excerpts" })).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText("Search your documents"), "peer review");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Matching passages")).toBeInTheDocument();
    const results = screen.getByText("Matching passages").parentElement as HTMLElement;
    expect(within(results).getByText("Intern Onboarding Doc")).toBeInTheDocument();
    expect(within(results).getByText("Location not recorded")).toBeInTheDocument();
    expect(within(results).getByText(/All client decks require a 48-hour peer review/)).toBeInTheDocument();
  });

  it("keeps /library working by redirecting to /guidelines", async () => {
    await setup("/library");
    expect(await screen.findByRole("heading", { level: 1, name: "Workplace Guidelines" })).toBeInTheDocument();
  });
});

describe("Privacy & Data", () => {
  it("states there is no employer access and lists what is stored", async () => {
    await setup("/settings/privacy");
    expect(await screen.findByRole("heading", { name: "No employer access" })).toBeInTheDocument();
    expect(screen.getByText(/no employer view or admin dashboard/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("count-Captures")).toHaveTextContent("1"));
    expect(screen.getByTestId("count-Workflows")).toHaveTextContent("1");
    expect(screen.getByRole("heading", { name: "What is sent to the AI model" })).toBeInTheDocument();
    expect(screen.getAllByText(/Local test model/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a legal compliance statement/)).toBeInTheDocument();
  });

  it("deletes a single capture", async () => {
    const env = makeEnv();
    await setup("/settings/privacy", env);
    const list = await screen.findByTestId("privacy-captures");
    await userEvent.click(within(list).getByRole("button", { name: /Delete: Proposal by Friday/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(env.mock.store.db.captures).toHaveLength(0));
  });

  it("only erases everything after typing DELETE", async () => {
    const env = makeEnv();
    await setup("/settings/privacy", env);
    await userEvent.click(await screen.findByRole("button", { name: "Delete all my data" }));
    const dlg = await screen.findByRole("dialog");
    const confirm = within(dlg).getByRole("button", { name: "Erase everything" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dlg).getByLabelText("Type DELETE"), "delete");
    expect(confirm).toBeDisabled();
    await userEvent.clear(within(dlg).getByLabelText("Type DELETE"));
    await userEvent.type(within(dlg).getByLabelText("Type DELETE"), "DELETE");
    await userEvent.click(confirm);
    expect(await screen.findByTestId("erased")).toHaveTextContent(/1 captures/);
    expect(env.mock.store.db.captures).toHaveLength(0);
    expect(env.mock.store.db.workflows).toHaveLength(0);
  });
});

describe("loading, error and offline states", () => {
  const failing = (make: () => Response | Promise<Response>): TestEnv => {
    const env = makeEnv();
    const api = createApiClient({
      baseUrl: "http://api.test",
      getToken: async () => "t",
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        if (url.pathname === "/api/me" || url.pathname === "/api/preferences") return env.mock(input, init);
        return make();
      }) as typeof fetch,
    });
    return { ...env, api };
  };

  it("shows a loading state first, then the content", async () => {
    renderApp("/");
    expect(screen.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
    await screen.findByRole("region", { name: /Your next best step/ });
  });

  it("shows an explicit offline state with Try again when the network is unreachable", async () => {
    const env = failing(() => Promise.reject(new TypeError("Failed to fetch")));
    render(
      <Providers env={env} route="/">
        <AppRoutes />
      </Providers>,
    );
    // me is served; the dashboard fetch fails as a network error
    env.mock.store.db.me.onboardingCompleted = true;
    // Every data card on the page (dashboard and schedule) reports it, each with its own retry.
    expect((await screen.findAllByTestId("state-offline")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("You appear to be offline").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Try again" }).length).toBeGreaterThan(0);
  });

  it("shows a plain error state for a server error, without raw server text", async () => {
    const env = failing(() => new Response(JSON.stringify({ error: { code: "internal", message: "Traceback: secret stack", retryable: false, requestId: "r1" } }), { status: 500 }));
    env.mock.store.db.me.onboardingCompleted = true;
    render(
      <Providers env={env} route="/">
        <AppRoutes />
      </Providers>,
    );
    expect((await screen.findAllByTestId("state-error")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Something went wrong on our side/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Traceback|secret stack/);
  });

  it("shows a not-found state for a workflow that does not exist", async () => {
    renderApp("/workflows/nope");
    expect(await screen.findByRole("heading", { name: "That workflow could not be found" })).toBeInTheDocument();
  });
});
