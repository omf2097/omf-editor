import { describe, expect, it, vi } from 'vitest';
import { writeAF, type AFFile, type AFMove } from '@omf/formats';
import { newFighter, newMove } from '../lib/templates';

vi.mock('../lib/db', () => ({
  getSetting: async (_k: string, fallback: unknown) => fallback,
  setSetting: async () => undefined,
}));

/** A fighter with a move 9 of `damageSprites` sprites and move 20 as given. */
function fighter(damageSprites: number, m20: Partial<AFMove> = {}): AFFile {
  const af = newFighter();
  const dmg = newMove();
  dmg.sprites = Array.from({ length: damageSprites }, () => ({ ...dmg.sprites[0]! }));
  af.moves.set(9, dmg);
  af.moves.set(20, newMove({ baseString: 'A3-B3', enemyString: 'A2-B2', ...m20 }));
  return af;
}

async function load(af: AFFile) {
  vi.resetModules();
  const { useDocument } = await import('./useDocument');
  const { useOpponent } = await import('./useOpponent');
  useDocument().openBytes('F.AF', writeAF(af));
  return { docs: useDocument(), opponent: useOpponent() };
}

describe('useOpponent (spec 15 §6.1)', () => {
  it("defaults to the document's own move 9; another AF replaces it for the session", async () => {
    const { docs, opponent } = await load(fighter(4));
    expect(opponent.damage.value?.sprites).toHaveLength(4);
    expect(opponent.loadBytes('O.AF', writeAF(fighter(7)))).toBe(true);
    expect(opponent.damage.value?.sprites).toHaveLength(7);
    // Opening another document keeps the chosen opponent.
    docs.openBytes('G.AF', writeAF(fighter(2)));
    expect(opponent.damage.value?.sprites).toHaveLength(7);
    opponent.reset();
    expect(opponent.damage.value?.sprites).toHaveLength(2);
  });

  it('a file that is not an AF is refused and keeps the opponent', async () => {
    const { opponent } = await load(fighter(4));
    expect(opponent.loadBytes('X.AF', new Uint8Array([1, 2, 3]))).toBe(false);
    expect(opponent.loaded.value).toBeNull();
  });

  it('variants apply to plain hits; a throw (throw_duration or ua) plays the string as is', async () => {
    const { opponent } = await load(fighter(4, { throwDuration: 0 }));
    opponent.variant.value = { position: 'airborne', stun: false };
    expect(opponent.planFor(20)).toMatchObject({
      plain: null,
      effective: { text: 'A2-B2-L2-M5-L2' },
    });
    const thrown = await load(fighter(4, { throwDuration: 5 }));
    thrown.opponent.variant.value = { position: 'airborne', stun: true };
    expect(thrown.opponent.planFor(20)).toMatchObject({
      plain: 'throw',
      effective: { text: 'A2-B2' },
    });
    const ua = await load(fighter(4, { throwDuration: 0, baseString: 'A3-uaB3' }));
    ua.opponent.paired.value = true;
    expect(ua.opponent.planFor(20)).toMatchObject({ plain: 'ua', start: 3, lead: 3 });
  });

  it('Launch needs a frame with ai; without one it plays as Standing', async () => {
    const { opponent } = await load(fighter(4, { throwDuration: 0 }));
    opponent.variant.value = { position: 'launch', stun: false };
    expect(opponent.planFor(20)?.effective.text).toBe('A2-B2');
    const ai = await load(fighter(4, { throwDuration: 0, baseString: 'A3-aiB3' }));
    ai.opponent.variant.value = { position: 'launch', stun: false };
    expect(ai.opponent.planFor(20)).toMatchObject({
      launch: [1],
      effective: { text: 'A1-s01l50B2-C2-L5-M400' },
    });
  });
});
