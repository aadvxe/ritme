import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, tabTo } from "./helpers";

/**
 * The full demo journey against the mock API:
 * sign in → working style → answer blockers → plan → approve → Verified → Something changed → reload → privacy.
 */
async function signInAndSetUp(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to Ritme" })).toBeVisible();
  await expectAccessible(page, "login");
  await page.getByRole("button", { name: "Continue as demo user" }).click();

  // First-run questionnaire: one question per screen, skippable.
  await expect(page.getByText("Question 1 of 7")).toBeVisible();
  await expectAccessible(page, "questionnaire");
  await page.getByRole("radio", { name: /Small steps/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: /One step at a time/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Skip this question" }).click();
  await page.getByRole("button", { name: "Start using Ritme" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
}

test("demo journey: capture to Verified, change, reload, privacy", async ({ page }) => {
  await signInAndSetUp(page);

  await expect(page.getByRole("region", { name: /Your next best step/ })).toContainText("Which Friday");
  await expectAccessible(page, "dashboard");

  // Open the labelled demo workflow (Clarity Canvas).
  await page.getByRole("link", { name: /Go to this step/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Get the proposal over the line/ })).toBeVisible();
  const missing = page.getByRole("region", { name: /Missing or unclear/ });
  await expect(missing).toContainText("which Friday");
  await expect(missing).toContainText("who needs to agree is not stated");
  await expectAccessible(page, "clarity canvas (truth board)");

  // Blockers: answer one with a suggestion, defer the other with an explicit assumption.
  const q1 = missing.getByTestId("question-block").first();
  await q1.getByRole("button", { name: "This Friday, end of day" }).click();
  await q1.getByRole("button", { name: "Save answer" }).click();
  await expect(page.getByRole("region", { name: /Known facts & rules/ })).toContainText("Deadline: This Friday, end of day");

  const q2 = page.getByRole("region", { name: /Missing or unclear/ }).getByTestId("question-block").first();
  await q2.getByRole("button", { name: "Draft clarification" }).click();
  const draft = page.getByRole("dialog");
  await expect(draft.getByLabel(/Message \(editable, copy-only\)/)).toHaveValue(/Who needs to be aligned/);
  await expectAccessible(page, "draft clarification dialog");
  await draft.getByRole("button", { name: "Close" }).first().click();
  await q2.getByRole("button", { name: "Continue with an assumption" }).click();
  await page.getByLabel("Assumption to plan with").fill("Priya and Sam need to agree");
  await page.getByRole("button", { name: "Continue with this assumption" }).click();
  await expect(page.getByTestId("assumption-label")).toContainText("Working assumption: Priya and Sam need to agree");

  // Plan: defaults to one step (preference), shows why, and morphs.
  await page.getByRole("button", { name: "Create a plan draft" }).click();
  await expect(page.getByTestId("view-one-step")).toBeVisible();
  await expect(page.getByTestId("plan-why")).toContainText("one step at a time");
  await expect(page.getByTestId("steps-waiting")).toContainText("5 more steps waiting");
  await page.getByRole("tab", { name: "Checklist" }).click();
  await expect(page.getByTestId("plan-item")).toHaveCount(6);
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByTestId("view-timeline")).toBeVisible();
  await expectAccessible(page, "plan timeline");
  await page.getByRole("tab", { name: "One step" }).click();

  // Approval card previews exactly what will be written; nothing exists before Approve.
  await page.getByRole("button", { name: "Review & approve" }).click();
  const card = page.getByTestId("approval-card");
  await expect(card.getByTestId("approval-count")).toHaveText("Create 6 tasks");
  await expect(page.getByTestId("task-row")).toHaveCount(0);
  await expectAccessible(page, "approval card");
  await card.getByRole("button", { name: "Approve & create tasks" }).click();

  const verified = page.getByTestId("verified-summary");
  await expect(verified).toContainText("Verified");
  await expect(verified.getByTestId("verified-ids")).toContainText("task_");
  await expect(page.getByTestId("task-row")).toHaveCount(6);
  await expectAccessible(page, "verified plan and tasks");

  // Something changed: two paths, blast radius, Before/After, one approval.
  await page.getByRole("button", { name: "Something changed" }).click();
  const dlg = page.getByRole("dialog", { name: "Something changed" });
  await expect(dlg.getByRole("radio", { name: /The request changed/ })).toBeChecked();
  await dlg.getByLabel("New deadline").fill("2026-12-31T17:00");
  await dlg.getByRole("button", { name: "Show what would change" }).click();
  await expect(dlg.getByTestId("diff")).toBeVisible();
  await expect(dlg.getByText("Before").first()).toBeVisible();
  await expectAccessible(page, "before/after diff");
  await dlg.getByRole("button", { name: "Approve changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Deadline .*2026/).first()).toBeVisible();

  // Reload: resumes from persisted state.
  await page.reload();
  await expect(page.getByTestId("verified-summary")).toContainText("Verified");
  await expect(page.getByTestId("task-row")).toHaveCount(6);
  await expect(page.getByTestId("resume-card")).toContainText("Next action");

  // Dashboard schedule section: Week and Agenda.
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  const schedule = page.getByRole("region", { name: "Schedule & Commitments" });
  await expect(schedule.getByTestId("week-day")).toHaveCount(7);
  await schedule.getByRole("tab", { name: "Agenda" }).click();
  await expect(schedule.getByRole("heading", { name: "Chronological agenda" })).toBeVisible();
  await expectAccessible(page, "dashboard schedule (agenda)");

  // Calendar: three views, same items, never overdue wording.
  await page.getByRole("link", { name: "Calendar" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  await expectAccessible(page, "calendar week");
  await page.getByRole("tab", { name: "Agenda" }).click();
  await expectAccessible(page, "calendar agenda");
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expectAccessible(page, "calendar timeline");
  await expect(page.locator("main")).not.toContainText(/overdue|missed/i);

  // Library, Settings, Privacy.
  await page.getByRole("link", { name: "Guidelines" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Workplace Guidelines" })).toBeVisible();
  await expect(page.getByTestId("doc-card")).toContainText("Intern Onboarding Doc");
  await expect(page.getByTestId("doc-card")).toContainText("Active grounding");
  await expectAccessible(page, "guidelines");
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expectAccessible(page, "settings: working style");
  await page.getByRole("tab", { name: "Display" }).click();
  await page.getByRole("radio", { name: "Large" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  await expectAccessible(page, "settings: display (large text)");
  await page.getByRole("radio", { name: "Medium" }).click();

  await page.getByRole("tab", { name: "Privacy & data" }).click();
  await expect(page.getByRole("heading", { name: "No employer access" })).toBeVisible();
  await expectAccessible(page, "settings: privacy & data");

  // Delete the demo capture from Privacy & Data.
  const list = page.getByTestId("privacy-captures");
  await list.getByRole("button", { name: /Delete: Proposal by Friday/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("privacy-captures")).toHaveCount(0);
});

test("keyboard only: paste a request, answer, plan and approve without a mouse", async ({ page }) => {
  await signInAndSetUp(page);

  // Capture by keyboard.
  await page.getByRole("heading", { level: 1, name: "Dashboard" }).focus().catch(() => undefined);
  await tabTo(page, "Text to save");
  await page.keyboard.type("Please send the Q3 report soon. Make sure everyone has signed off.");
  await tabTo(page, "Save to Ritme");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("workflow-page")).toBeVisible();

  // Answer the first blocker.
  await tabTo(page, "Your answer");
  await page.keyboard.type("Friday 11 December 2026 at 5pm");
  await tabTo(page, "Save answer");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: /Known facts & rules/ })).toContainText("Deadline: Friday 11 December 2026");

  // Defer the second with an assumption, all by keyboard.
  await tabTo(page, "Continue with an assumption");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.type("Priya and Sam approve");
  await tabTo(page, "Continue with this assumption");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("assumption-label")).toBeVisible();

  // Plan, then approval card, then approve.
  await tabTo(page, "Create a plan draft");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("view-one-step")).toBeVisible();
  await tabTo(page, "Review & approve");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("approval-card")).toBeVisible();
  await tabTo(page, "Approve & create tasks");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("verified-summary")).toContainText("Verified");
});

test("reduced motion: login blobs do not animate", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/login");
  const blob = page.locator(".rt-blob").first();
  await expect(blob).toBeVisible();
  const duration = await blob.evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.01);
  await ctx.close();
});
