// Indexed PNG / APNG writer (fflate deflate) and PNG decoding (fast-png). Spec 20, 22.
// PNG chunk layout: u32 BE length, 4-byte type, data, CRC-32 over type + data.

import { zlibSync } from 'fflate';
import { decode as fastDecode } from 'fast-png';
import type { RGB } from '@omf/formats';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Running CRC-32 (PNG polynomial); finish with `^ 0xffffffff`. */
export function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
  let c = crc;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return c;
}

class ByteSink {
  private parts: Uint8Array[] = [];
  push(b: Uint8Array): void {
    this.parts.push(b);
  }
  chunk(type: string, data: Uint8Array): void {
    const head = new Uint8Array(8);
    new DataView(head.buffer).setUint32(0, data.length);
    for (let i = 0; i < 4; i++) head[4 + i] = type.charCodeAt(i);
    const crc = (crc32(data, crc32(head.subarray(4))) ^ 0xffffffff) >>> 0;
    const tail = new Uint8Array(4);
    new DataView(tail.buffer).setUint32(0, crc);
    this.parts.push(head, data, tail);
  }
  bytes(): Uint8Array {
    const n = this.parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function u32be(...vals: number[]): Uint8Array {
  const b = new Uint8Array(vals.length * 4);
  const dv = new DataView(b.buffer);
  vals.forEach((v, i) => dv.setUint32(i * 4, v));
  return b;
}

function ihdr(w: number, h: number): Uint8Array {
  const b = new Uint8Array(13);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  b[8] = 8; // bit depth
  b[9] = 3; // colour type: palette
  return b;
}

function plte(palette: RGB[]): Uint8Array {
  const b = new Uint8Array(palette.length * 3);
  palette.forEach((c, i) => b.set(c, i * 3));
  return b;
}

/** Scanlines with filter byte 0, deflated. */
function idat(w: number, h: number, indices: Uint8Array): Uint8Array {
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) raw.set(indices.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  return zlibSync(raw, { level: 9 });
}

export interface IndexedImageData {
  width: number;
  height: number;
  /** One palette index per pixel. */
  indices: Uint8Array;
  /** Up to 256 entries. */
  palette: RGB[];
  /** Palette index rendered fully transparent, or null. */
  transparentIndex: number | null;
}

function writeHeader(
  sink: ByteSink,
  img: { width: number; height: number; palette: RGB[]; transparentIndex: number | null },
): void {
  sink.push(SIGNATURE);
  sink.chunk('IHDR', ihdr(img.width, img.height));
  sink.chunk('PLTE', plte(img.palette));
  if (img.transparentIndex !== null) {
    const t = new Uint8Array(img.transparentIndex + 1).fill(255);
    t[img.transparentIndex] = 0;
    sink.chunk('tRNS', t);
  }
}

export function encodeIndexedPng(img: IndexedImageData): Uint8Array {
  const sink = new ByteSink();
  writeHeader(sink, img);
  sink.chunk('IDAT', idat(img.width, img.height, img.indices));
  sink.chunk('IEND', new Uint8Array(0));
  return sink.bytes();
}

export interface ApngFrame {
  indices: Uint8Array;
  /** Frame delay in milliseconds. */
  delayMs: number;
}

/**
 * fcTL delay as u16 numerator/denominator: milliseconds when they fit, else
 * coarser units, so long frames (NORTH_AM.BK holds one for 200 s) do not wrap.
 */
export function apngDelay(ms: number): [number, number] {
  const t = Math.max(0, ms);
  for (const den of [1000, 100, 10, 1]) {
    const num = Math.round((t * den) / 1000);
    if (num <= 0xffff) return [num, den];
  }
  return [0xffff, 1];
}

/**
 * Full-canvas frames; consecutive identical frames should already be merged by
 * the caller. Every frame replaces the canvas (dispose none, blend source).
 * The first frame is the IDAT, so viewers without APNG support show it.
 */
export function encodeApng(
  header: { width: number; height: number; palette: RGB[]; transparentIndex: number | null },
  frames: ApngFrame[],
  loops = 0,
): Uint8Array {
  const sink = new ByteSink();
  writeHeader(sink, header);
  sink.chunk('acTL', u32be(frames.length, loops));
  // fcTL and fdAT chunks share one sequence number counter.
  let seq = 0;
  frames.forEach((f, i) => {
    const fc = new Uint8Array(26);
    const dv = new DataView(fc.buffer);
    dv.setUint32(0, seq++);
    dv.setUint32(4, header.width);
    dv.setUint32(8, header.height);
    dv.setUint32(12, 0);
    dv.setUint32(16, 0);
    const [num, den] = apngDelay(f.delayMs);
    dv.setUint16(20, num);
    dv.setUint16(22, den);
    fc[24] = 0; // dispose: none
    fc[25] = 0; // blend: source
    sink.chunk('fcTL', fc);
    const data = idat(header.width, header.height, f.indices);
    if (i === 0) {
      sink.chunk('IDAT', data);
    } else {
      const fd = new Uint8Array(4 + data.length);
      new DataView(fd.buffer).setUint32(0, seq++);
      fd.set(data, 4);
      sink.chunk('fdAT', fd);
    }
  });
  sink.chunk('IEND', new Uint8Array(0));
  return sink.bytes();
}

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel. */
  rgba: Uint8ClampedArray;
  /** Present for palette PNGs. */
  indexed?: { indices: Uint8Array; palette: RGB[]; alpha: Uint8Array };
}

interface ColourKey {
  /** Raw sample values at the image's bit depth: [grey] or [r, g, b]. */
  key: number[];
  bytes: Uint8Array;
}

/**
 * Removes a grey/RGB tRNS chunk (a colour key) and returns its key: fast-png
 * mistakes it for per-pixel alpha and refuses images of fewer than 3 pixels.
 */
function takeColourKey(bytes: Uint8Array): ColourKey | null {
  if (bytes.length < 33) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const colourType = bytes[25];
  if (colourType !== 0 && colourType !== 2) return null;
  let o = 8;
  while (o + 12 <= bytes.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    if (type === 'IDAT' || type === 'IEND') return null;
    if (type === 'tRNS') {
      const n = colourType === 0 ? 1 : 3;
      if (len < n * 2) return null;
      const key = Array.from({ length: n }, (_, k) => dv.getUint16(o + 8 + k * 2));
      const out = new Uint8Array(bytes.length - (len + 12));
      out.set(bytes.subarray(0, o));
      out.set(bytes.subarray(o + len + 12), o);
      return { key, bytes: out };
    }
    o += len + 12;
  }
  return null;
}

/** Unpacks 1/2/4-bit samples (rows padded to whole bytes) to one value per sample. */
function unpackSamples(data: Uint8Array, width: number, height: number, depth: number): Uint8Array {
  const perByte = 8 / depth;
  const rowBytes = Math.ceil(width / perByte);
  const mask = (1 << depth) - 1;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte = data[y * rowBytes + Math.floor(x / perByte)]!;
      out[y * width + x] = (byte >> (8 - depth * ((x % perByte) + 1))) & mask;
    }
  }
  return out;
}

