// Builds the synthetic e2e fixtures with @omf/formats (spec 17 §2).

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  afToJSON,
  bkToJSON,
  readBK,
  encodeSprite,
  identityRemap,
  writeAF,
  writeAltPals,
  writeSounds,
  writeBK,
  type AFFile,
  type AFMove,
  type BKAnimation,
  type BKFile,
  type Palette,
  type Sound,
  type Sprite,
  type VGA,
} from '@omf/formats';
import { encode as encodeRgbaPng } from 'fast-png';
import { encodeIndexedPng } from '../../src/codecs/png';

export const FIXTURES = join(import.meta.dirname, '..', '.fixtures');
const T = 256;

function img(w: number, h: number, f: (x: number, y: number) => number): Uint16Array {
  return Uint16Array.from({ length: w * h }, (_, i) => f(i % w, Math.floor(i / w)));
}

export function sprite(
  over: Partial<Sprite> = {},
  w = 8,
  h = 8,
  fill = (x: number, y: number) => 1 + ((x + y) % 4),
): Sprite {
  return {
    posX: -Math.floor(w / 2),
    posY: -h,
    width: w,
    height: h,
    index: 0,
    missing: false,
    image: encodeSprite({ width: w, height: h, pixels: img(w, h, fill) }),
    ...over,
  };
}

export function move(over: Partial<AFMove> = {}): AFMove {
  return {
    startX: 0,
    startY: 0,
    hitCoords: [],
    baseString: 'A10',
    extraStrings: [],
    sprites: [sprite()],
    aiFlags: 0,
    posConstraint: 0,
    unknown4: 0,
    unknown5: 0,
    unknown6: 0,
    unknown7: 0,
    unknown8: 0,
    unknown9: 0,
    unknown10: 0,
    unknown11: 0,
    nextAnimationId: 0,
    category: 9,
    blockDamage: 0,
    blockStunAndScrap: 0,
    successorId: 0,
    damageAmount: 0,
    throwDuration: 0,
    extraStringSelector: 0,
    points: 0,
    moveString: '0',
    enemyString: '',
    ...over,
  };
}

function af(moves: [number, AFMove][]): AFFile {
  return {
    fighterId: 0,
    execWindow: 10,
    endurance: 14080,
    upwardsJumpFrameLimit: 2,
    health: 200,
    forwardSpeed: 1280,
    reverseSpeed: 1024,
    jumpSpeed: -3712,
    fallSpeed: 294,
    version1: 50,
    aiProjectileYThreshold: 20,
    moves: new Map(moves),
    soundTable: Array.from({ length: 30 }, (_, i) => i),
  };
}

/** Palette with 256 distinct colours: index i = (i & 63, (i >> 6) * 20, 63 - (i & 63)), index 0 black. */
export function testPalette(): Palette {
  const colors: VGA[] = Array.from({ length: 256 }, (_, i) => [
    i & 63,
    (i >> 6) * 20,
    63 - (i & 63),
  ]);
  colors[0] = [0, 0, 0];
  return { colors };
}

function bkAnim(over: Partial<BKAnimation> = {}): BKAnimation {
  return {
    startX: 160,
    startY: 100,
    hitCoords: [],
    baseString: 'A10-B10',
    extraStrings: [],
    sprites: [sprite({ index: 0 }, 16, 16, () => 0x70), sprite({ index: 1 }, 16, 16, () => 0x71)],
    null: 0,
    chainHit: 0,
    chainNoHit: 0,
    repeat: 0,
    probability: 0,
    hazardDamage: 0,
    footerString: '',
    ...over,
  };
}

function bk(anims: [number, BKAnimation][], w = 320, h = 200, palettes = 1): BKFile {
  const remaps = Array.from({ length: 19 }, (_, k) =>
    k < 6 ? Uint8Array.from({ length: 256 }, (_, i) => (i + k + 1) & 255) : identityRemap(),
  );
  return {
    musicMask: 0x08,
    unknownA: 0,
    backgroundWidth: w,
    backgroundHeight: h,
    animations: new Map(anims),
    background: Uint8Array.from({ length: w * h }, (_, i) => (i % w) % 256),
    palettes: Array.from({ length: palettes }, (_, p) => {
      const pal = testPalette();
      if (p > 0) pal.colors[0x60] = [p * 10, 0, 0];
      return { colors: pal, remaps };
    }),
    soundTable: new Array<number>(30).fill(0),
  };
}

