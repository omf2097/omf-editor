import { describe, expect, it } from 'vitest';
import { encodeSprite, writeAF, writeBK, type AFFile, type BKFile } from '@omf/formats';
import { cloneDoc } from './doc';
import { newFighter, newScene, newSceneAnimation } from './templates';

function fighter(): AFFile {
  const f = newFighter();
  const m = f.moves.get(1)!;
  m.hitCoords = [{ x: 1, y: 2, spriteId: 0, null: 0 }];
  m.extraStrings = ['A1'];
  m.moveStringRaw = new Uint8Array(21);
  m.sprites[0]!.image = encodeSprite({ width: 1, height: 1, pixels: Uint16Array.of(5) });
  return f;
}

function scene(): BKFile {
  const b = newScene();
  b.animations.set(10, newSceneAnimation());
  return b;
}

describe('cloneDoc (spec 11 §Mutation and undo)', () => {
  it('AF: copies every object, array and Map; shares images and raw move strings', () => {
    const a = fighter();
    const c = cloneDoc(a);
    expect(writeAF(c)).toEqual(writeAF(a));
    expect(c).not.toBe(a);
    expect(c.moves).not.toBe(a.moves);
    expect(c.soundTable).not.toBe(a.soundTable);
    const [m, n] = [a.moves.get(1)!, c.moves.get(1)!];
    expect(n).not.toBe(m);
    expect(n.hitCoords).not.toBe(m.hitCoords);
    expect(n.hitCoords[0]).not.toBe(m.hitCoords[0]);
    expect(n.extraStrings).not.toBe(m.extraStrings);
    expect(n.sprites).not.toBe(m.sprites);
    expect(n.sprites[0]).not.toBe(m.sprites[0]);
    // The immutable buffers are shared, not copied.
    expect(n.sprites[0]!.image).toBe(m.sprites[0]!.image);
    expect(n.moveStringRaw).toBe(m.moveStringRaw);
  });

  it('AF: editing the copy leaves the original as it was', () => {
    const a = fighter();
    const before = writeAF(a);
    const c = cloneDoc(a);
    const n = c.moves.get(1)!;
    n.hitCoords[0]!.x = 9;
    n.extraStrings.push('B2');
    n.sprites[0]!.posX = 33;
    n.sprites.push({ ...n.sprites[0]! });
    c.soundTable[0] = 77;
    c.moves.delete(2);
    c.health = 1;
    expect(writeAF(a)).toEqual(before);
  });

  it('BK: palettes and colours are copied, remap tables and background shared', () => {
    const b = scene();
    const before = writeBK(b);
    const c = cloneDoc(b);
    expect(c.animations).not.toBe(b.animations);
    expect(c.palettes).not.toBe(b.palettes);
    expect(c.palettes[0]!.colors.colors).not.toBe(b.palettes[0]!.colors.colors);
    expect(c.palettes[0]!.colors.colors[3]).not.toBe(b.palettes[0]!.colors.colors[3]);
    expect(c.palettes[0]!.remaps).not.toBe(b.palettes[0]!.remaps);
    expect(c.palettes[0]!.remaps[0]).toBe(b.palettes[0]!.remaps[0]);
    expect(c.background).toBe(b.background);
    c.palettes[0]!.colors.colors[3]![0] = 63;
    c.palettes.push(c.palettes[0]!);
    c.animations.get(10)!.footerString = 'x';
    c.soundTable[1] = 5;
    expect(writeBK(b)).toEqual(before);
  });
});
