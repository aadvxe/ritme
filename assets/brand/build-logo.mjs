// Renders the Ritme logo files (SVG + transparent PNG) with real Poppins glyphs.
// Run from the repo root:  node assets/brand/build-logo.mjs
// Uses the Playwright + @fontsource/poppins already installed in the workspace; nothing to download.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const require = createRequire(resolve(root, "apps/frontend/package.json"));
const { chromium } = require("@playwright/test");

const fonts = resolve(root, "packages/design/node_modules/@fontsource/poppins/files");
const font = (w) => pathToFileURL(resolve(fonts, `poppins-latin-${w}-normal.woff2`)).href;

const INDIGO = "#4A55C2";
const INDIGO_LIGHT = "#5C67F2";
const NAVY = "#151D48";
const AMBER = "#FFD166";

/** The mark: indigo rounded square, white "R", amber dot (the beat in "rhythm"). 256-unit viewBox. */
const markInner = `
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${INDIGO_LIGHT}"/><stop offset="1" stop-color="${INDIGO}"/></linearGradient></defs>
  <rect width="256" height="256" rx="58" fill="url(#g)"/>
  <text x="112" y="186" text-anchor="middle" font-family="PoppinsLogo" font-weight="700" font-size="170" fill="#FFFFFF">R</text>
  <circle cx="196" cy="168" r="17" fill="${AMBER}"/>`;

const mark = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">${markInner}</svg>`;

/** Horizontal lockup: mark + "Rit" (bold) "me" (regular). `ink` is the colour of "Rit". */
const lockup = (ink, meColor) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="300" viewBox="0 0 1040 300">
  <g transform="translate(20 22) scale(1)">${markInner}</g>
  <text x="316" y="210" font-family="PoppinsLogo" font-size="170" letter-spacing="-4"><tspan font-weight="700" fill="${ink}">Rit</tspan><tspan font-weight="400" fill="${meColor}">me</tspan></text>
</svg>`;

const wordmark = (ink, meColor) => `
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="260" viewBox="0 0 720 260">
  <text x="360" y="190" text-anchor="middle" font-family="PoppinsLogo" font-size="190" letter-spacing="-4"><tspan font-weight="700" fill="${ink}">Rit</tspan><tspan font-weight="400" fill="${meColor}">me</tspan></text>
</svg>`;

const files = [
  { name: "ritme-mark", svg: mark(256), w: 256, h: 256, scale: 4 }, // 1024 x 1024
  { name: "ritme-logo", svg: lockup(NAVY, INDIGO), w: 1040, h: 300, scale: 2 }, // for light backgrounds
  { name: "ritme-logo-on-dark", svg: lockup("#F5F6FB", "#A9B0FF"), w: 1040, h: 300, scale: 2 },
  { name: "ritme-wordmark", svg: wordmark(NAVY, INDIGO), w: 720, h: 260, scale: 2 },
];

const out = resolve(here, "out");
mkdirSync(out, { recursive: true });

// Playwright's bundled browser may not be installed; fall back to the system Chrome or Edge.
let browser;
for (const opts of [{}, { channel: "chrome" }, { channel: "msedge" }]) {
  try {
    browser = await chromium.launch(opts);
    break;
  } catch {
    /* try the next one */
  }
}
if (!browser) throw new Error("No Chromium, Chrome or Edge available to render the logo.");
for (const f of files) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    @font-face{font-family:PoppinsLogo;font-weight:700;src:url("${font(700)}") format("woff2")}
    @font-face{font-family:PoppinsLogo;font-weight:400;src:url("${font(400)}") format("woff2")}
    html,body{margin:0;background:transparent}svg{display:block}</style>${f.svg.replace(/^\s+/, "")}`;
  const htmlPath = resolve(out, `${f.name}.html`);
  writeFileSync(htmlPath, html);
  const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: f.scale });
  await page.goto(pathToFileURL(htmlPath).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(out, `${f.name}.png`), omitBackground: true, clip: { x: 0, y: 0, width: f.w, height: f.h } });
  await page.close();
  // SVG source keeps text live (needs Poppins installed); the PNGs are the portable deliverable.
  writeFileSync(resolve(out, `${f.name}.svg`), f.svg);
  console.log("wrote", f.name, `${f.w * f.scale}x${f.h * f.scale}`);
}
await browser.close();
void readFileSync;
