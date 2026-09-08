import { deflateSync } from 'node:zlib';
import { crc32 } from 'node:zlib';

/**
 * Minimal PNG encoder used only to generate placeholder evidence images for the
 * demo dataset. Real deployments store the inspector's original camera file
 * untouched — nothing in the app re-encodes evidence.
 */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData) >>> 0, 0);
  return Buffer.concat([length, typeAndData, crc]);
}

type RGB = [number, number, number];

export function placeholderPng(
  width: number,
  height: number,
  base: RGB,
  accent: RGB,
  seed: number,
): Buffer {
  // Deterministic pseudo-random so re-seeding produces identical bytes.
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // A few soft blocks so the thumbnail reads as an image rather than a swatch.
  const blocks = Array.from({ length: 7 }, () => ({
    x: Math.floor(rand() * width),
    y: Math.floor(rand() * height),
    w: Math.floor(width * (0.12 + rand() * 0.3)),
    h: Math.floor(height * (0.1 + rand() * 0.28)),
    a: 0.18 + rand() * 0.35,
  }));

  const raw = Buffer.alloc((width * 3 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      // Vertical gradient from base toward accent.
      const t = y / height;
      let r = base[0] + (accent[0] - base[0]) * t * 0.55;
      let g = base[1] + (accent[1] - base[1]) * t * 0.55;
      let b = base[2] + (accent[2] - base[2]) * t * 0.55;

      for (const blk of blocks) {
        if (x >= blk.x && x < blk.x + blk.w && y >= blk.y && y < blk.y + blk.h) {
          r = r * (1 - blk.a) + accent[0] * blk.a;
          g = g * (1 - blk.a) + accent[1] * blk.a;
          b = b * (1 - blk.a) + accent[2] * blk.a;
        }
      }

      // Slight grain.
      const n = (rand() - 0.5) * 10;
      raw[p++] = clamp(r + n);
      raw[p++] = clamp(g + n);
      raw[p++] = clamp(b + n);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Muted "before" (problem) and "after" (resolved) palettes. */
export const BEFORE_PALETTE: [RGB, RGB] = [
  [78, 70, 62],
  [150, 116, 72],
];
export const AFTER_PALETTE: [RGB, RGB] = [
  [62, 74, 70],
  [92, 138, 116],
];
