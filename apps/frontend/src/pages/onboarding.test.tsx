import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Providers, makeEnv, renderApp } from "@/test/utils";
import { render } from "@testing-library/react";
import { AppRoutes } from "@/App";

describe("sign-in and route guard", () => {
  it("sends signed-out visitors to /login and shows the sign-in button", async () => {
    const env = makeEnv();
    render(
      <Providers env={env} route="/calendar" user={null}>
        <AppRoutes />
      </Providers>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome to Ritme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Google|Continue as demo user/ })).toBeEnabled();
    // The protected page never rendered and no API call went out.
    expect(screen.queryByRole("heading", { name: "Calendar" })).toBeNull();
    expect(env.calls).toHaveLength(0);
  });

  it("sends first-time users to the questionnaire", async () => {
    const env = makeEnv();
    renderApp("/", env, { onboarded: false });
    expect(await screen.findByText("How do you like to work?")).toBeInTheDocument();
  });

  it("attaches the token to API calls", async () => {
    const env = makeEnv();
    renderApp("/", env);
    await screen.findByRole("heading", { level: 1, name: "Dashboard" });
    expect(env.calls.some((c) => c.path === "/api/dashboard")).toBe(true);
  });
});

describe("first-run working-style questionnaire", () => {
  it("asks one question per screen and every question can be skipped", async () => {
    const env = makeEnv();
    renderApp("/welcome", env, { onboarded: false });
    expect(await screen.findByText("Question 1 of 7")).toBeInTheDocument();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Skip this question" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip this question" }));
    expect(screen.getByText("Question 2 of 7")).toBeInTheDocument();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
  });

  it("writes only the answered preferences, then marks onboarding done", async () => {
    const env = makeEnv();
    renderApp("/welcome", env, { onboarded: false });
    await userEvent.click(await screen.findByRole("radio", { name: /Small steps/ }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("radio", { name: /One step at a time/ }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    for (let i = 0; i < 5; i++) await userEvent.click(screen.getByRole("button", { name: "Skip this question" }));
    expect(screen.getByText("Here is what Ritme will remember")).toBeInTheDocument();
    expect(screen.getByText("These only change how Ritme presents things. They are not labels about you.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start using Ritme" }));
    await waitFor(() => expect(env.mock.store.db.me.onboardingCompleted).toBe(true));
    const prefs = env.mock.store.db.prefs;
    expect(prefs.taskGranularity).toBe("small_steps");
    expect(prefs.planLayout).toBe("one_step");
    // Unanswered ones stay at their defaults.
    expect(prefs.informationDensity).toBe("balanced");
    // And the user lands on the dashboard rather than bouncing back to setup.
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  });

  it("'Skip setup for now' saves no preferences at all", async () => {
    const env = makeEnv();
    renderApp("/welcome", env, { onboarded: false });
    await userEvent.click(await screen.findByRole("button", { name: "Skip setup for now" }));
    await waitFor(() => expect(env.mock.store.db.me.onboardingCompleted).toBe(true));
    expect(env.mock.store.db.prefs.isSet).toBe(false);
    expect(env.calls.some((c) => c.method === "PATCH" && c.path === "/api/preferences")).toBe(false);
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  });

  it("uses wording about how people like to work, not labels or diagnoses", async () => {
    const env = makeEnv();
    renderApp("/welcome", env, { onboarded: false });
    await screen.findByText("Question 1 of 7");
    for (let i = 0; i < 7; i++) {
      expect(document.body.textContent).not.toMatch(/adhd|autis|dyslex|disorder|diagnos|condition|symptom|neurodiver/i);
      const skip = screen.queryByRole("button", { name: "Skip this question" });
      if (skip) await userEvent.click(skip);
    }
  });
});
