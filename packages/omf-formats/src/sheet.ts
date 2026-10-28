// Sprite sheet layout (spec 20). Works on indexed bitmaps; PNG coding lives in the editor.

import { OmfFormatError } from './errors';
import { TRANSPARENT, type DecodedSprite } from './sprite';
import { spriteLetter } from './runtime';

/** Indexed bitmap; TRANSPARENT (256) marks transparent pixels. */
export interface IndexedImage {
  width: number;
  height: number;
  pixels: Uint16Array;
}

export interface SheetSpriteMeta {
  letter: string;
  index: number;
  pos_x: number;
  pos_y: number;
  w: number;
  h: number;
  cell: number;
  origin_in_cell: { x: number; y: number };
  missing: boolean;
}

export interface SheetMeta {
  version: 1;
  source: string;
  animation: number;
  cell: { w: number; h: number; spacing: number };
  columns: number;
  palette: string;
  /** Palette index that stands for transparency in the PNG, or null for RGBA sheets. */
  transparent_index: number | null;
  sprites: SheetSpriteMeta[];
}

export interface SheetSpriteInput {
  posX: number;
  posY: number;
  index: number;
  missing: boolean;
  /** Decoded image (for shared sprites, the owner's). */
  decoded: DecodedSprite;
}

export interface SheetOptions {
  source: string;
  animation: number;
  palette: string;
  spacing?: number;
  columns?: number;
}

const roundUp8 = (n: number): number => Math.max(8, Math.ceil(n / 8) * 8);

type Cell = SheetMeta['cell'];

/** Top-left pixel of cell `i`. Cells run left to right, then down, `spacing` pixels apart. */
function cellCorner(cell: Cell, columns: number, i: number): { x: number; y: number } {
  return {
    x: (i % columns) * (cell.w + cell.spacing),
    y: Math.floor(i / columns) * (cell.h + cell.spacing),
  };
}

function gridSize(cell: Cell, columns: number, rows: number): { width: number; height: number } {
  return {
    width: columns * cell.w + (columns - 1) * cell.spacing,
    height: rows * cell.h + (rows - 1) * cell.spacing,
  };
}

/** Bounding box of the non-empty sprites relative to the animation origin; 0,0–1,1 when none. */
function spriteBounds(sprites: SheetSpriteInput[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const boxes = sprites
    .filter((s) => s.decoded.width > 0 && s.decoded.height > 0)
    .map((s) => ({
      x0: s.posX,
      y0: s.posY,
      x1: s.posX + s.decoded.width,
      y1: s.posY + s.decoded.height,
    }));
  return {
    minX: boxes.length ? Math.min(...boxes.map((b) => b.x0)) : 0,
    minY: boxes.length ? Math.min(...boxes.map((b) => b.y0)) : 0,
    maxX: boxes.length ? Math.max(...boxes.map((b) => b.x1)) : 1,
    maxY: boxes.length ? Math.max(...boxes.map((b) => b.y1)) : 1,
  };
}

/** Lowest palette index not used by any sprite, preferring 0; null when all 256 are used. */
export function pickTransparentIndex(images: DecodedSprite[]): number | null {
  const used = new Uint8Array(256);
  for (const d of images) for (const p of d.pixels) if (p !== TRANSPARENT) used[p] = 1;
  const free = used.indexOf(0);
  return free < 0 ? null : free;
}

/**
 * Lays sprites out in uniform cells sharing one origin, so moving a sprite
 * inside its cell is a change of pos_x/pos_y.
 */
export function buildSheet(
  sprites: SheetSpriteInput[],
  opts: SheetOptions,
): { image: IndexedImage; meta: SheetMeta } {
  const { minX, minY, maxX, maxY } = spriteBounds(sprites);
  const cell: Cell = {
    w: roundUp8(maxX - minX),
    h: roundUp8(maxY - minY),
    spacing: opts.spacing ?? 1,
  };
  // Where the animation origin sits in every cell.
  const origin = { x: -minX, y: -minY };
  const columns = Math.max(1, Math.min(opts.columns ?? 8, sprites.length || 1));
  const rows = Math.max(1, Math.ceil(sprites.length / columns));
  const { width, height } = gridSize(cell, columns, rows);
  const pixels = new Uint16Array(width * height).fill(TRANSPARENT);

  const meta: SheetSpriteMeta[] = sprites.map((s, i) => {
    const corner = cellCorner(cell, columns, i);
    const left = corner.x + origin.x + s.posX;
    const top = corner.y + origin.y + s.posY;
    const d = s.decoded;
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        const p = d.pixels[y * d.width + x]!;
        if (p !== TRANSPARENT) pixels[(top + y) * width + left + x] = p;
      }
    }
    return {
      letter: spriteLetter(i),
      index: s.index,
      pos_x: s.posX,
      pos_y: s.posY,
      w: d.width,
      h: d.height,
      cell: i,
      origin_in_cell: { ...origin },
      missing: s.missing,
    };
  });

  return {
    image: { width, height, pixels },
    meta: {
      version: 1,
      source: opts.source,
      animation: opts.animation,
      cell,
      columns,
      palette: opts.palette,
      transparent_index: pickTransparentIndex(sprites.map((s) => s.decoded)),
      sprites: meta,
    },
  };
}

