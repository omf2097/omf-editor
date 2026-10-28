// Per-tick preview simulation following openomf player.c (spec 11, 15 §5):
// each game tick advances the script reader, then applies the frame now active.

import { tagValue, tickPosAtFrame, totalTicks, type Frame, type Script } from '@omf/formats';

export interface SimState {
  /** Script tick (reader position). */
  tick: number;
  frameIndex: number;
  /** Object offset from the animation origin, in scene pixels (facing applied). */
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
  /** Screen shake counters (openomf: 4 × bl / bb, counting down one per tick). */
  shakeX: number;
  shakeY: number;
  /** Ticks since the animation started (or the last loop). */
  elapsed: number;
  finished: boolean;
  /** Frame entered on this tick. */
  entered: boolean;
  /**
   * Before the script starts (SimOptions.lead): nothing of it is shown yet,
   * frameIndex is -1 and tick counts up to SimOptions.start.
   */
  preroll: boolean;
}

export interface SimOptions {
  /** 1 facing right, -1 facing left. */
  direction: 1 | -1;
  loop: boolean;
  /** Frame index to hold (loop this frame), or null. */
  hold: number | null;
  /**
   * Reader tick the script starts on (default 0). openomf seeks a thrown
   * opponent's reader to the attacker's tick (player.c `ua`), so the ticks
   * before it never play.
   */
  start?: number;
  /**
   * Ticks of waiting before the script starts (default 0): the paired preview
   * runs the attacker this long before the opponent is hit. The reader tick
   * counts from start - lead during them.
   */
  lead?: number;
  /**
   * Where the other fighter is at reader tick `t`, as an offset from this
   * object's origin; null when there is none. A frame with `e` (and no `am`)
   * puts the object there on each of its ticks before moving it (player.c
   * ~216). Only the paired enemy-string preview has another fighter.
   */
  enemyAt?: ((t: number) => { x: number; y: number } | null) | null;
}

/**
 * Tags the preview honours (spec 15 §5): the simulation, the scene canvas
 * (`ox`/`oy`, flips, shake) and sounds (`s`). The tag editor badges every other
 * tag "no preview"; scale (`x`, `y`), tints (`br`, `bt`), spawned animations
 * (`m`, `mx`, `my`) and the `n`/`q` collision marks are not drawn yet.
 */
export const PREVIEWED_TAGS = new Set([
  'x+',
  'x-',
  'y+',
  'y-',
  'x=',
  'y=',
  'ox',
  'oy',
  'r',
  'f',
  'd',
  'bl',
  'bb',
  'v',
  's',
]);

const tag = (f: Frame | undefined, k: string): number | null | undefined =>
  f ? tagValue(f, k) : undefined;
const has = (f: Frame | undefined, k: string): boolean => tag(f, k) !== undefined;
const num = (f: Frame | undefined, k: string): number => tag(f, k) ?? 0;

/**
 * Plays one decoded script. The constructor already runs tick 0 (the game's
 * first tick applies the frame at tick 0 without advancing); each step() is
 * one game tick. `state` is mutated in place, so callers copy it to publish it.
 */
export class Simulator {
  state: SimState;
  private total: number;
  private starts: number[];
  private slide = { vx: 0, vy: 0, timer: 0 };
  /** Reader tick before the last advance; null right after a (re)start. */
  private previous: number | null = null;
  /** While seeking to a tick position: advance tick by tick, ignoring hold and `d`. */
  private linear = false;

  constructor(
    private readonly script: Script,
    private readonly opts: SimOptions,
  ) {
    this.total = totalTicks(script);
    this.starts = script.frames.map((_, i) => tickPosAtFrame(script, i));
    this.state = this.initial();
    this.start();
  }

  private get startTick(): number {
    return this.opts.start ?? 0;
  }

  private initial(): SimState {
    const lead = Math.max(0, this.opts.lead ?? 0);
    const at0 = this.frameAt(this.startTick);
    return {
      tick: this.startTick - lead,
      // A script without a frame at tick 0 still shows its first frame, still.
      frameIndex: lead > 0 ? -1 : at0 >= 0 ? at0 : this.script.frames.length > 0 ? 0 : -1,
      x: 0,
      y: 0,
      flipX: false,
      flipY: false,
      shakeX: 0,
      shakeY: 0,
      elapsed: 0,
      finished: false,
      entered: lead === 0,
      preroll: lead > 0,
    };
  }

