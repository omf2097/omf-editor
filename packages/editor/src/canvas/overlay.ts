// Overlay drawing for the scene and pixel editor canvases. Overlays are drawn
// at screen resolution: one image pixel is `z` overlay pixels, and lines sit
// on half pixels to stay crisp.

import type { Point } from '../lib/scene';
import { SCENE_H, SCENE_W } from './render';

/** Grid lines every `step` image pixels over a cols × rows image, through `at` (default 0, 0). */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  step: number,
  z: number,
  style: string,
  at: Point = { x: 0, y: 0 },
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const mod = (v: number) => ((v % step) + step) % step;
  ctx.strokeStyle = style;
  ctx.lineWidth = 1;
  for (let x = mod(at.x); x <= cols; x += step) {
    ctx.beginPath();
    ctx.moveTo(x * z + 0.5, 0);
    ctx.lineTo(x * z + 0.5, h);
    ctx.stroke();
  }
  for (let y = mod(at.y); y <= rows; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y * z + 0.5);
    ctx.lineTo(w, y * z + 0.5);
    ctx.stroke();
  }
}

/** Crosshair centred on image pixel `p`, with arms of `arm` overlay pixels (origin marker). */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  p: Point,
  z: number,
  arm: number,
  style: string,
): void {
  const cx = (p.x + 0.5) * z;
  const cy = (p.y + 0.5) * z;
  ctx.strokeStyle = style;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.stroke();
}

/** The origin marker colour. */
export const ORIGIN_COLOUR = '#4dd0e1';

export interface SceneOverlay {
  /** Overlay pixels per scene pixel, an integer ≥ 1. */
  z: number;
  /** Stage size in scene pixels; the scene by default (larger in the Centred preview). */
  width?: number;
  height?: number;
  /** 8-pixel grid, with a line through `gridAt` (the scene's 0, 0 on the stage). */
  grid: boolean;
  gridAt?: Point;
  /** Dashed outline of the drawn sprite. */
  bounds: { x: number; y: number; w: number; h: number } | null;
  /** Object position. */
  origin: Point | null;
  /** Collision points in scene space; `own` ones are of the shown sprite, others dimmed. */
  hits: { p: Point; own: boolean; selected: boolean }[];
}

/** Sizes the overlay canvas to the stage at zoom `z` and draws on it; positions are stage pixels. */
export function drawSceneOverlay(o: HTMLCanvasElement, v: SceneOverlay): void {
  const z = v.z;
  const W = v.width ?? SCENE_W;
  const H = v.height ?? SCENE_H;
  o.width = W * z;
  o.height = H * z;
  const ctx = o.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, o.width, o.height);
  if (v.grid) drawGrid(ctx, W, H, 8, z, 'rgba(255,255,255,0.1)', v.gridAt);
  const b = v.bounds;
  if (b) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(b.x * z + 0.5, b.y * z + 0.5, b.w * z, b.h * z);
    ctx.setLineDash([]);
  }
  if (v.origin) drawCrosshair(ctx, v.origin, z, 6, ORIGIN_COLOUR);
  // Points are squares of at least 3 overlay pixels centred on their pixel.
  const size = Math.max(3, z);
  for (const h of v.hits) {
    const x = h.p.x * z + z / 2 - size / 2;
    const y = h.p.y * z + z / 2 - size / 2;
    ctx.globalAlpha = h.own ? 1 : 0.4;
    ctx.fillStyle = h.selected ? '#ffeb3b' : '#ff5252';
    ctx.fillRect(x, y, size, size);
    if (h.selected) {
      ctx.strokeStyle = '#000';
      ctx.strokeRect(x - 0.5, y - 0.5, size + 1, size + 1);
    }
    ctx.globalAlpha = 1;
  }
}
