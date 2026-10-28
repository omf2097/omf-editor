// Palette file formats: GIMP .gpl, JASC .pal, Adobe .act. Colours are 8-bit RGB.

import { OmfFormatError } from './errors';
import type { RGB } from './palette';

export type PaletteFileFormat = 'gpl' | 'pal' | 'act';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function byte(v: string, line: number): number {
  // Plain decimal only: Number() would also take "0x10", "1e1" and "".
  const n = /^\d{1,3}$/.test(v) ? Number(v) : NaN;
  if (!(n >= 0 && n <= 255))
    throw new OmfFormatError(`line ${line}: '${v}' is not a colour component`);
  return n;
}

export function parseGpl(text: string): RGB[] {
  const lines = text.split(/\r?\n/);
  if (!lines[0]?.startsWith('GIMP Palette')) throw new OmfFormatError('not a GIMP palette');
  const out: RGB[] = [];
  lines.slice(1).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^(Name|Columns):/.test(line)) return;
    const parts = line.split(/\s+/);
    if (parts.length < 3) throw new OmfFormatError(`line ${i + 2}: expected R G B`);
    out.push([byte(parts[0]!, i + 2), byte(parts[1]!, i + 2), byte(parts[2]!, i + 2)]);
  });
  return out;
}

export function writeGpl(colors: RGB[], name = 'OMF palette'): string {
  const rows = colors.map(
    ([r, g, b], i) =>
      `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\tIndex ${i}`,
  );
  return ['GIMP Palette', `Name: ${name}`, 'Columns: 16', '#', ...rows, ''].join('\n');
}

export function parseJascPal(text: string): RGB[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== 'JASC-PAL') throw new OmfFormatError('not a JASC palette');
  const count = /^\d{1,3}$/.test(lines[2] ?? '') ? Number(lines[2]) : NaN;
  if (!(count >= 0 && count <= 256)) throw new OmfFormatError('bad colour count');
  const out: RGB[] = [];
  for (let i = 0; i < count; i++) {
    const parts = (lines[3 + i] ?? '').split(/\s+/);
    if (parts.length < 3) throw new OmfFormatError(`line ${4 + i}: expected R G B`);
    out.push([byte(parts[0]!, 4 + i), byte(parts[1]!, 4 + i), byte(parts[2]!, 4 + i)]);
  }
  return out;
}

export function writeJascPal(colors: RGB[]): string {
  return ['JASC-PAL', '0100', String(colors.length), ...colors.map((c) => c.join(' ')), ''].join(
    '\r\n',
  );
}

/** 768 bytes of RGB, optionally followed by u16 BE count and u16 BE transparent index. */
export function parseAct(bytes: Uint8Array): RGB[] {
  if (bytes.length !== 768 && bytes.length !== 772)
    throw new OmfFormatError(`ACT file has ${bytes.length} bytes`);
  let count = 256;
  if (bytes.length === 772) {
    count = (bytes[768]! << 8) | bytes[769]!;
    if (count === 0 || count > 256) count = 256;
  }
  const out: RGB[] = [];
  for (let i = 0; i < count; i++) out.push([bytes[i * 3]!, bytes[i * 3 + 1]!, bytes[i * 3 + 2]!]);
  return out;
}

/**
 * 256 colours as plain 768 bytes; fewer get the 4-byte trailer (u16 BE count,
 * u16 BE transparent index 0xFFFF = none) so readers do not take the padding
 * as colours.
 */
export function writeAct(colors: RGB[]): Uint8Array {
  const n = Math.min(256, colors.length);
  const out = new Uint8Array(n === 256 ? 768 : 772);
  colors.slice(0, 256).forEach((c, i) => out.set(c, i * 3));
  if (n < 256) out.set([n >> 8, n & 0xff, 0xff, 0xff], 768);
  return out;
}

export function parsePaletteFile(name: string, bytes: Uint8Array): RGB[] {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'act') return parseAct(bytes);
  const text = textDecoder.decode(bytes);
  if (ext === 'gpl' || text.startsWith('GIMP Palette')) return parseGpl(text);
  if (ext === 'pal' || text.startsWith('JASC-PAL')) return parseJascPal(text);
  throw new OmfFormatError(`unknown palette format: ${name}`);
}

export function writePaletteFile(format: PaletteFileFormat, colors: RGB[]): Uint8Array {
  if (format === 'act') return writeAct(colors);
  return textEncoder.encode(format === 'gpl' ? writeGpl(colors) : writeJascPal(colors));
}
