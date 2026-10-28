// Renders an animation tick by tick into palette-indexed frames and encodes
// them as APNG, GIF or a PNG strip (spec 20 §3). Runs in a Web Worker
// (src/workers/export.worker.ts), so everything here is DOM-free.

import { GIFEncoder } from 'gifenc';
import {
  TRANSPARENT,
  pickTransparentIndex,
  resolveSharedImages,
  spriteIndexOfFrame,
  type Animation,
  type RGB,
  type Script,
  type Sprite,
} from '@omf/formats';
import { Simulator, shakeOffset, type SimState } from './simulate';
import {
  compositeIndices,
  decodedOf,
  playerShift,
  SCENE_H,
  SCENE_W,
  type DrawSprite,
} from '../canvas/render';
import { animationOrigin, spriteRect, type Point } from './scene';
import { encodeApng, encodeIndexedPng } from '../codecs/png';
import type { DocKind } from './doc';

/** Ticks above which the dialog asks before rendering. */
export const LARGE_EXPORT_TICKS = 5000;

export interface ExportOptions {
  kind: DocKind;
  animation: Animation;
  animations: Iterable<Animation>;
  script: Script;
  /** Background bitmap (a BKFile fits), or null for transparent. */
  background: { background: Uint8Array; backgroundWidth: number } | null;
  playerOffset: number;
  facingLeft: boolean;
  startTick: number;
  endTick: number;
  zoom: number;
  msPerTick: number;
}

export interface RenderedFrame {
  /** Palette indices, TRANSPARENT where nothing is drawn; size width × height. */
  pixels: Uint16Array;
  delayMs: number;
}

export interface Rendered {
  width: number;
  height: number;
  frames: RenderedFrame[];
  /** Key index for transparency, or null if no transparency or no free index. */
  transparentIndex: number | null;
  hasTransparency: boolean;
}

/** Nearest-neighbour upscale of a w × h image by integer `z`. */
function scale(src: Uint16Array, w: number, h: number, z: number): Uint16Array {
  if (z === 1) return src;
  const out = new Uint16Array(w * z * h * z);
  for (let y = 0; y < h * z; y++)
    for (let x = 0; x < w * z; x++)
      out[y * w * z + x] = src[Math.floor(y / z) * w + Math.floor(x / z)]!;
  return out;
}

