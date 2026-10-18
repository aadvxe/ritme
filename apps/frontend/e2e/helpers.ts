import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Fails on any WCAG 2.0/2.1/2.2 A or AA violation on the current screen. */
export async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n   ")}`);
  expect(summary, `axe violations on ${label}:\n${summary.join("\n")}`).toEqual([]);
}

/** Accessible name of whatever has focus: aria-label, labelled-by text, <label>, or its own text. */
export async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "";
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    const by = el.getAttribute("aria-labelledby");
    if (by) return by.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length) return [...labels].map((l) => l.textContent ?? "").join(" ").trim();
    const wrap = el.closest("label");
    if (wrap) return (wrap.textContent ?? "").trim();
    return (el.textContent ?? "").trim();
  });
}

/** Tab (forward) until the focused control's name matches. Proves a control is reachable by keyboard alone. */
export async function tabTo(page: Page, name: RegExp | string, max = 120) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const n = await focusedName(page);
    if (typeof name === "string" ? n === name || n.startsWith(name) : name.test(n)) return;
  }
  throw new Error(`Could not reach "${String(name)}" with Tab within ${max} presses`);
}
