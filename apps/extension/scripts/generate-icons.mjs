// Writes public/icons/icon-{16,32,48,128}.png: indigo rounded square with a white ring and dot.
// No dependencies (zlib only). Re-run only if the icon design changes.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../public/icons");
mkdirSync(outDir, { recursive: true });

const INDIGO = [74, 85, 194];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function coverage(size, x, y) {
  // 4x4 supersampling for smooth edges.
  let inside = 0;
  const radius = size * 0.22;
  const cx = size / 2;
  for (let sy = 0; sy < 4; sy++)
    for (let sx = 0; sx < 4; sx++) {
      const px = x + (sx + 0.5) / 4;
      const py = y + (sy + 0.5) / 4;
      const dx = Math.max(radius - px, 0, px - (size - radius));
      const dy = Math.max(radius - py, 0, py - (size - radius));
      if (dx * dx + dy * dy <= radius * radius) inside++;
    }
  const alpha = inside / 16;
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cx);
  const ring = d <= size * 0.3 && d >= size * 0.2;
  const dot = d <= size * 0.09;
  return { alpha, white: ring || dot };
}

for (const size of [16, 32, 48, 128]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const { alpha, white } = coverage(size, x, y);
      const c = white ? WHITE : INDIGO;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
      raw[o + 3] = Math.round(alpha * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(resolve(outDir, `icon-${size}.png`), png);
}
console.log("icons written to", outDir);