export function fighter(): AFFile {
  return af([
    [
      11,
      move({
        baseString: 'A10-B10',
        sprites: [sprite({ index: 0 }), sprite({ index: 1 }, 8, 8, () => 5)],
        hitCoords: [
          { x: 1, y: -4, spriteId: 0, null: 0 },
          { x: 2, y: -3, spriteId: 1, null: 0 },
        ],
      }),
    ],
    [
      12,
      move({
        baseString: 'A5',
        moveString: '"!"',
        category: 0,
        sprites: [sprite({ index: 1, missing: true, image: new Uint8Array(0) })],
      }),
    ],
    [
      20,
      move({
        baseString: 'A3-bl3B4-C2',
        category: 5,
        moveString: 'P632',
        enemyString: 'A1',
        extraStrings: ['A1', 'B1'],
        damageAmount: 12,
        blockDamage: 3,
        blockStunAndScrap: 4,
        throwDuration: 5,
        points: 6,
        nextAnimationId: 11,
        successorId: 11,
        aiFlags: 0x0302,
        posConstraint: 0x0001,
        unknown4: 1,
        unknown5: 2,
        unknown6: 3,
        unknown7: 4,
        unknown8: 5,
        unknown9: 6,
        unknown10: 7,
        unknown11: 8,
        extraStringSelector: 1,
        sprites: [sprite({ index: 2 }), sprite({ index: 3 }, 6, 10), sprite({ index: 4 }, 10, 6)],
        hitCoords: [
          { x: 3, y: -5, spriteId: 0, null: 0 },
          { x: -2, y: -2, spriteId: 1, null: 0 },
        ],
      }),
    ],
    [
      21,
      move({ baseString: 'A4', moveString: 'P63', category: 5, sprites: [sprite({ index: 5 })] }),
    ],
    // Simulation probes: slide, flip, re-entry.
    [
      22,
      move({
        baseString: 'A2-x=10B4-x=30C1',
        moveString: '!',
        sprites: [sprite({ index: 6 }), sprite({ index: 7 }), sprite({ index: 8 })],
      }),
    ],
    [
      23,
      move({
        baseString: 'A2-rB2-C2',
        moveString: '!',
        sprites: [sprite({ index: 6 }), sprite({ index: 7 }), sprite({ index: 8 })],
      }),
    ],
    [
      24,
      move({
        baseString: 'A3-B2-d1C2',
        moveString: '!',
        sprites: [sprite({ index: 6 }), sprite({ index: 7 }), sprite({ index: 8 })],
      }),
    ],
  ]);
}

export function edge(): AFFile {
  const many = Array.from({ length: 255 }, (_, i) => sprite({ index: i % 200 }, 2, 2));
  return af([
    [0, move({ sprites: [sprite({}, 0, 0, () => T)], baseString: 'A1' })],
    [1, move({ sprites: many, baseString: 'A1-B1-C1' })],
    [
      2,
      move({
        baseString: 's+5A05-cB1-x+3x-1x=2y=-3d2rfox1oy2m11q2nC1-a2',
        sprites: [sprite(), sprite(), sprite()],
        hitCoords: [
          { x: -512, y: 511, spriteId: 0, null: 3 },
          { x: 511, y: -512, spriteId: 5, null: 0 },
        ],
        aiFlags: 0x4000,
        posConstraint: 0x8000,
      }),
    ],
    [
      3,
      move({
        baseString: 'A1-'.repeat(340) + 'A11', // 1023 bytes, the most openomf loads
        extraStrings: Array.from({ length: 10 }, () => 'A1'),
      }),
    ],
    [69, move({ baseString: 'A1' })],
  ]);
}

export function arena(): BKFile {
  const anims: [number, BKAnimation][] = [6, 7, 8, 9, 10, 11, 20, 21, 24, 25, 26, 27].map((id) => [
    id,
    bkAnim(),
  ]);
  anims[0]![1].footerString = 'A1';
  return bk(anims, 320, 200, 3);
}

export function bigBk(): BKFile {
  // About 63 000 encoded bytes: 250×248 opaque.
  const near = sprite({ index: 0 }, 250, 248, (x, y) => 0x60 + ((x * 7 + y) % 32));
  const anims: [number, BKAnimation][] = Array.from({ length: 50 }, (_, i) => [
    i,
    bkAnim({ sprites: i === 0 ? [near] : [sprite({ index: i }, 4, 4)], baseString: 'A10' }),
  ]);
  return bk(anims);
}

