import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY, applyDisplay, readDisplay, saveDisplay } from "@/lib/display";
import { makeEnv, renderApp } from "@/test/utils";

describe("Preferences page", () => {
  it("shows all seven settings, each with a 'what this changes' line", async () => {
    renderApp("/settings/working-style");
    await screen.findByRole("heading", { level: 3, name: "Step size" });
    const headings = ["Step size", "Default plan view", "Amount of detail", "Help with unclear requests", "Wording of drafted messages", "Time estimates", "Break cues"];
    for (const h of headings) expect(screen.getByRole("heading", { level: 3, name: h })).toBeInTheDocument();
    expect(screen.getAllByText("What this changes:")).toHaveLength(7);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(7);
  });

  it("saves a change straight away and can reset one setting to its default", async () => {
    const env = makeEnv();
    renderApp("/settings/working-style", env);
    await userEvent.click(await screen.findByRole("radio", { name: /Larger blocks/ }));
    await waitFor(() => expect(env.mock.store.db.prefs.taskGranularity).toBe("larger_blocks"));
    expect(env.mock.store.db.prefs.consentVersion).toBeTruthy();
    const section = screen.getByRole("heading", { level: 3, name: "Step size" }).closest("section") as HTMLElement;
    await userEvent.click(within(section).getByRole("button", { name: "Reset to default" }));
    await waitFor(() => expect(env.mock.store.db.prefs.taskGranularity).toBe("balanced"));
  });

  it("deletes all preferences only after confirming", async () => {
    const env = makeEnv();
    await env.api.preferences.patch({ planLayout: "timeline" });
    renderApp("/settings/working-style", env);
    await userEvent.click(await screen.findByRole("button", { name: "Delete my preferences" }));
    const dlg = await screen.findByRole("dialog");
    expect(env.mock.store.db.prefs.isSet).toBe(true);
    await userEvent.click(within(dlg).getByRole("button", { name: "Delete my preferences" }));
    await waitFor(() => expect(env.mock.store.db.prefs.isSet).toBe(false));
    expect(env.mock.store.db.prefs.planLayout).toBe("full_list");
  });

  it("imports a preferences file, ignoring anything that isn't one of the seven settings", async () => {
    const env = makeEnv();
    renderApp("/settings/working-style", env);
    await screen.findByRole("heading", { level: 3, name: "Step size" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify({ ritmePreferences: 1, taskGranularity: "small_steps", planLayout: "nonsense", diagnosis: "x" })], "p.json", { type: "application/json" });
    await userEvent.upload(input, file);
    await waitFor(() => expect(env.mock.store.db.prefs.taskGranularity).toBe("small_steps"));
    expect(env.mock.store.db.prefs.planLayout).toBe("full_list");
  });

  it("refuses a file that isn't a preferences file and changes nothing", async () => {
    const env = makeEnv();
    renderApp("/settings/working-style", env);
    await screen.findByRole("heading", { level: 3, name: "Step size" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["not json"], "p.json", { type: "application/json" }));
    await new Promise((r) => setTimeout(r, 100));
    expect(env.mock.store.db.prefs.isSet).toBe(false);
  });
});

describe("Display settings", () => {
  it("writes text size, density and reduce-motion to data attributes on <html>", async () => {
    renderApp("/settings/display");
    await userEvent.click(await screen.findByRole("radio", { name: "Large" }));
    expect(document.documentElement.dataset.textSize).toBe("large");
    await userEvent.click(screen.getByRole("radio", { name: "Compact" }));
    expect(document.documentElement.dataset.density).toBe("compact");
    await userEvent.click(screen.getByRole("radio", { name: "Reduce motion" }));
    expect(document.documentElement.dataset.reduceMotion).toBe("on");
    // And it is remembered on this device.
    expect(readDisplay()).toEqual({ textSize: "large", density: "compact", reduceMotion: "on" });
    await userEvent.click(screen.getByRole("button", { name: "Reset display settings" }));
    expect(document.documentElement.dataset.textSize).toBe("medium");
    expect(readDisplay()).toEqual(DEFAULT_DISPLAY);
  });

  it("applyDisplay sets the three attributes the stylesheet keys off", () => {
    const el = document.createElement("html");
    applyDisplay({ textSize: "small", density: "spacious", reduceMotion: "off" }, el);
    expect(el.dataset).toMatchObject({ textSize: "small", density: "spacious", reduceMotion: "off" });
    saveDisplay(DEFAULT_DISPLAY);
  });
});

describe("Connected devices", () => {
  it("lists connected extensions and disconnects one after confirming", async () => {
    const env = makeEnv();
    await env.api.extension.connect({ extensionId: "abc", label: "Work laptop" });
    renderApp("/settings/devices", env);
    expect(await screen.findByText("Work laptop")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.getByText("Disconnected")).toBeInTheDocument());
    expect(env.mock.store.db.devices[0]?.revokedAt).toBeTruthy();
  });

  it("explains the empty state", async () => {
    renderApp("/settings/devices");
    expect(await screen.findByText("No extension is connected.")).toBeInTheDocument();
  });
});