  /** openomf script_get_frame_at: first frame with start ≤ tick < start + duration, else -1. */
  private frameAt(tick: number): number {
    for (let i = 0; i < this.script.frames.length; i++) {
      const start = this.starts[i]!;
      if (start <= tick && tick < start + this.script.frames[i]!.duration) return i;
    }
    return -1;
  }

  get frame(): Frame | undefined {
    return this.script.frames[this.state.frameIndex];
  }

  /** Nothing to play: no frame covers the start tick (empty script, zero or negative total). */
  private get playable(): boolean {
    return this.total > 0 && this.frameAt(this.startTick) >= 0;
  }

  reset(): void {
    this.slide = { vx: 0, vy: 0, timer: 0 };
    this.state = this.initial();
    this.start();
  }

  /** The first game tick runs tick 0 without advancing (ANIM_PHASE_HOLD). */
  private start(): void {
    this.previous = null;
    if (this.playable && !this.state.preroll) this.apply();
  }

  /** player_run_apply for the frame at the reader's tick. */
  private apply(): void {
    const f = this.frame;
    if (!f) return;
    this.translate(f);
    this.state.entered = this.isEntry();
    if (this.state.entered) this.enter(f);
  }

  /** x+/x-/y+/y- move the object on every tick of the frame, including its first; so does a running slide. */
  private translate(f: Frame): void {
    const s = this.state;
    const dir = this.opts.direction;
    if (this.opts.enemyAt && has(f, 'e') && !has(f, 'am')) {
      const p = this.opts.enemyAt(s.tick);
      if (p) {
        s.x = p.x;
        s.y = p.y;
      }
    }
    let tx = 0;
    let ty = 0;
    if (has(f, 'y-')) ty = -num(f, 'y-');
    else if (has(f, 'y+')) ty = num(f, 'y+');
    if (has(f, 'x-')) tx = -num(f, 'x-') * dir;
    else if (has(f, 'x+')) tx = num(f, 'x+') * dir;
    s.x += tx;
    s.y += ty;

    if (this.slide.timer > 0) {
      s.x += this.slide.vx;
      s.y += this.slide.vy;
      this.slide.timer--;
    }
  }

  /** The reader moved into the current frame on this tick (or (re)started on it). */
  private isEntry(): boolean {
    const s = this.state;
    return (
      this.previous === null ||
      this.frameAt(this.previous) !== s.frameIndex ||
      // A held frame wrapping to its start is entered again.
      (this.opts.hold !== null && s.tick === this.starts[s.frameIndex])
    );
  }

  /** Effects that happen once, on the first tick of a frame. */
  private enter(f: Frame): void {
    const s = this.state;
    // player_clear_frame: flips belong to the frame that sets them.
    s.flipX = has(f, 'r');
    s.flipY = has(f, 'f');
    const bl = num(f, 'bl');
    const bb = num(f, 'bb');
    if (bl > 0) s.shakeX = bl * 4;
    if (bb > 0) s.shakeY = bb * 4;
    this.place(f, 'x');
    this.place(f, 'y');
  }

  /**
   * x= / y= place the object and slide it to the next frame's x= / y= value,
   * one step per tick until that frame starts. Only x follows the facing.
   */
  private place(f: Frame, axis: 'x' | 'y'): void {
    const key = `${axis}=`;
    if (!has(f, key)) return;
    const s = this.state;
    const dir = axis === 'x' ? this.opts.direction : 1;
    s[axis] = num(f, key) * dir;
    const next = this.nextFrameWith(key);
    if (next < 0) return;
    const ticks = this.starts[next]! - s.tick;
    const target = num(this.script.frames[next], key) * dir;
    if (target === s[axis]) return;
    if (axis === 'x') this.slide.vx = (target - s.x) / ticks;
    else this.slide.vy = (target - s.y) / ticks;
    this.slide.timer = ticks;
  }

