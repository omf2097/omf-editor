import { describe, expect, it } from 'vitest';
import type { BKAnimation } from '@omf/formats';
import { newFighter, newMove, newScene } from './templates';
import { referencesTo } from './references';

describe('referencesTo (D15, openomf semantics)', () => {
  it('0 in an id field means none', () => {
    const af = newFighter();
    af.moves = new Map([
      [0, newMove()],
      [5, newMove({ nextAnimationId: 0, successorId: 0, category: 4 })],
    ]);
    expect(referencesTo(af, 0)).toEqual([]);
  });

  it("a CLOSE move's successor_id is a throw distance, not a reference", () => {
    const af = newFighter();
    af.moves = new Map([
      [3, newMove()],
      [5, newMove({ category: 2, successorId: 3 })],
      [6, newMove({ category: 4, successorId: 3 })],
    ]);
    expect(referencesTo(af, 3)).toEqual(['6: successor_id']);
  });

  it("a projectile's throw_duration is the id it switches to", () => {
    const af = newFighter();
    af.moves = new Map([
      [3, newMove()],
      [5, newMove({ category: 8, throwDuration: 3 })],
      [6, newMove({ category: 4, throwDuration: 3 })],
    ]);
    expect(referencesTo(af, 3)).toEqual(['5: throw_duration']);
  });

  it('next_animation_id and BK chains still count', () => {
    const af = newFighter();
    af.moves = new Map([
      [3, newMove()],
      [5, newMove({ nextAnimationId: 3 })],
    ]);
    expect(referencesTo(af, 3)).toEqual(['5: next_animation_id']);
    const bk = newScene();
    const base: BKAnimation = {
      startX: 0,
      startY: 0,
      hitCoords: [],
      baseString: 'A1',
      extraStrings: [],
      sprites: [],
      null: 0,
      chainHit: 0,
      chainNoHit: 0,
      repeat: 0,
      probability: 0,
      hazardDamage: 0,
      footerString: '',
    };
    bk.animations = new Map([
      [0, { ...base }],
      [4, { ...base, chainHit: 0, chainNoHit: 7 }],
      [7, { ...base }],
    ]);
    expect(referencesTo(bk, 0)).toEqual([]);
    expect(referencesTo(bk, 7)).toEqual(['4: chain_no_hit']);
  });
});
