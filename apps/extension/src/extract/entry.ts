/**
 * Injected on demand by chrome.scripting.executeScript({ files: ["extract.js"] }) after the user
 * triggers a capture. Registers one function; the caller invokes it once and deletes it.
 * Nothing observes the page and nothing stays running.
 */
import { extractFromDocument } from "./run";
import type { ExtractionOptions, ExtractionResult } from "./types";

declare global {
  var __ritmeExtract: ((opts?: ExtractionOptions) => ExtractionResult) | undefined;
}

globalThis.__ritmeExtract = (opts) => {
  const sel = window.getSelection();
  const anchor = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
  return extractFromDocument(
    document,
    { hostname: location.hostname, href: location.href },
    { text: sel ? sel.toString() : "", anchor },
    opts,
  );
};