/** Two scripted sound uses per slot kind: plain, with l/sb/sf, an overridden slot and a stray one. */
export function soundFighter(): AFFile {
  const three = [sprite({ index: 0 }), sprite({ index: 1 }), sprite({ index: 2 })];
  return af([
    [11, move({ baseString: 's1A3-s2l20sb-50sf10B3-s27C3-s40A3', sprites: three })],
    [
      12,
      move({
        baseString: 's1A2-s0A2-s25A2-s11A2',
        extraStrings: ['A1', 's9A1'],
        moveString: 'P6',
        category: 5,
        sprites: [sprite()],
      }),
    ],
  ]);
}

/** `n` sprites of w×h, each filled with its own colour from `first` on. */
const coloured = (n: number, first: number, w = 10, h = 12): Sprite[] =>
  Array.from({ length: n }, (_, i) => sprite({ index: i }, w, h, () => first + i));

/**
 * Enemy strings (spec 17 §2, spec 15 §6.1): move 9 (Damage) has five sprites in
 * colours 0x11–0x15, move 11 (Idle) one in 0x06. Move 30 is a throw (`ua` on
 * frame 3, tick 8), 31 a hit (collision points on sprite B), 32 a launch
 * (`ai`), 33 has no hit animation.
 */
export function enemyFighter(): AFFile {
  return af([
    [9, move({ baseString: 'A5-B5-C5-D5-E5', sprites: coloured(5, 0x11) })],
    [11, move({ baseString: 'A10', sprites: [sprite({ index: 0 }, 10, 12, () => 0x06)] })],
    [
      30,
      move({
        baseString: 'A4-B4-uaC6-D6',
        category: 2,
        throwDuration: 5,
        moveString: 'P2',
        enemyString: 'A2-B2-C4-D4-E4',
        sprites: coloured(4, 0x08, 12, 14),
      }),
    ],
    [
      31,
      move({
        baseString: 'A3-B3-C3',
        category: 5,
        moveString: 'P6',
        enemyString: 'A2-x-3B3-C2',
        sprites: coloured(3, 0x08, 12, 14),
        hitCoords: [{ x: 6, y: -8, spriteId: 1, null: 0 }],
      }),
    ],
    [
      32,
      move({
        baseString: 'A2-aiB2-C2',
        category: 5,
        moveString: 'K6',
        enemyString: 'A3-B3',
        sprites: coloured(3, 0x08, 12, 14),
        hitCoords: [{ x: 6, y: -8, spriteId: 1, null: 0 }],
      }),
    ],
    [33, move({ baseString: 'A2', category: 5, moveString: 'K2', sprites: [sprite()] })],
  ]);
}

/** Another opponent: move 9 has three wide sprites in 0x21–0x23. */
export function opponentFighter(): AFFile {
  return af([
    [9, move({ baseString: 'A5-B5-C5', sprites: coloured(3, 0x21, 16, 6) })],
    [11, move({ baseString: 'A10', sprites: [sprite({ index: 0 }, 16, 6, () => 0x24)] })],
  ]);
}

/**
 * Ten entries: 1 = 400 samples at 8000 Hz, 2 = 1000 at 22222 Hz, 4 = 100 at
 * 3906 Hz (below the 8000 Hz buffer floor), the rest empty.
 */
export function soundBank(): Sound[] {
  return Array.from({ length: 10 }, (_, i): Sound => {
    if (i === 0)
      return {
        freqKey: 131,
        data: Uint8Array.from({ length: 400 }, (_, k) => 128 + ((k % 20) - 10) * 8),
      };
    if (i === 1)
      return { freqKey: 211, data: Uint8Array.from({ length: 1000 }, (_, k) => (k * 5) & 255) };
    if (i === 3) return { freqKey: 0, data: new Uint8Array(100).fill(200) };
    return { freqKey: 0, data: new Uint8Array(0) };
  });
}

export function altpals(): Palette[] {
  return Array.from({ length: 11 }, (_, p) => ({
    colors: Array.from(
      { length: 256 },
      (_, i) => [(i % 16) * 4, (Math.floor(i / 16) * 4 + p) & 63, p * 5] as VGA,
    ),
  }));
}

export function pngs(pal: Palette): Record<string, Uint8Array> {
  const rgb = pal.colors.map(
    (c) => c.map((v) => ((v << 2) | ((v & 0x30) >> 4)) & 255) as [number, number, number],
  );
  const exact = encodeIndexedPng({
    width: 4,
    height: 4,
    indices: Uint8Array.from({ length: 16 }, (_, i) => (i === 0 ? 0 : 0x60 + i)),
    palette: rgb,
    transparentIndex: 0,
  });
  const odd = rgb.map((c, i) =>
    i >= 1 && i <= 3 ? ([1, 2, 3 + i] as [number, number, number]) : c,
  );
  const unmatched = encodeIndexedPng({
    width: 4,
    height: 1,
    indices: Uint8Array.from([1, 2, 3, 0x61]),
    palette: odd,
    transparentIndex: null,
  });
  return { 'exact.png': exact, 'unmatched.png': unmatched, ...rgbaPngs(rgb) };
}