const same = (a: Uint16Array, b: Uint16Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The sprite drawn at simulator state `st`, placed like SceneCanvas does:
 * origin plus movement plus the frame's ox/oy, mirrored when facing left and
 * flipped by the r/f tags. Null when the frame names no existing sprite.
 */
function spriteAt(
  o: ExportOptions,
  st: SimState,
  origin: Point,
  owners: Map<Sprite, Sprite>,
): DrawSprite | null {
  const f = o.script.frames[st.frameIndex];
  const s = o.animation.sprites[f ? spriteIndexOfFrame(f) : -1];
  if (!s) return null;
  const d = decodedOf(s, owners.get(s));
  const ox = f?.tags.find((x) => x.key === 'ox')?.value ?? 0;
  const oy = f?.tags.find((x) => x.key === 'oy')?.value ?? 0;
  const pos = { x: origin.x + st.x + ox, y: origin.y + st.y + oy };
  const r = spriteRect(s, pos, o.facingLeft, d.width, d.height);
  return {
    decoded: d,
    x: r.x,
    y: r.y,
    flipX: r.flipX !== st.flipX,
    flipY: st.flipY,
    shift: o.kind === 'af' ? playerShift(o.playerOffset) : undefined,
  };
}

/**
 * One frame per tick, consecutive identical ticks merged with summed delay.
 * `onProgress(done, total)` is called every 100 ticks.
 */
export function renderAnimation(
  o: ExportOptions,
  onProgress?: (done: number, total: number) => void,
): Rendered {
  const sim = new Simulator(o.script, {
    direction: o.facingLeft ? -1 : 1,
    loop: false,
    hold: null,
  });
  sim.seek(o.startTick);
  const owners = resolveSharedImages(o.animations);
  // Without a background the sprites are centred, as in the preview.
  const origin = animationOrigin(o.kind, o.animation, {
    centred: o.background === null,
    facingLeft: o.facingLeft,
  });
  const bg = o.background;
  const frames: RenderedFrame[] = [];
  const ticks = Math.max(1, o.endTick - o.startTick);
  for (let t = 0; t < ticks; t++) {
    if (onProgress && t % 100 === 0) onProgress(t, ticks);
    const st = sim.state;
    const sprite = spriteAt(o, st, origin, owners);
    const px = compositeIndices({
      width: SCENE_W,
      height: SCENE_H,
      background: bg?.background ?? null,
      backgroundWidth: bg?.backgroundWidth,
      sprites: sprite ? [sprite] : [],
      offsetX: shakeOffset(st.shakeX, st.elapsed),
      offsetY: shakeOffset(st.shakeY, st.elapsed),
    });
    const last = frames[frames.length - 1];
    if (last && same(last.pixels, px)) last.delayMs += o.msPerTick;
    else frames.push({ pixels: px, delayMs: o.msPerTick });
    if (st.finished) break;
    sim.step();
  }
  onProgress?.(ticks, ticks);
  const hasTransparency = frames.some((f) => f.pixels.some((p) => p === TRANSPARENT));
  const transparentIndex = hasTransparency
    ? pickTransparentIndex(
        frames.map((f) => ({ width: SCENE_W, height: SCENE_H, pixels: f.pixels })),
      )
    : null;
  return {
    width: SCENE_W * o.zoom,
    height: SCENE_H * o.zoom,
    frames: frames.map((f) => ({ ...f, pixels: scale(f.pixels, SCENE_W, SCENE_H, o.zoom) })),
    transparentIndex,
    hasTransparency,
  };
}

/** Browsers show GIF delays below 20 ms as 100 ms, so no GIF frame is shorter. */
export const GIF_MIN_DELAY_MS = 20;

/**
 * GIF timeline: which rendered frame each GIF frame shows and its delay in
 * ms (a multiple of 10, the GIF unit). Frames are combined until a GIF frame
 * lasts at least GIF_MIN_DELAY_MS, showing the first of them; rounding error
 * is carried, so the loop total stays exact.
 */
export function gifTimeline(delaysMs: number[]): { frame: number; delayMs: number }[] {
  const out: { frame: number; delayMs: number }[] = [];
  let t = 0;
  let emitted = 0;
  let i = 0;
  while (i < delaysMs.length) {
    const frame = i;
    t += delaysMs[i++]!;
    while (i < delaysMs.length && Math.round(t / 10) * 10 - emitted < GIF_MIN_DELAY_MS)
      t += delaysMs[i++]!;
    const delayMs = Math.max(GIF_MIN_DELAY_MS, Math.round(t / 10) * 10 - emitted);
    emitted += delayMs;
    out.push({ frame, delayMs });
  }
  return out;
}

/** 8-bit indices for a PNG/GIF: TRANSPARENT becomes the key index (0 when there is none). */
export function toIndices(px: Uint16Array, key: number | null): Uint8Array {
  const out = new Uint8Array(px.length);
  for (let i = 0; i < px.length; i++) out[i] = px[i] === TRANSPARENT ? (key ?? 0) : px[i]!;
  return out;
}

export type ExportFormat = 'apng' | 'gif' | 'strip';

export interface Encoded {
  bytes: Uint8Array;
  mime: string;
  /** File name suffix, e.g. ".png" or "-strip.png". */
  suffix: string;
  frames: number;
}

function encodeApngOf(r: Rendered, palette: RGB[], plays: number): Encoded {
  const key = r.transparentIndex;
  const bytes = encodeApng(
    { width: r.width, height: r.height, palette, transparentIndex: key },
    r.frames.map((f) => ({ indices: toIndices(f.pixels, key), delayMs: f.delayMs })),
    plays,
  );
  return { bytes, mime: 'image/apng', suffix: '.png', frames: r.frames.length };
}

function encodeGifOf(r: Rendered, palette: RGB[], plays: number): Encoded {
  const key = r.transparentIndex;
  const gif = GIFEncoder();
  const timeline = gifTimeline(r.frames.map((f) => f.delayMs));
  timeline.forEach((g, i) => {
    gif.writeFrame(toIndices(r.frames[g.frame]!.pixels, key), r.width, r.height, {
      palette,
      delay: g.delayMs,
      transparent: key !== null,
      transparentIndex: key ?? 0,
      // gifenc: -1 plays once (no loop extension), 0 forever, N repeats N more times.
      repeat: i === 0 ? gifRepeat(plays) : undefined,
    });
  });
  gif.finish();
  return { bytes: gif.bytes(), mime: 'image/gif', suffix: '.gif', frames: timeline.length };
}

/** All frames side by side in one indexed PNG. */
function encodeStripOf(r: Rendered, palette: RGB[]): Encoded {
  const key = r.transparentIndex;
  const w = r.width;
  const n = r.frames.length;
  const strip = new Uint8Array(w * n * r.height);
  r.frames.forEach((f, k) => {
    const idx = toIndices(f.pixels, key);
    for (let y = 0; y < r.height; y++)
      strip.set(idx.subarray(y * w, (y + 1) * w), y * w * n + k * w);
  });
  return {
    bytes: encodeIndexedPng({
      width: w * n,
      height: r.height,
      indices: strip,
      palette,
      transparentIndex: key,
    }),
    mime: 'image/png',
    suffix: '-strip.png',
    frames: n,
  };
}

/**
 * Encodes rendered frames. `plays` is the total number of times the
 * animation plays, 0 for forever, the same for APNG and GIF.
 */
export function encodeRendered(
  r: Rendered,
  format: ExportFormat,
  palette: RGB[],
  plays: number,
): Encoded {
  if (format === 'apng') return encodeApngOf(r, palette, plays);
  if (format === 'gif') return encodeGifOf(r, palette, plays);
  return encodeStripOf(r, palette);
}

/** GIF loop count (gifenc `repeat`) for a total number of plays (0 = forever). */
export const gifRepeat = (plays: number): number => (plays <= 0 ? 0 : plays === 1 ? -1 : plays - 1);

export interface ExportJob {
  options: Omit<ExportOptions, 'animations'> & { animations: Animation[] };
  format: ExportFormat;
  palette: RGB[];
  plays: number;
}

export type ExportMessage =
  | { type: 'progress'; done: number; total: number }
  | ({ type: 'done'; hasTransparency: boolean; transparentIndex: number | null } & Encoded)
  | { type: 'error'; message: string };

/** The whole export, as the worker runs it. */
export function runExport(job: ExportJob, post: (m: ExportMessage) => void): void {
  try {
    const r = renderAnimation(job.options, (done, total) =>
      post({ type: 'progress', done, total }),
    );
    const e = encodeRendered(r, job.format, job.palette, job.plays);
    post({
      type: 'done',
      ...e,
      hasTransparency: r.hasTransparency,
      transparentIndex: r.transparentIndex,
    });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}
