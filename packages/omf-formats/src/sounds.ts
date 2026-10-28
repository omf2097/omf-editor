// SOUNDS.DAT, the game's shared sound bank (openomf formats/sounds.c).

import { BinaryReader, BinaryWriter } from './binary';
import { OmfFormatError } from './errors';

/** openomf SD_SOUNDS_MAX. */
export const SOUNDS_MAX = 299;

/** One 8-bit unsigned mono PCM sample. An empty entry has no data and freqKey 0. */
export interface Sound {
  /** Sample rate encoding: 1 000 000 / (256 − freqKey) Hz. */
  freqKey: number;
  data: Uint8Array;
}

/**
 * Layout: `u32 0`, one `u32` offset per sound (the first is the header size),
 * then per sound `u16 len` followed, when len > 0, by `u8 freqKey` and len
 * bytes. Readers ignore the offsets; openomf's own writer gets them wrong, so
 * ours writes the real record positions, which is what the shipped file has.
 */
export function readSounds(data: Uint8Array | ArrayBuffer): Sound[] {
  const r = new BinaryReader(data);
  if (r.u32() !== 0) throw new OmfFormatError('not a SOUNDS.DAT: first dword is not 0', 0);
  const headerSize = r.u32();
  if (headerSize % 4 !== 0 || headerSize < 8)
    throw new OmfFormatError(`bad SOUNDS.DAT header size ${headerSize}`, 4);
  const count = headerSize / 4 - 1;
  if (count > SOUNDS_MAX)
    throw new OmfFormatError(`SOUNDS.DAT has ${count} entries, openomf allows ${SOUNDS_MAX}`, 4);
  r.skip(headerSize - 8);
  const out: Sound[] = [];
  for (let i = 0; i < count; i++) {
    const len = r.u16();
    out.push(len > 0 ? { freqKey: r.u8(), data: r.bytes(len) } : emptySound());
  }
  return out;
}

export function writeSounds(sounds: readonly Sound[]): Uint8Array {
  // The header size doubles as the first offset, so a bank needs at least one entry.
  if (sounds.length === 0) throw new OmfFormatError('SOUNDS.DAT needs at least one entry');
  if (sounds.length > SOUNDS_MAX)
    throw new OmfFormatError(`${sounds.length} sounds, openomf allows ${SOUNDS_MAX}`);
  const headerSize = 4 + 4 * sounds.length;
  const w = new BinaryWriter(headerSize + sounds.reduce((n, s) => n + 3 + s.data.length, 0));
  w.u32(0);
  let at = headerSize;
  for (const s of sounds) {
    w.u32(at);
    at += s.data.length > 0 ? 3 + s.data.length : 2;
  }
  sounds.forEach((s, i) => {
    w.u16(s.data.length, `sounds[${i}].length`);
    if (s.data.length > 0) {
      w.u8(s.freqKey, `sounds[${i}].freqKey`);
      w.bytes(s.data);
    }
  });
  return w.toUint8Array();
}

export const emptySound = (): Sound => ({ freqKey: 0, data: new Uint8Array(0) });

/** openomf sounds_loader_get. */
export const soundSampleRate = (freqKey: number): number => Math.trunc(1_000_000 / (256 - freqKey));

/** openomf pitched_samplerate: the `sf` tag, clamped below at −20. */
export function pitchedSampleRate(rate: number, pitch: number): number {
  const p = Math.max(-20, pitch);
  if (p > 0) return rate + Math.trunc((rate * p * 3) / 100);
  if (p < 0) return rate + Math.trunc((rate * p * 2) / 100);
  return rate;
}

export const soundDurationMs = (s: Sound): number =>
  s.data.length === 0 ? 0 : (s.data.length * 1000) / soundSampleRate(s.freqKey);

/**
 * Largest sound-table value: slots are bytes holding 1-based SOUNDS.DAT
 * numbers, so SOUNDS.DAT entries 256 and up (index ≥ 255) cannot be assigned.
 * Values 128–255 are valid (openomf declares the table as plain `char`, which
 * is signed on x86 and loses them; that looks like an openomf bug).
 */
export const SOUND_TABLE_VALUE_MAX = 255;

/** Whether a sound-table slot can refer to SOUNDS.DAT entry `index` (0-based). */
export const soundAssignable = (index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index + 1 <= SOUND_TABLE_VALUE_MAX;

/**
 * SOUNDS.DAT index that sound-table slot `slot` plays (player.c: table[s] − 1),
 * or −1 for none. Table values are therefore 1-based sound numbers, 0 = silent.
 */
export function soundForSlot(table: readonly number[], slot: number): number {
  const v = table[slot];
  return v === undefined ? -1 : v - 1;
}

/** Slots openomf zeroes when it loads an AF (resources/af.c, "like master.dat"). */
export const AF_OVERRIDDEN_SOUND_SLOTS: readonly number[] = [25, 26, 27];

/** 8-bit unsigned mono WAV of one sound, at its own sample rate. */
export function soundToWav(s: Sound): Uint8Array {
  const rate = s.data.length > 0 ? soundSampleRate(s.freqKey) : 8000;
  const n = s.data.length;
  // RIFF chunks are word-aligned: an odd-length data chunk gets a pad byte,
  // counted in the RIFF size but not in the data chunk size.
  const pad = n & 1;
  const ascii = (t: string): Uint8Array => Uint8Array.from(t, (c) => c.charCodeAt(0));
  const w = new BinaryWriter(44 + n + pad);
  w.bytes(ascii('RIFF'));
  w.u32(36 + n + pad);
  w.bytes(ascii('WAVEfmt '));
  w.u32(16).u16(1).u16(1).u32(rate).u32(rate).u16(1).u16(8);
  w.bytes(ascii('data'));
  w.u32(n);
  w.bytes(s.data);
  if (pad) w.u8(0);
  return w.toUint8Array();
}