type FastPng = ReturnType<typeof fastDecode>;

/** Palette PNG: indices unpacked to one byte each, alpha from PLTE entries or tRNS. */
function decodePalettePng(p: FastPng): DecodedPng {
  const { width, height, depth } = p;
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  const data = p.data as Uint8Array;
  const indices = depth === 8 ? data.slice(0, n) : unpackSamples(data, width, height, depth);
  const palette: RGB[] = p.palette!.map((c) => [c[0]!, c[1]!, c[2]!]);
  const alpha = new Uint8Array(palette.length).fill(255);
  p.palette!.forEach((c, i) => {
    if (c.length > 3) alpha[i] = c[3]!;
  });
  if (p.transparency) p.transparency.forEach((a, i) => (alpha[i] = a));
  for (let i = 0; i < n; i++) {
    const k = indices[i]!;
    const c = palette[k] ?? [0, 0, 0];
    rgba.set([c[0], c[1], c[2], alpha[k] ?? 255], i * 4);
  }
  return { width, height, rgba, indexed: { indices, palette, alpha } };
}

/** Grey or RGB PNG, with or without alpha, at any depth; `key` samples become transparent. */
function decodeTrueColourPng(p: FastPng, key: number[] | undefined): DecodedPng {
  const { width, height, depth, channels } = p;
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  // Greyscale below 8 bits arrives packed; scale every depth to 8 bits.
  const src = depth < 8 ? unpackSamples(p.data as Uint8Array, width, height, depth) : p.data;
  const scale = 255 / ((1 << depth) - 1);
  for (let i = 0; i < n; i++) {
    const raw = (k: number): number => src[i * channels + k]!;
    const v = (k: number): number => Math.round(raw(k) * scale);
    const keyed = !!key && key.every((kv, k) => raw(k) === kv);
    if (channels >= 3) {
      rgba[i * 4] = v(0);
      rgba[i * 4 + 1] = v(1);
      rgba[i * 4 + 2] = v(2);
      rgba[i * 4 + 3] = keyed ? 0 : channels === 4 ? v(3) : 255;
    } else {
      const g = v(0);
      rgba[i * 4] = g;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = g;
      rgba[i * 4 + 3] = keyed ? 0 : channels === 2 ? v(1) : 255;
    }
  }
  return { width, height, rgba };
}

/** Decodes any PNG to RGBA, keeping palette indices for palette images. */
export function decodePng(bytes: Uint8Array): DecodedPng {
  const ck = takeColourKey(bytes);
  const p = fastDecode(ck ? ck.bytes : bytes);
  return p.palette ? decodePalettePng(p) : decodeTrueColourPng(p, ck?.key);
}
