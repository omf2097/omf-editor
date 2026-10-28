import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const DATA_DIR = resolve(
  process.env.OMF_DATA_DIR ?? join(import.meta.dirname, '../../../../openomf/build/resources'),
);
export const HAS_DATA = existsSync(DATA_DIR);

// The game-data CI job sets OMF_REQUIRE_DATA so a wrong path fails instead of
// quietly skipping every game-data test.
if (process.env.OMF_REQUIRE_DATA && !readdirSafe(DATA_DIR).some((f) => /\.(af|bk)$/i.test(f)))
  throw new Error(`OMF_REQUIRE_DATA is set but ${DATA_DIR} has no AF or BK files`);

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export function dataFiles(ext: string): string[] {
  if (!HAS_DATA) return [];
  return readdirSync(DATA_DIR)
    .filter((f) => f.toUpperCase().endsWith(`.${ext}`))
    .sort();
}

export function readData(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(DATA_DIR, name)));
}

export function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', name)));
}
