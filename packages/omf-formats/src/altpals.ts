import { BinaryReader, BinaryWriter } from './binary';
import { readPalette, writePalette, type Palette } from './palette';

export const ALTPALS_COUNT = 11;

/** ALTPALS.DAT: 11 consecutive 6-bit palettes, no header. */
export function readAltPals(data: Uint8Array | ArrayBuffer): Palette[] {
  const r = new BinaryReader(data);
  const out: Palette[] = [];
  for (let i = 0; i < ALTPALS_COUNT; i++) out.push(readPalette(r));
  return out;
}

export function writeAltPals(palettes: Palette[]): Uint8Array {
  const w = new BinaryWriter(ALTPALS_COUNT * 768);
  palettes.forEach((p, i) => writePalette(w, p, `altpals[${i}]`));
  return w.toUint8Array();
}
