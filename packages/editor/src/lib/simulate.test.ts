import { describe, expect, it } from 'vitest';
import { decodeScript } from '@omf/formats';
import { Simulator, shakeOffset } from './simulate';

const sim = (s: string, loop = false, direction: 1 | -1 = 1) =>
  new Simulator(decodeScript(s), { direction, loop, hold: null });

function run(s: Simulator, ticks: number): (typeof s.state)[] {
  const out = [{ ...s.state }];
  for (let i = 0; i < ticks; i++) {
    s.step();
    out.push({ ...s.state });
  }
  return out;
}

describe('Simulator (openomf player.c)', () => {
  it('applies x+/y+ on every tick of the frame, tick 0 included (S8)', () => {
    const s = sim('x+2y-1A3-B1', true);
    expect([s.state.x, s.state.y]).toEqual([2, -1]);
    const xs = run(s, 3).map((st) => st.x);
    expect(xs).toEqual([2, 4, 6, 6]);
    expect(sim('x-3A2', false, -1).state.x).toBe(3);
  });

  it('flips belong to the frame that sets them (S10)', () => {
    const flips = run(sim('A2-rB2-fC2-rfD1'), 6).map((st) => [st.frameIndex, st.flipX, st.flipY]);
    expect(flips).toEqual([
      [0, false, false],
      [0, false, false],
      [1, true, false],
      [1, true, false],
      [2, false, true],
      [2, false, true],
      [3, true, true],
    ]);
  });

  it('shakes for 4 × n ticks with a sine falloff (S10)', () => {
    const s = sim('bl3A20');
    expect(s.state.shakeX).toBe(12);
    const left = run(s, 13).map((st) => st.shakeX);
    expect(left).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0]);
    expect(shakeOffset(12)).toBe(Math.trunc(Math.sin(12) * 4));
    expect(shakeOffset(0)).toBe(0);
  });

  it('x= and y= slides keep each other and reuse the slide when already there (S11)', () => {
    // x slides 0 → 10 over A..C; y= on B starts a y slide without stopping the x slide.
    const s = sim('x=0A4-y=0B2-x=10y=4C1');
    const pos = run(s, 6).map((st) => [+st.x.toFixed(3), +st.y.toFixed(3)]);
    expect(pos).toEqual([
      [0, 0],
      [1.667, 0],
      [3.333, 0],
      [5, 0],
      [6.667, 0],
      [8.333, 2],
      [10, 4],
    ]);
  });

  it('a d tag without value re-enters at tick 1 (S16)', () => {
    const ticks = run(sim('A2-dB2'), 5).map((st) => st.tick);
    expect(ticks).toEqual([0, 1, 2, 1, 2, 1]);
  });

  it('negative durations count as written (S17)', () => {
    // A5 B-3 C4: B covers no tick, C starts at tick 2; tick 5 is the first one only C covers.
    const s = sim('A5-B-3-C4');
    const frames = run(s, 6).map((st) => (st.finished ? 'end' : st.frameIndex));
    expect(frames).toEqual([0, 0, 0, 0, 0, 2, 'end']);
  });

  it('seekTo reaches a tick past d loops and holds, with the state on the way', () => {
    const s = new Simulator(decodeScript('x+1A3-dB2-rC2'), { direction: 1, loop: true, hold: 0 });
    s.seekTo(5);
    expect(s.state).toMatchObject({ tick: 5, frameIndex: 2, flipX: true, x: 3 });
    s.step(); // normal playback resumes from there
    expect(s.state.tick).toBe(6);
  });
});

describe('Simulator start and lead-in (paired enemy-string preview)', () => {
  const opts = { direction: 1 as const, loop: false, hold: null };

  it('start: the reader begins on that tick, the ticks before it never play (player.c ua seek)', () => {
    const s = new Simulator(decodeScript('x+1A4-B4-C4'), { ...opts, start: 4 });
    expect(s.state).toMatchObject({ tick: 4, frameIndex: 1, x: 0, entered: true });
  });

  it('lead: waits that many ticks with no frame, then enters the start frame', () => {
    const s = new Simulator(decodeScript('A2-bl1B2'), { ...opts, lead: 3 });
    const st = run(s, 5).map((x) => [x.tick, x.frameIndex, x.preroll, x.entered]);
    expect(st).toEqual([
      [-3, -1, true, false],
      [-2, -1, true, false],
      [-1, -1, true, false],
      [0, 0, false, true],
      [1, 0, false, false],
      [2, 1, false, true],
    ]);
  });

  it('a throw: lead and start on the same tick keep the reader on the scene tick', () => {
    const s = new Simulator(decodeScript('A4-B4-C4'), { ...opts, start: 8, lead: 8 });
    expect(s.state).toMatchObject({ tick: 0, preroll: true });
    s.seekTo(9);
    expect(s.state).toMatchObject({ tick: 9, frameIndex: 2, preroll: false });
    s.seekTo(3);
    expect(s.state).toMatchObject({ tick: 3, preroll: true });
  });

  it('looping starts over with the lead-in', () => {
    const s = new Simulator(decodeScript('A2'), { ...opts, loop: true, lead: 1 });
    const st = run(s, 4).map((x) => [x.tick, x.preroll]);
    expect(st).toEqual([
      [-1, true],
      [0, false],
      [1, false],
      [-1, true],
      [0, false],
    ]);
  });

  it('e puts the object on the other fighter each tick, then x/y move it (player.c)', () => {
    const s = new Simulator(decodeScript('A1-ex-5y-2B2-C1'), {
      direction: -1,
      loop: false,
      hold: null,
      enemyAt: (t) => ({ x: -40 + t, y: 0 }),
    });
    const st = run(s, 3).map((x) => [x.tick, x.x, x.y]);
    // Facing left x-5 moves right: on the fighter at -40 + tick, plus 5.
    expect(st).toEqual([
      [0, 0, 0],
      [1, -34, -2],
      [2, -33, -2],
      [3, -33, -2],
    ]);
  });

  it('statesByTick: one state per reader tick, straight through d loops', () => {
    const s = new Simulator(decodeScript('x+1A2-dB2'), { ...opts, loop: true });
    const st = s.statesByTick();
    expect(st.map((x) => [x.tick, x.frameIndex, x.x])).toEqual([
      [0, 0, 1],
      [1, 0, 2],
      [2, 1, 2],
      [3, 1, 2],
    ]);
  });
});