  /** script_get_next_frame_with_tag_id: the first frame starting after the current tick. */
  private nextFrameWith(k: string): number {
    for (let i = 0; i < this.script.frames.length; i++) {
      if (this.starts[i]! > this.state.tick && has(this.script.frames[i], k)) return i;
    }
    return -1;
  }

  /** Advances one game tick. */
  step(): void {
    const s = this.state;
    if (!this.playable || s.finished) {
      s.entered = false;
      return;
    }
    // The game counts the shake down before drawing each tick.
    if (s.shakeX > 0) s.shakeX--;
    if (s.shakeY > 0) s.shakeY--;
    if (s.preroll) {
      s.elapsed++;
      s.tick++;
      if (s.tick < this.startTick) return;
      // The script starts: its first tick, as a (re)start runs it.
      s.preroll = false;
      s.frameIndex = this.frameAt(this.startTick);
      this.start();
      s.entered = true;
      return;
    }
    const next = this.nextReaderTick();
    s.elapsed++;
    const at = this.frameAt(next);
    if (at < 0) {
      if (this.opts.loop) return this.restartLoop();
      s.finished = true;
      s.entered = false;
      return;
    }
    this.previous = s.tick;
    s.tick = next;
    s.frameIndex = at;
    this.apply();
  }

  /** Where the reader goes after this tick: a held frame wraps, `d` jumps back, else +1. */
  private nextReaderTick(): number {
    const s = this.state;
    const cur = s.frameIndex;
    if (!this.linear && this.opts.hold !== null && this.opts.hold === cur) {
      const start = this.starts[cur]!;
      const len = Math.max(1, this.script.frames[cur]!.duration);
      return s.tick + 1 >= start + len ? start : s.tick + 1;
    }
    const f = this.frame;
    if (!this.linear && has(f, 'd')) {
      // `d` without a value reads 0: openomf re-enters at tick 1, forever.
      const d = num(f, 'd');
      return d >= 0 ? d + 1 : this.total + d;
    }
    return s.tick + 1;
  }

  /** Looping playback starts over; elapsed time and running shakes carry on. */
  private restartLoop(): void {
    const { elapsed, shakeX, shakeY } = this.state;
    this.slide = { vx: 0, vy: 0, timer: 0 };
    this.state = { ...this.initial(), elapsed, shakeX, shakeY };
    this.start();
  }

  /**
   * Restarts and advances straight to script tick `pos`, ignoring hold and `d`
   * loops (which could keep the reader from ever getting there), with the same
   * entry and translation state normal playback has on the way.
   */
  seekTo(pos: number): void {
    this.reset();
    // A position past the end means the last tick, not the end of playback.
    const target = Math.min(pos, Math.max(this.startTick, this.total - 1));
    this.linear = true;
    try {
      while (this.state.tick < target && !this.state.finished) {
        const before = this.state.tick;
        this.step();
        if (this.state.tick <= before) break; // looped back to the start
      }
    } finally {
      this.linear = false;
    }
  }

  /**
   * The state at each reader tick from the start to the end, played straight
   * through as seekTo reaches them (no hold, `d` or loop), at most `limit`.
   */
  statesByTick(limit = 20000): SimState[] {
    this.reset();
    const out: SimState[] = [{ ...this.state }];
    this.linear = true;
    try {
      while (out.length < limit && !this.state.finished) {
        const before = this.state.tick;
        this.step();
        if (this.state.finished || this.state.tick <= before) break;
        out.push({ ...this.state });
      }
    } finally {
      this.linear = false;
    }
    return out;
  }

  /** Simulates from the start to `ticks` elapsed ticks. */
  seek(ticks: number): void {
    this.reset();
    for (let i = 0; i < ticks && !this.state.finished; i++) this.step();
  }
}

/** Screen-shake offset for a shake counter (openomf game_state.c: sin(n) · 5 · n / 15). */
export function shakeOffset(amount: number, _elapsed?: number): number {
  return amount > 0 ? Math.trunc(Math.sin(amount) * 5 * (amount / 15)) : 0;
}
