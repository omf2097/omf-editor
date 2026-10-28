import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { AFFile } from '@omf/formats';
import { newFighter } from '../lib/templates';
import { serializeDocument } from '../lib/doc';

vi.mock('../lib/db', () => ({
  getSetting: async (_k: string, fallback: unknown) => fallback,
  setSetting: async () => undefined,
}));

const ID = 1;

/** A fighter whose move 1 has `base` and `extras`. */
function bytesWith(base: string, extras: string[] = []): Uint8Array {
  const af = newFighter();
  const m = af.moves.get(ID)!;
  m.baseString = base;
  m.extraStrings = extras;
  return serializeDocument(af);
}

async function load(base: string, extras: string[] = []) {
  vi.resetModules();
  const { useDocument } = await import('./useDocument');
  const { usePlayback } = await import('./usePlayback');
  const docs = useDocument();
  const pb = usePlayback();
  docs.openBytes('F.AF', bytesWith(base, extras));
  pb.bind(ID);
  await nextTick();
  return { docs, pb };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

describe('usePlayback seeking (P2, P3)', () => {
  it('selecting a frame while another is held lands on it', async () => {
    const { pb } = await load('A10-B10-C10');
    pb.holdFrame.value = 0;
    await nextTick();
    pb.seekFrame(2);
    expect(pb.state.value.frameIndex).toBe(2);
    pb.stepFrame(-1);
    expect(pb.state.value.frameIndex).toBe(1);
  });

  it('the scrubber reaches ticks after a d loop', async () => {
    const { pb } = await load('A10-d0B10-C10');
    pb.seekTick(25);
    expect(pb.state.value).toMatchObject({ frameIndex: 2, tick: 25 });
  });

  it('a seek right after switching the string is kept', async () => {
    const { pb } = await load('A10-B10', ['A5-B5-C5']);
    pb.source.value = 0;
    pb.seekFrame(2);
    await nextTick();
    expect(pb.state.value.frameIndex).toBe(2);
    expect(pb.scriptText.value).toBe('A5-B5-C5');
  });

  it('a script edit keeps the reader on its tick', async () => {
    const { pb, docs } = await load('A10-B10-C10');
    pb.seekFrame(2);
    docs.mutate<AFFile>('edit script 1', (d) => {
      d.moves.get(ID)!.baseString = 'A10-B10-C10-D10';
    });
    await nextTick();
    expect(pb.state.value.frameIndex).toBe(2);
  });
});

describe('usePlayback state across edits and documents (D1, D8, D9)', () => {
  it('undo of "add extra string" while it plays goes back to the base string', async () => {
    const { pb, docs } = await load('A10');
    docs.mutate<AFFile>('add extra string 1', (d) => {
      d.moves.get(ID)!.extraStrings = ['B3'];
    });
    pb.source.value = 0;
    docs.undo();
    expect(pb.source.value).toBe('base');
    expect(pb.scriptText.value).toBe('A10');
  });

  it('opening another document stops playback and clears hold and string', async () => {
    const { pb, docs } = await load('A10-B10', ['A3']);
    pb.source.value = 0;
    pb.holdFrame.value = 0;
    pb.play({ silent: true });
    expect(pb.playing.value).toBe(true);
    docs.openBytes('G.AF', bytesWith('A10-B10', ['A3']));
    expect(pb.playing.value).toBe(false);
    expect(pb.holdFrame.value).toBeNull();
    expect(pb.source.value).toBe('base');
  });

  it('playback stops when the script becomes empty', async () => {
    const { pb, docs } = await load('A10-B10');
    pb.play({ silent: true });
    docs.mutate<AFFile>('edit script 1', (d) => {
      d.moves.get(ID)!.baseString = '';
    });
    await nextTick();
    expect(pb.total.value).toBe(0);
    expect(pb.playing.value).toBe(false);
  });
});

describe('usePlayback on the enemy string (spec 15 §6.1)', () => {
  async function enemy(base: string, enemyString: string) {
    const r = await load(base);
    r.docs.mutate<AFFile>('set enemy', (d) => {
      const m = d.moves.get(ID)!;
      m.enemyString = enemyString;
      m.throwDuration = 0;
    });
    const { useOpponent } = await import('./useOpponent');
    r.pb.source.value = 'enemy';
    await nextTick();
    return { ...r, opponent: useOpponent() };
  }

  it('plays the variant openomf makes, mirrored to face the attacker', async () => {
    const { pb, opponent } = await enemy('A3-B3', 'A2-B2');
    expect(pb.scriptText.value).toBe('A2-B2');
    expect(pb.facingLeft.value).toBe(true);
    opponent.variant.value = { position: 'airborne', stun: false };
    await nextTick();
    expect(pb.scriptText.value).toBe('A2-B2-L2-M5-L2');
  });

  it('paired with a ua throw: the lead-in runs up to the ua tick, then both share it', async () => {
    const { pb, opponent } = await enemy('A4-B4-uaC6', 'A2-B2-C4-D4-E4');
    opponent.paired.value = true;
    await nextTick();
    expect(pb.enemy.value).toMatchObject({ start: 8, lead: 8, plain: 'ua' });
    expect(pb.state.value).toMatchObject({ tick: 0, preroll: true });
    pb.stepTicks(8);
    expect(pb.state.value).toMatchObject({ tick: 8, frameIndex: 3, preroll: false });
    pb.seekStart();
    expect(pb.state.value.tick).toBe(0);
  });

  it('a BK document has no enemy string: playback goes back to the base string', async () => {
    const { pb, docs } = await enemy('A3', 'A2');
    expect(pb.source.value).toBe('enemy');
    const { newScene } = await import('../lib/templates');
    const { serializeDocument: ser } = await import('../lib/doc');
    docs.openBytes('S.BK', ser(newScene()));
    expect(pb.source.value).toBe('base');
  });
});
