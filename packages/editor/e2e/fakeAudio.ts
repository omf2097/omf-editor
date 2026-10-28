// A stand-in AudioContext for sound tests. Like Chrome it stays suspended until
// a real user gesture, and it logs what the app does with buffers and sources.

import type { Page } from '@playwright/test';

export interface AudioEvent {
  node: number;
  ev: 'start' | 'stop';
  /** Buffer length in samples: identifies the sound in the fixture bank. */
  len: number;
  bufferRate: number;
  playbackRate: number;
  gain: number;
  pan: number;
}

export interface AudioLog {
  events: AudioEvent[];
  buffers: number;
  contexts: number;
}

function install(): void {
  type Out = { out?: Out; gain?: { value: number }; pan?: { value: number } };
  const w = window as unknown as {
    __audio: AudioLog & { live: Set<{ onended: (() => void) | null }> };
    AudioContext: unknown;
  };
  w.__audio = { events: [], buffers: 0, contexts: 0, live: new Set() };
  const log = w.__audio;
  let nextNode = 0;
  // Transient user activation: one second after a trusted click or key press.
  // (Chromium counts page.evaluate as a gesture; this does not.)
  let activeUntil = 0;
  const activate = (e: Event): void => {
    if (e.isTrusted) activeUntil = performance.now() + 1000;
  };
  addEventListener('pointerdown', activate, true);
  addEventListener('keydown', activate, true);
  const isActive = (): boolean => performance.now() < activeUntil;
  Object.defineProperty(navigator, 'userActivation', {
    configurable: true,
    get: () => ({ isActive: isActive(), hasBeenActive: activeUntil > 0 }),
  });
  class Fake {
    state: 'suspended' | 'running' = 'suspended';
    destination = {};
    constructor() {
      log.contexts++;
    }
    resume(): Promise<void> {
      if (this.state === 'running') return Promise.resolve();
      return new Promise<void>((res) => {
        const go = (): void => {
          this.state = 'running';
          res();
        };
        if (isActive()) return go();
        const h = (e: Event): void => {
          if (!e.isTrusted) return;
          removeEventListener('pointerdown', h, true);
          removeEventListener('keydown', h, true);
          go();
        };
        addEventListener('pointerdown', h, true);
        addEventListener('keydown', h, true);
      });
    }
    createBuffer(_ch: number, length: number, sampleRate: number) {
      log.buffers++;
      const d = new Float32Array(length);
      return { length, sampleRate, getChannelData: () => d };
    }
    createGain() {
      return {
        gain: { value: 1 },
        connect(this: Out, x: Out) {
          this.out = x;
          return x;
        },
      };
    }
    createStereoPanner() {
      return {
        pan: { value: 0 },
        connect(this: Out, x: Out) {
          this.out = x;
          return x;
        },
      };
    }
    createBufferSource() {
      const node = nextNode++;
      const n = {
        buffer: null as null | { length: number; sampleRate: number },
        playbackRate: { value: 1 },
        onended: null as (() => void) | null,
        out: undefined as Out | undefined,
        connect(x: Out) {
          n.out = x;
          return x;
        },
        record(ev: 'start' | 'stop') {
          log.events.push({
            node,
            ev,
            len: n.buffer!.length,
            bufferRate: n.buffer!.sampleRate,
            playbackRate: n.playbackRate.value,
            gain: n.out?.gain?.value ?? NaN,
            pan: n.out?.out?.pan?.value ?? NaN,
          });
        },
        start() {
          log.live.add(n);
          n.record('start');
        },
        stop() {
          n.record('stop');
          log.live.delete(n);
          n.onended?.();
        },
      };
      return n;
    }
  }
  w.AudioContext = Fake;
}

export async function useFakeAudio(page: Page): Promise<void> {
  await page.addInitScript(install);
}

export function audioLog(page: Page): Promise<AudioLog> {
  return page.evaluate(() => {
    const a = (window as unknown as { __audio: AudioLog }).__audio;
    return { events: a.events, buffers: a.buffers, contexts: a.contexts };
  });
}

/** Lets every running fake source finish, as real ones do when the sample ends. */
export function endAllSounds(page: Page): Promise<void> {
  return page.evaluate(() => {
    const a = (window as unknown as { __audio: { live: Set<{ onended: (() => void) | null }> } })
      .__audio;
    for (const n of [...a.live]) {
      a.live.delete(n);
      n.onended?.();
    }
  });
}