/**
 * RGBA PNGs (spec 17 §2): `alpha.png` is 4×1 in colours 0x61–0x64 with alpha
 * 0, 100, 200 and 255; `oversized.png` is 300×300 opaque, more than a sprite's
 * 65 535 bytes can hold.
 */
function rgbaPngs(rgb: [number, number, number][]): Record<string, Uint8Array> {
  const alpha = [0, 100, 200, 255].flatMap((a, i) => [...rgb[0x61 + i]!, a]);
  const big = new Uint8Array(300 * 300 * 4);
  for (let i = 0; i < 300 * 300; i++) big.set([...rgb[0x61]!, 255], i * 4);
  const png = (width: number, height: number, data: Uint8Array) =>
    encodeRgbaPng({ width, height, data, channels: 4, depth: 8 });
  return {
    'alpha.png': png(4, 1, Uint8Array.from(alpha)),
    'oversized.png': png(300, 300, big),
  };
}

/**
 * Corner cases of spec 17 §4: move 1 has no sprites, move 2's string shows
 * sprite Z though only A–C exist, move 3 has a 21-byte move string (no NUL).
 */
function corner(): AFFile {
  const f = fighter();
  f.moves = new Map([
    [1, move({ sprites: [], baseString: 'A5' })],
    [
      2,
      move({
        sprites: [sprite({ index: 1 }), sprite({ index: 2 }), sprite({ index: 3 })],
        baseString: 'A2-Z3-C2',
      }),
    ],
    [3, move({ moveString: 'ABCDEFGHIJKLMNOPQRSTU' })],
  ]);
  return f;
}

export default function globalSetup(): void {
  mkdirSync(FIXTURES, { recursive: true });
  const formats = join(import.meta.dirname, '../../../omf-formats/test/fixtures');
  copyFileSync(join(formats, 'test.af'), join(FIXTURES, 'tiny.af'));
  copyFileSync(join(formats, 'test.bk'), join(FIXTURES, 'tiny.bk'));
  // The shipped-bug corpus (omf-formats test/corpus.ts).
  copyFileSync(join(formats, 'corpus.af'), join(FIXTURES, 'corpus.af'));
  copyFileSync(join(formats, 'corpus.bk'), join(FIXTURES, 'corpus.bk'));
  const f = fighter();
  writeFileSync(join(FIXTURES, 'fighter.af'), writeAF(f));
  writeFileSync(join(FIXTURES, 'fighter.json'), JSON.stringify(afToJSON(f)));
  const bad = afToJSON(f);
  bad.moves['11']!.sprites[0]!.pos_x = 40000;
  writeFileSync(join(FIXTURES, 'bad.json'), JSON.stringify(bad));
  writeFileSync(join(FIXTURES, 'edge.af'), writeAF(edge()));
  const arenaBytes = writeBK(arena());
  writeFileSync(join(FIXTURES, 'arena.bk'), arenaBytes);
  for (const cut of [5, 40, 2000])
    writeFileSync(join(FIXTURES, `truncated-${cut}.bk`), arenaBytes.slice(0, cut));
  writeFileSync(join(FIXTURES, 'menu.bk'), writeBK(bk([[1, bkAnim()]], 64, 32)));
  writeFileSync(join(FIXTURES, 'big.bk'), writeBK(bigBk()));
  writeFileSync(join(FIXTURES, 'altpals.dat'), writeAltPals(altpals()));
  writeFileSync(join(FIXTURES, 'sound.af'), writeAF(soundFighter()));
  writeFileSync(join(FIXTURES, 'sounds.dat'), writeSounds(soundBank()));
  writeFileSync(join(FIXTURES, 'corner.af'), writeAF(corner()));
  writeFileSync(join(FIXTURES, 'enemy.af'), writeAF(enemyFighter()));
  writeFileSync(join(FIXTURES, 'opponent.af'), writeAF(opponentFighter()));
  const wrongBackground = bkToJSON(readBK(arenaBytes));
  wrongBackground.background_image = wrongBackground.background_image.slice(0, 100);
  writeFileSync(join(FIXTURES, 'bad-background.json'), JSON.stringify(wrongBackground));
  for (const [name, bytes] of Object.entries(pngs(testPalette())))
    writeFileSync(join(FIXTURES, name), bytes);
}
