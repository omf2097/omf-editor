// VGA palettes and remap tables (spec 03). Files store 6-bit colour components;
// a remap table maps every palette index to another, for effects such as
// shadows (layout.ts says which slot does what).

import type { BinaryReader, BinaryWriter } from './binary';
import { OmfFormatError } from './errors';

/** 8-bit colour components, 0..255 (display, PNG, palette files). */
export type RGB = [r: number, g: number, b: number];
/** 6-bit VGA colour components, 0..63, as stored in the files. */
export type VGA = [r: number, g: number, b: number];

export interface Palette {
  /** Exactly 256 entries, 6-bit. Stored as read so round trips are lossless. */
  colors: VGA[];
}

export const REMAP_COUNT = 19;

export interface PaletteMapping {
  colors: Palette;
  /** 19 tables × 256 entries. Treated as immutable: replace, never write in place. */
  remaps: Uint8Array[];
}

/** 6 → 8 bit as the game and openomf display it (`COLOR_6TO8`). */
export const vgaTo8 = (v6: number): number => ((v6 << 2) | ((v6 & 0x30) >> 4)) & 0xff;
/** 8 → 6 bit, nearest. Inverse of both vgaTo8 and the pyomftools JSON formula. */
export const vgaFrom8 = (v8: number): number => Math.min(63, Math.round((v8 * 63) / 255));
/** pyomftools' 6 → 8 bit formula, used only for JSON interop. */
export const pyomftoolsTo8 = (v6: number): number => Math.trunc((v6 * 255) / 63);

export const vgaToRgb = (c: VGA): RGB => [vgaTo8(c[0]), vgaTo8(c[1]), vgaTo8(c[2])];
export const rgbToVga = (c: RGB): VGA => [vgaFrom8(c[0]), vgaFrom8(c[1]), vgaFrom8(c[2])];

/** A component byte. Files hold 6-bit values; a larger byte read from a file is written back as is. */
function vga6(w: BinaryWriter, v: number, field: string): void {
  w.u8(v, field);
}

export function readPalette(r: BinaryReader): Palette {
  const colors: VGA[] = [];
  for (let i = 0; i < 256; i++) colors.push([r.u8(), r.u8(), r.u8()]);
  return { colors };
}

export function writePalette(w: BinaryWriter, p: Palette, field = 'palette'): void {
  if (p.colors.length !== 256)
    throw new OmfFormatError(`palette has ${p.colors.length} colours, expected 256`);
  p.colors.forEach(([cr, cg, cb], i) => {
    vga6(w, cr, `${field}.colors[${i}].r`);
    vga6(w, cg, `${field}.colors[${i}].g`);
    vga6(w, cb, `${field}.colors[${i}].b`);
  });
}

export function readPaletteMapping(r: BinaryReader): PaletteMapping {
  const colors = readPalette(r);
  const remaps: Uint8Array[] = [];
  for (let i = 0; i < REMAP_COUNT; i++) remaps.push(r.bytes(256));
  return { colors, remaps };
}

export function writePaletteMapping(w: BinaryWriter, m: PaletteMapping, field = 'palette'): void {
  writePalette(w, m.colors, field);
  if (m.remaps.length !== REMAP_COUNT) {
    throw new OmfFormatError(
      `palette mapping has ${m.remaps.length} remaps, expected ${REMAP_COUNT}`,
    );
  }
  for (const t of m.remaps) {
    if (t.length !== 256)
      throw new OmfFormatError(`remap table has ${t.length} entries, expected 256`);
    w.bytes(t);
  }
}

export function identityRemap(): Uint8Array {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = i;
  return t;
}

/** colors[k] = base[remap[k]] */
export function remapPalette(base: Palette, remap: Uint8Array): Palette {
  return { colors: base.colors.map((_, k) => [...base.colors[remap[k]!]!] as VGA) };
}

export function grayscalePalette(): Palette {
  const colors: VGA[] = [];
  for (let i = 0; i < 256; i++) colors.push([i >> 2, i >> 2, i >> 2]);
  return { colors };
}

/**
 * Greyscale that restarts in every 16-colour band, dark to white. HAR sprites
 * use the bands 0–15, 16–31 and 32–47 as shade ramps, so each one spans the
 * full range instead of the bottom fifth of a linear ramp. Index 0 stays black.
 */
export function bandedGrayscalePalette(): Palette {
  const colors: VGA[] = [];
  for (let i = 0; i < 256; i++) {
    const v = i === 0 ? 0 : Math.round(((i & 15) + 1) * (63 / 16));
    colors.push([v, v, v]);
  }
  return { colors };
}

export const TRANSPARENT_LUT_INDEX = 256;

/**
 * 257-entry RGBA lookup in ImageData byte order on little-endian hosts
 * (u32 = 0xAABBGGRR). Entry 256 is fully transparent.
 */
export function paletteToRgbaLut(p: Palette): Uint32Array {
  const lut = new Uint32Array(257);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = vgaToRgb(p.colors[i] ?? [0, 0, 0]);
    lut[i] = ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  lut[256] = 0;
  return lut;
}

export function clonePalette(p: Palette): Palette {
  return { colors: p.colors.map((c) => [...c] as VGA) };
}

export function clonePaletteMapping(m: PaletteMapping): PaletteMapping {
  return { colors: clonePalette(m.colors), remaps: [...m.remaps] };
}
