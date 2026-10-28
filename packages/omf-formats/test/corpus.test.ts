// The shipped-bug corpus (see corpus.ts): openomf's reading of the odd data in
// the game files, and byte-exact round trips, without needing the game data.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  afFromJSON,
  afToJSON,
  bkFromJSON,
  bkToJSON,
  decodeScript,
  decodeSprite,
  documentDiagnostics,
  encodeScript,
  OmfFormatError,
  readAF,
  readBK,
  resolveSharedImages,
  resolveSharedImagesInFile,
  scanScript,
  TRANSPARENT,
  writeAF,
  writeBK,
} from '../src';
import { MOVE_STRING_RAW, STREAMS, STRINGS, corpusBytes } from './corpus';
import { readFixture } from './data';

const FIXTURES = join(import.meta.dirname, 'fixtures');
if (process.env.OMF_UPDATE_FIXTURE) {
  const { af, bk } = corpusBytes();
  writeFileSync(join(FIXTURES, 'corpus.af'), af);
  writeFileSync(join(FIXTURES, 'corpus.bk'), bk);
}
const AF_BYTES = readFixture('corpus.af');
const BK_BYTES = readFixture('corpus.bk');
const af = readAF(AF_BYTES);
const bk = readBK(BK_BYTES);
const T = TRANSPARENT;

/** openomf's own reading (build/stringparser), from openomf-strings.json. */
const OPENOMF: { s: string; frames: [string, [string, number | null][]][] }[] = JSON.parse(
  readFileSync(join(FIXTURES, 'openomf-strings.json'), 'utf8'),
);

