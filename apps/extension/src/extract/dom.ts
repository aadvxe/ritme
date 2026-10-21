/** Small DOM helpers shared by the adapters. Pure functions of a Document/Element (no globals). */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
const BLOCK_TAGS = new Set(["P", "DIV", "LI", "UL", "OL", "BLOCKQUOTE", "PRE", "TR", "H1", "H2", "H3", "H4", "H5", "H6"]);

function isHidden(el: Element): boolean {
  if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return true;
  const style = (el as HTMLElement).style;
  return style?.display === "none";
}

/** innerText stand-in that works in jsdom: keeps line breaks, reads emoji <img alt>, skips hidden/excluded nodes. */
export function readText(root: Element, exclude?: string): string {
  const out: string[] = [];
  const endsWithBreak = () => out.length === 0 || /\n$/.test(out[out.length - 1] ?? "");

  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out.push(node.nodeValue ?? "");
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (SKIP_TAGS.has(el.tagName) || isHidden(el)) return;
    if (exclude && el !== root && el.matches(exclude)) return;
    if (el.tagName === "BR") {
      out.push("\n");
      return;
    }
    if (el.tagName === "IMG") {
      out.push(el.getAttribute("alt") ?? "");
      return;
    }
    const block = BLOCK_TAGS.has(el.tagName);
    if (block && !endsWithBreak()) out.push("\n");
    el.childNodes.forEach(walk);
    if (block && !endsWithBreak()) out.push("\n");
  };
  walk(root);

  return out
    .join("")
    .replace(/[ \t ‎‏]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Elements matched by the first selector that matches anything. */
export function firstMatches(root: ParentNode, selectors: string[]): Element[] {
  for (const sel of selectors) {
    const found = Array.from(root.querySelectorAll(sel));
    if (found.length) return found;
  }
  return [];
}

export function firstEl(root: ParentNode, selectors: string[]): Element | null {
  return firstMatches(root, selectors)[0] ?? null;
}

/** Drops elements nested inside another match, so a message is not counted twice. */
export function outermost(els: Element[]): Element[] {
  return els.filter((e) => !els.some((o) => o !== e && o.contains(e)));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Normalises epoch seconds / ISO timestamps to "YYYY-MM-DD HH:mm" (local time). Other strings pass through. */
export function formatTime(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let date: Date | null = null;
  if (/^\d{9,13}(\.\d+)?$/.test(value)) {
    const n = Number(value);
    date = new Date(n > 1e11 ? n : n * 1000);
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    date = new Date(value);
  }
  if (date && !Number.isNaN(date.getTime())) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return oneLine(value);
}

/** Reads a timestamp from the most precise attribute available, falling back to the visible text. */
export function timeFrom(el: Element): string | null {
  const raw =
    el.getAttribute("datetime") ??
    el.getAttribute("data-ts") ??
    el.getAttribute("aria-label") ??
    el.getAttribute("title") ??
    el.textContent;
  return formatTime(raw);
}
