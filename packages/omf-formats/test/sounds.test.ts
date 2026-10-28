import { describe, expect, it } from 'vitest';
import {
  OmfFormatError,
  emptySound,
  pitchedSampleRate,
  readSounds,
  soundDurationMs,
  soundForSlot,
  soundSampleRate,
  soundToWav,
  writeSounds,
} from '../src';

describe('SOUNDS.DAT', () => {
  const sounds = [
    { freqKey: 131, data: Uint8Array.from([128, 255, 0]) },
    emptySound(),
    { freqKey: 211, data: Uint8Array.from([1]) },
  ];

  it('writes record offsets and round-trips', () => {
    const bytes = writeSounds(sounds);
    const dv = new DataView(bytes.buffer);
    expect(dv.getUint32(0, true)).toBe(0);
    expect([4, 8, 12].map((o) => dv.getUint32(o, true))).toEqual([16, 22, 24]);
    expect(bytes.length).toBe(16 + 6 + 2 + 4);
    expect(readSounds(bytes)).toEqual(sounds);
  });

  it('handles the size limits', () => {
    expect(() => writeSounds([])).toThrow(/at least one/);
    expect(() => writeSounds(Array.from({ length: 300 }, emptySound))).toThrow(/299/);
    const full = writeSounds(Array.from({ length: 299 }, emptySound));
    expect(readSounds(full)).toHaveLength(299);
    const one = writeSounds([emptySound()]);
    expect([...one]).toEqual([0, 0, 0, 0, 8, 0, 0, 0, 0, 0]);
    expect(readSounds(one)).toEqual([emptySound()]);
    // 300 entries is one past openomf's table
    const big = new Uint8Array(4 + 300 * 4 + 300 * 2);
    new DataView(big.buffer).setUint32(4, 4 + 300 * 4, true);
    expect(() => readSounds(big)).toThrow(/299/);
    // a full-length u16 sample
    const long = { freqKey: 131, data: new Uint8Array(65535).fill(7) };
    expect(readSounds(writeSounds([long]))).toEqual([long]);
    expect(() => writeSounds([{ freqKey: 131, data: new Uint8Array(65536) }])).toThrow(/length/);
  });

  it('rejects other files', () => {
    expect(() => readSounds(Uint8Array.from([1, 0, 0, 0, 8, 0, 0, 0]))).toThrow(OmfFormatError);
    expect(() => readSounds(Uint8Array.from([0, 0, 0, 0, 7, 0, 0, 0]))).toThrow(/header size/);
    expect(() => readSounds(writeSounds(sounds).slice(0, 20))).toThrow(/end of data/);
  });

  it('sample rate, pitch and duration follow openomf', () => {
    expect(soundSampleRate(131)).toBe(8000);
    expect(soundSampleRate(211)).toBe(22222);
    expect(pitchedSampleRate(8000, 10)).toBe(10400);
    expect(pitchedSampleRate(8000, -10)).toBe(6400);
    expect(pitchedSampleRate(8000, -50)).toBe(4800); // clamped to −20
    expect(soundDurationMs({ freqKey: 131, data: new Uint8Array(8000) })).toBe(1000);
    expect(soundDurationMs(emptySound())).toBe(0);
  });

  it('table values are 1-based sound numbers', () => {
    expect(soundForSlot([0, 1, 70], 0)).toBe(-1);
    expect(soundForSlot([0, 1, 70], 2)).toBe(69);
    expect(soundForSlot([0], 5)).toBe(-1);
  });

  it('exports an 8-bit mono WAV', () => {
    const wav = soundToWav(sounds[0]!);
    const dv = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    expect(dv.getUint32(24, true)).toBe(8000);
    expect(dv.getUint16(34, true)).toBe(8);
    expect([...wav.slice(44)]).toEqual([128, 255, 0, 0]); // pad byte
    expect(dv.getUint32(4, true)).toBe(wav.length - 8);
    expect(dv.getUint32(40, true)).toBe(3);
    const even = soundToWav({ freqKey: 131, data: Uint8Array.from([1, 2]) });
    expect(even.length).toBe(46);
    expect(new DataView(even.buffer).getUint32(4, true)).toBe(38);
  });
});