describe('shipped-bug corpus', () => {
  it('the committed files are what the builders write', () => {
    const { af: a, bk: b } = corpusBytes();
    expect(AF_BYTES).toEqual(a);
    expect(BK_BYTES).toEqual(b);
  });

  it('is written back byte for byte, directly and through JSON', () => {
    expect(writeAF(af)).toEqual(AF_BYTES);
    expect(writeBK(bk)).toEqual(BK_BYTES);
    expect(writeBK(bkFromJSON(JSON.parse(JSON.stringify(bkToJSON(bk)))))).toEqual(BK_BYTES);
    // JSON drops move_string padding, as pyomftools does (spec 09); all else is kept.
    const back = afFromJSON(JSON.parse(JSON.stringify(afToJSON(af))));
    const unpadded = readAF(AF_BYTES);
    for (const m of unpadded.moves.values()) delete m.moveStringRaw;
    expect(writeAF(back)).toEqual(writeAF(unpadded));
    expect(writeAF(back)).not.toEqual(AF_BYTES);
  });

  it('strings read as openomf reads them and keep their spelling', () => {
    for (const s of Object.values(STRINGS)) {
      const ref = OPENOMF.find((e) => e.s === s);
      expect(ref, `openomf reading of ${s}`).toBeDefined();
      const sc = decodeScript(s);
      expect(
        sc.frames.map((f) => [f.key + f.duration, f.tags.map((t) => [t.key, t.value])]),
        s,
      ).toEqual(ref!.frames);
      expect(encodeScript(sc)).toBe(s);
    }
    const strings = [...af.moves.values()].flatMap((m) => [
      m.baseString,
      ...m.extraStrings,
      m.enemyString,
    ]);
    for (const s of Object.values(STRINGS)) expect(strings).toContain(s);
  });

  it('the text openomf drops is found where openomf drops it', () => {
    const dropped = (s: string) => scanScript(s).dropped.map((d) => d.text);
    expect(dropped(STRINGS.rff)).toEqual(['rff10-']);
    expect(dropped(STRINGS.hx)).toEqual(['hx+8-']);
    expect(dropped(STRINGS.uabe)).toHaveLength(15);
    expect(new Set(dropped(STRINGS.uabe))).toEqual(
      new Set(['uabeujf2jfD4-', 'uabeujf2jfE3-', 'uabeujf2jfF4-', 'uabeujf2jfG4-']),
    );
    expect(dropped(STRINGS.usw)).toEqual(['hm12mi5ma270mx+50my-16usw30X1-']);
    expect(dropped(STRINGS.bang)).toEqual(['!']);
    expect(dropped(STRINGS.twoKeys)).toEqual(['B', '7-']);
    // Reported, never as an error: the game plays these files.
    const diags = documentDiagnostics(af);
    expect(diags.filter((d) => d.severity === 'error')).toEqual([]);
    for (const t of ['rff10-', 'hx+8-', 'uabeujf2jfE3-', 'usw30X1-', '7-'])
      expect(diags.some((d) => /openomf drops/.test(d.message) && d.message.includes(t))).toBe(
        true,
      );
  });

  it('a 60537×60537 header without image bytes is an empty sprite', () => {
    // openomf sd_sprite_vga_decode: len 0 gives a 1×1 blank, never 60537².
    const g = af.moves.get(9)!.sprites[6]!;
    expect([g.width, g.height, g.image.length, g.missing]).toEqual([60537, 60537, 0, false]);
    expect(decodeSprite(g.width, g.height, g.image).pixels).toHaveLength(0);
    const b = bk.animations.get(14)!.sprites[0]!;
    expect([b.width, b.height, b.posX, b.posY]).toEqual([60537, 60537, -15, -15]);
    expect(decodeSprite(b.width, b.height, b.image).pixels).toHaveLength(0);
  });

  it('a 0×1 sprite keeps its 768 bytes but has no pixels', () => {
    // CREDITS.BK: openomf returns before decoding when a dimension is 0.
    const s = bk.animations.get(20)!.sprites[1]!;
    expect([s.width, s.height, s.image.length]).toEqual([0, 1, 768]);
    expect(decodeSprite(s.width, s.height, s.image).pixels).toHaveLength(0);
  });

  it('RLE streams decode as sd_sprite_vga_decode does', () => {
    const [noEnd, overflow, shortRun, endNotLast] = af.moves.get(20)!.sprites;
    expect(noEnd!.image).toEqual(STREAMS.noEnd);
    // No end command: the stream just runs out.
    expect(Array.from(decodeSprite(4, 2, noEnd!.image).pixels)).toEqual([T, 5, 6, T, T, T, T, T]);
    // Past width × height: what fits is drawn, then decoding stops.
    const o = decodeSprite(4, 2, overflow!.image);
    expect(Array.from(o.pixels)).toEqual([T, T, T, T, T, T, 7, 8]);
    expect(o.truncated).toBe(true);
    // A run longer than the bytes left draws those bytes.
    expect(Array.from(decodeSprite(4, 2, shortRun!.image).pixels)).toEqual([
      11,
      12,
      T,
      T,
      T,
      T,
      T,
      T,
    ]);
    // An end command before the end is invalid input to openomf.
    expect(() => decodeSprite(4, 2, endNotLast!.image)).toThrow(OmfFormatError);
  });

  it('sharers use the latest earlier owner; their stored length is the owner’s', () => {
    const owners = af.moves.get(1)!.sprites;
    const sharers = af.moves.get(9)!.sprites.slice(0, 6);
    const runtime = resolveSharedImages(af.moves.values());
    const inFile = resolveSharedImagesInFile(af.moves.values());
    sharers.forEach((s, i) => {
      expect(s.missing).toBe(true);
      expect(s.image).toHaveLength(0);
      expect(runtime.get(s)).toBe(owners[i]);
      expect(inFile.get(s)).toBe(owners[i]);
    });
    // The u16 image length of each sharer in the file equals its owner's.
    const lengths: number[] = [];
    for (let i = 0; i + 1 < AF_BYTES.length; i++) {
      // Sharer header: len, pos_x -2, pos_y -5, 6×5, index, missing = 1 (offset 11).
      if (AF_BYTES[i + 2] === 0xfe && AF_BYTES[i + 3] === 0xff && AF_BYTES[i + 11] === 1)
        if (AF_BYTES[i + 4] === 0xfb && AF_BYTES[i + 6] === 6 && AF_BYTES[i + 8] === 5)
          lengths.push(AF_BYTES[i]! | (AF_BYTES[i + 1]! << 8));
    }
    expect(lengths).toEqual(owners.map((o) => o.image.length));
  });

  it('odd header fields are kept: move_string leftovers, header dword, null bits', () => {
    const m1 = af.moves.get(1)!;
    expect(m1.moveString).toBe('0');
    expect(m1.moveStringRaw).toEqual(MOVE_STRING_RAW);
    const m20 = af.moves.get(20)!;
    expect(m20.headerZero).toBe(0xdeadbeef);
    expect(m20.hitCoords).toEqual([
      { x: -512, y: 511, spriteId: 1, null: 0 },
      { x: 3, y: -4, spriteId: 2, null: 63 },
    ]);
    expect([m20.aiFlags, m20.posConstraint, m20.unknown4, m20.unknown11]).toEqual([
      0xffff, 0xffff, 1, 255,
    ]);
    expect([bk.unknownA, bk.musicMask]).toEqual([7, 0x80000001]);
    const a20 = bk.animations.get(20)!;
    expect([a20.null, a20.chainHit, a20.probability]).toEqual([3, 1, 255]);
    // Changing move_string drops the leftovers; the rest stays.
    const edited = readAF(AF_BYTES);
    edited.moves.get(1)!.moveString = '1';
    const again = readAF(writeAF(edited)).moves.get(1)!;
    expect(Array.from(again.moveStringRaw!)).toEqual([49, ...new Array<number>(20).fill(0)]);
  });

  it('like the shipped files, the corpus has no error diagnostics', () => {
    expect(documentDiagnostics(bk).filter((d) => d.severity === 'error')).toEqual([]);
  });
});
