import { describe, expect, it } from 'vitest';
import { encodeSprite } from '@omf/formats';
import { gifRepeat, gifTimeline, renderAnimation } from './animExport';
import { newMove } from './templates';

const sprite = (pixels: number[], w = pixels.length, h = 1) => ({
  posX: 0,
  posY: 0,
  width: w,
  height: h,
  index: 1,
  missing: false,
  image: encodeSprite({ width: w, height: h, pixels: Uint16Array.from(pixels) }),
});

describe('GIF timing', () => {
  it('never emits frames under 20 ms, keeping the total (X2)', () => {
    const t = gifTimeline(Array.from({ length: 10 }, () => 10));
    expect(t.every((g) => g.delayMs >= 20)).toBe(true);
    expect(t.reduce((s, g) => s + g.delayMs, 0)).toBe(100);
    expect(t.map((g) => g.frame)).toEqual([0, 2, 4, 6, 8]);
    expect(gifTimeline([28, 28, 28]).map((g) => g.delayMs)).toEqual([30, 30, 20]);
  });

  it('counts plays the same way as APNG (X3)', () => {
    expect(gifRepeat(0)).toBe(0); // forever
    expect(gifRepeat(1)).toBe(-1); // once: no loop extension
    expect(gifRepeat(3)).toBe(2);
  });
});

describe('renderAnimation (X4)', () => {
  it('reports progress up to the tick count', () => {
    const a = newMove({ baseString: 'A250', sprites: [sprite([3])] });
    const seen: number[] = [];
    const r = renderAnimation(
      {
        kind: 'af',
        animation: a,
        animations: [a],
        script: { frames: [{ key: 'A', duration: 250, tags: [], erratas: [] }] },
        background: null,
        playerOffset: 0,
        facingLeft: false,
        startTick: 0,
        endTick: 250,
        zoom: 1,
        msPerTick: 10,
      },
      (done) => seen.push(done),
    );
    expect(seen).toEqual([0, 100, 200, 250]);
    expect(r.frames.length).toBe(1);
  });
});
