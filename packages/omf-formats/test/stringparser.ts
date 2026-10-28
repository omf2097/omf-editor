// Runs openomf's own animation string parser (build/stringparser) for parity tests.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DATA_DIR } from './data';

export const STRINGPARSER = resolve(
  process.env.OMF_STRINGPARSER ?? join(DATA_DIR, '..', 'stringparser'),
);
export const HAS_STRINGPARSER = existsSync(STRINGPARSER);

/** A frame as `[key + duration, [tag, value | null][]]`, the form both sides are compared in. */
export type ParsedFrame = [string, [string, number | null][]];

/** openomf's reading of `s`. `s` must not start with '-' (an option to the tool). */
export function openomfParse(s: string): ParsedFrame[] {
  const out = spawnSync(STRINGPARSER, ['--', s], { encoding: 'utf8' }).stdout;
  const frames: ParsedFrame[] = [];
  for (const line of out.split('\n')) {
    const m = /^\d+\. Frame -?\d+: '(.)(-?\d+)'$/.exec(line);
    if (m) {
      frames.push([m[1]! + m[2]!, []]);
      continue;
    }
    const cur = frames[frames.length - 1];
    if (cur && line.startsWith('   ')) {
      // "   %-4s %-4d desc" with a value, "   %-4s      desc" without.
      const name = line.slice(3, 7).trim();
      const hasValue = line[8] !== undefined && line[8] !== ' ';
      cur[1].push([name, hasValue ? parseInt(line.slice(8), 10) : null]);
    }
  }
  return frames;
}