export interface ParsedSheetSprite {
  posX: number;
  posY: number;
  decoded: DecodedSprite;
}

const isInt = (v: unknown, min: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;

/** Checks the layout numbers of a sidecar, which may come from anywhere. */
function checkLayout(meta: SheetMeta): void {
  const bad = (what: string): never => {
    throw new OmfFormatError(`sheet layout: ${what}`);
  };
  const c = meta.cell as Partial<SheetMeta['cell']> | undefined;
  if (!c || !isInt(c.w, 1) || !isInt(c.h, 1) || !isInt(c.spacing, 0))
    bad('cell needs a positive integer w and h and a spacing ≥ 0');
  if (!isInt(meta.columns, 1)) bad('columns must be a positive integer');
  if (!Array.isArray(meta.sprites)) bad('sprites must be a list');
  const cells = Math.ceil(meta.sprites.length / meta.columns) * meta.columns;
  meta.sprites.forEach((sp, i) => {
    if (!isInt(sp.cell, 0) || sp.cell >= cells)
      bad(`sprite ${i}: cell ${sp.cell} is outside the layout`);
    const o = sp.origin_in_cell as Partial<SheetSpriteMeta['origin_in_cell']> | undefined;
    if (!o || !Number.isInteger(o.x) || !Number.isInteger(o.y))
      bad(`sprite ${i}: origin_in_cell needs integer x and y`);
    if (!Number.isInteger(sp.pos_x) || !Number.isInteger(sp.pos_y))
      bad(`sprite ${i}: pos_x and pos_y must be integers`);
  });
}

/** Crops each cell, trims transparent borders and recomputes the offset from origin_in_cell. */
export function parseSheet(image: IndexedImage, meta: SheetMeta): ParsedSheetSprite[] {
  checkLayout(meta);
  const { cell, columns } = meta;
  const rows = Math.ceil(meta.sprites.length / columns);
  const need = gridSize(cell, columns, rows);
  if (image.width < need.width || image.height < need.height) {
    throw new OmfFormatError(
      `sheet is ${image.width}×${image.height}, layout needs at least ${need.width}×${need.height}`,
    );
  }
  return meta.sprites.map((s) => {
    const crop = cropOpaque(image, cellCorner(cell, columns, s.cell), cell);
    if (!crop)
      return {
        posX: s.pos_x,
        posY: s.pos_y,
        decoded: { width: 0, height: 0, pixels: new Uint16Array(0) },
      };
    return {
      posX: crop.x - s.origin_in_cell.x,
      posY: crop.y - s.origin_in_cell.y,
      decoded: crop.decoded,
    };
  });
}

/**
 * The opaque part of one cell, trimmed to its bounding box; `x`, `y` is where
 * that box starts inside the cell. Null when the cell is fully transparent.
 */
function cropOpaque(
  image: IndexedImage,
  corner: { x: number; y: number },
  cell: Cell,
): { x: number; y: number; decoded: DecodedSprite } | null {
  const at = (x: number, y: number): number =>
    image.pixels[(corner.y + y) * image.width + corner.x + x]!;
  let x0 = cell.w;
  let y0 = cell.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      if (at(x, y) === TRANSPARENT) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const pixels = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) pixels[y * w + x] = at(x0 + x, y0 + y);
  }
  return { x: x0, y: y0, decoded: { width: w, height: h, pixels } };
}

/** True when both place the same opaque pixels at the same scene positions (ignores transparent borders). */
export function samePlacedImage(a: ParsedSheetSprite, b: ParsedSheetSprite): boolean {
  const opaque = (s: ParsedSheetSprite): Map<string, number> => {
    const m = new Map<string, number>();
    const d = s.decoded;
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        const p = d.pixels[y * d.width + x]!;
        if (p !== TRANSPARENT) m.set(`${s.posX + x},${s.posY + y}`, p);
      }
    }
    return m;
  };
  const ma = opaque(a);
  const mb = opaque(b);
  if (ma.size !== mb.size) return false;
  for (const [k, v] of ma) if (mb.get(k) !== v) return false;
  return true;
}
