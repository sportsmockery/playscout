// Generates PlayScout mobile launcher/splash assets as flat PNGs.
// Run from repo root: `node mobile/scripts/generate-assets.mjs`
//
// Self-contained: uses only Node's built-in zlib so it runs with no installed
// dependencies. Rasterizes a restrained "scout chevron" mark (two ascending
// gold strokes reading as motion / analysis — never a cartoon football).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(OUT, { recursive: true });

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const NAVY = hex('#080D16');
const GOLD = hex('#B8942F');
const GOLD_LIGHT = hex('#D6B85A');
const MUTED = hex('#2A2A1E');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // filter each scanline with filter byte 0 (none)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Antialiased thick-line brush over an RGBA framebuffer.
function drawLine(fb, w, h, x0, y0, x1, y1, radius, color) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - radius - 1));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + radius + 1));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - radius - 1));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + radius + 1));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let t = ((x - x0) * dx + (y - y0) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const dist = Math.hypot(x - px, y - py);
      const a = Math.max(0, Math.min(1, radius - dist + 0.5));
      if (a <= 0) continue;
      const i = (y * w + x) * 4;
      fb[i] = Math.round(fb[i] * (1 - a) + color[0] * a);
      fb[i + 1] = Math.round(fb[i + 1] * (1 - a) + color[1] * a);
      fb[i + 2] = Math.round(fb[i + 2] * (1 - a) + color[2] * a);
      fb[i + 3] = Math.max(fb[i + 3], Math.round(255 * a));
    }
  }
}

function render(size, { field = true } = {}) {
  const fb = Buffer.alloc(size * size * 4);
  if (field) {
    for (let i = 0; i < size * size; i++) {
      fb[i * 4] = NAVY[0];
      fb[i * 4 + 1] = NAVY[1];
      fb[i * 4 + 2] = NAVY[2];
      fb[i * 4 + 3] = 255;
    }
  }
  const cx = size / 2;
  const cy = size / 2;
  const s = size * 0.27;
  const r = size * 0.05;
  // lower muted chevron
  drawLine(fb, size, size, cx - s, cy + s * 0.55, cx, cy - s * 0.15, r, field ? MUTED : GOLD);
  drawLine(fb, size, size, cx, cy - s * 0.15, cx + s, cy + s * 0.55, r, field ? MUTED : GOLD);
  // upper gold chevron
  drawLine(fb, size, size, cx - s, cy - s * 0.15, cx, cy - s * 0.85, r, GOLD);
  drawLine(fb, size, size, cx, cy - s * 0.85, cx + s, cy - s * 0.15, r, GOLD_LIGHT);
  return encodePNG(size, size, fb);
}

function save(name, size, opts) {
  writeFileSync(join(OUT, name), render(size, opts));
  // eslint-disable-next-line no-console
  console.log('wrote', name, `${size}x${size}`);
}

save('icon.png', 1024);
save('adaptive-icon.png', 1024);
save('splash.png', 1284);
save('notification-icon.png', 96, { field: false });
save('favicon.png', 48);
