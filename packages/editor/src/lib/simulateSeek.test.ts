import { describe, expect, it } from 'vitest';
import { decodeScript, tickPosAtFrame } from '@omf/formats';
import { Simulator } from './simulate';

function seekFrame(str: string, hold: number | null, frame: number) {
  const sc = decodeScript(str);
  const s = new Simulator(sc, { direction: 1, loop: true, hold });
  s.seekTo(tickPosAtFrame(sc, frame));
  return s.state;
}

describe('Simulator.seekTo (P2)', () => {
  it('reaches any frame while another frame is held', () => {
    for (const hold of [null, 0, 1, 2])
      expect(seekFrame('A10-B10-C10', hold, 2).frameIndex, `hold ${hold}`).toBe(2);
  });

  it('reaches frames after a d jump back', () => {
    expect(seekFrame('A10-d0B10-C10', null, 2)).toMatchObject({ frameIndex: 2, tick: 20 });
    expect(seekFrame('A10-B10-d5C10-D10', null, 3)).toMatchObject({ frameIndex: 3, tick: 30 });
  });

  it('applies the per-tick motion of the frames before the position', () => {
    // Same as replaying the ticks when nothing jumps.
    const sc = decodeScript('x+2A3-B3');
    const replay = new Simulator(sc, { direction: 1, loop: true, hold: null });
    replay.seek(3);
    const s = seekFrame('x+2A3-B3', null, 1);
    expect(s.frameIndex).toBe(1);
    expect(s.x).toBe(replay.state.x);
    expect(s.x).toBeGreaterThan(0);
  });

  it('clamps to the script and leaves an empty script alone', () => {
    const sc = decodeScript('A2-B2');
    const s = new Simulator(sc, { direction: 1, loop: false, hold: null });
    s.seekTo(99);
    expect(s.state).toMatchObject({ tick: 3, frameIndex: 1, finished: false });
    const e = new Simulator({ frames: [] }, { direction: 1, loop: true, hold: null });
    e.seekTo(5);
    expect(e.state.tick).toBe(0);
  });

  it('playing on from the position still honours hold and d', () => {
    const sc = decodeScript('A2-B2-C2');
    const s = new Simulator(sc, { direction: 1, loop: true, hold: 2 });
    s.seekTo(4);
    for (let i = 0; i < 10; i++) s.step();
    expect(s.state.frameIndex).toBe(2);
  });
});
