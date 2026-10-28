// Layout maths of the Script tab timeline (spec 15 §3.1). A segment is
// PX_PER_TICK pixels per tick of its frame's duration, at least MIN_W wide,
// so the pixel axis is not linear in time: the playhead is placed within
// the segment of the frame that is playing.
import type { Frame } from '@omf/formats';

export const PX_PER_TICK = 6;
/** Wide enough for a 3-digit duration at the 13 px segment text. */
export const MIN_W = 36;

export const segmentWidth = (duration: number): number => Math.max(MIN_W, duration * PX_PER_TICK);

/** Tick at which each frame starts (negative durations count as 0). */
export function frameStarts(frames: readonly Frame[]): number[] {
  const out: number[] = [];
  let t = 0;
  for (const f of frames) {
    out.push(t);
    t += Math.max(0, f.duration);
  }
  return out;
}

/** Pixel position of the playhead at `tick`; past the end it stays in the last segment. */
export function playheadX(frames: readonly Frame[], tick: number): number {
  const starts = frameStarts(frames);
  let x = 0;
  for (let i = 0; i < frames.length; i++) {
    const d = Math.max(0, frames[i]!.duration);
    const w = segmentWidth(frames[i]!.duration);
    if (tick < starts[i]! + d || i === frames.length - 1) {
      const within = d === 0 ? 0 : Math.min(1, (tick - starts[i]!) / d);
      return x + within * w;
    }
    x += w;
  }
  return 0;
}

/** Duration after dragging a segment's right edge by `dx` pixels: 1-tick steps, 5 with Shift. */
export function resizedDuration(startDuration: number, dx: number, coarse: boolean): number {
  const step = coarse ? 5 : 1;
  const delta = Math.round(dx / PX_PER_TICK / step) * step;
  return Math.max(0, startDuration + delta);
}
