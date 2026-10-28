import { describe, expect, it } from 'vitest';
import { decodeScript, type Sprite } from '@omf/formats';
import {
  attackerOffset,
  attackerStateAt,
  attackerTickAt,
  firstHitFrame,
  pairOrigins,
  pairTiming,
  uaFrame,
} from './enemyPair';
import { ARENA_FLOOR } from './scene';

const hit = (spriteId: number) => ({ x: 0, y: 0, spriteId, null: 0 });

describe('pairing the attacker and the opponent', () => {
  it('finds the ua frame and the first frame with collision points', () => {
    expect(uaFrame(decodeScript('A4-B4-uaC6-D6'))).toBe(2);
    expect(uaFrame(decodeScript('A4-B4'))).toBe(-1);
    expect(firstHitFrame(decodeScript('A3-B3-C3-B2'), [hit(1)])).toBe(1);
    expect(firstHitFrame(decodeScript('A3-B3'), [])).toBe(0);
  });

  it('a throw starts the opponent on the ua tick, both readers on the same tick (player.c)', () => {
    const t = pairTiming(decodeScript('A4-B4-uaC6-D6'), [], 0);
    expect(t).toEqual({ frame: 2, throw: true, attackerStart: 8, enemyStart: 8 });
    expect(attackerTickAt(8, t)).toBe(8);
    expect(attackerTickAt(11, t)).toBe(11);
    // The lead-in: the opponent waits on ticks 0..7 while the attacker runs them.
    expect(attackerTickAt(0, t)).toBe(0);
  });

  it('a hit starts the enemy string from tick 0 on the hitting frame', () => {
    const base = decodeScript('A3-B3-C3');
    const t = pairTiming(base, [hit(1)], null);
    expect(t).toEqual({ frame: 1, throw: false, attackerStart: 3, enemyStart: 0 });
    expect(attackerTickAt(0, t)).toBe(3);
    expect(attackerTickAt(-3, t)).toBe(0);
    // A chosen frame wins over the default and is kept inside the string.
    expect(pairTiming(base, [hit(1)], 2).attackerStart).toBe(6);
    expect(pairTiming(base, [hit(1)], 9).frame).toBe(2);
  });

  it("the attacker's position for e, held on its last state after its string ends", () => {
    const t = pairTiming(decodeScript('A2-uaB2'), [], null);
    const states = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: -1 },
      { x: 3, y: -1 },
    ];
    const origins = { attacker: { x: 130, y: 190 }, opponent: { x: 190, y: 190 } };
    const at = attackerOffset(states, t, origins);
    expect(at(2)).toEqual({ x: -58, y: -1 });
    expect(at(10)).toEqual({ x: -57, y: -1 });
    expect(attackerStateAt([], 0, t)).toBeNull();
  });

  it('stands both on the floor, distance apart, facing each other', () => {
    const a = { startX: 0, startY: 0, sprites: [] as Sprite[] };
    const right = pairOrigins(a, a, { distance: 60, facingLeft: false, centred: false });
    expect(right).toEqual({
      attacker: { x: 130, y: ARENA_FLOOR },
      opponent: { x: 190, y: ARENA_FLOOR },
    });
    const left = pairOrigins(a, a, { distance: 60, facingLeft: true, centred: false });
    expect(left.attacker.x).toBe(190);
    expect(left.opponent.x).toBe(130);
  });

  it('centred: shifts both together so their sprites are centred in the scene', () => {
    const s: Sprite = {
      posX: -5,
      posY: -20,
      width: 10,
      height: 20,
      index: 0,
      missing: false,
      image: new Uint8Array(1),
    };
    const a = { startX: 0, startY: 0, sprites: [s] };
    const o = pairOrigins(a, a, { distance: 60, facingLeft: false, centred: true });
    expect(o.opponent.x - o.attacker.x).toBe(60);
    // The union spans attacker.x - 5 .. opponent.x + 5 and 20 pixels above the origins.
    expect((o.attacker.x - 5 + o.opponent.x + 5) / 2).toBe(160);
    expect(o.attacker.y - 10).toBe(100);
  });
});
