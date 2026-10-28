import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, expect } from './helpers';

const DIR = resolve(
  process.env.OMF_DATA_DIR ?? join(import.meta.dirname, '../../../../openomf/build/resources'),
);
const files = existsSync(DIR)
  ? readdirSync(DIR)
      .filter((f) => /\.(af|bk)$/i.test(f))
      .sort()
  : [];
// Without game data the project has no tests; the game-data CI job sets
// OMF_REQUIRE_DATA so a wrong path fails instead.
if (process.env.OMF_REQUIRE_DATA && files.length === 0)
  throw new Error(`OMF_REQUIRE_DATA is set but ${DIR} has no AF or BK files`);

test.describe('shipped game data', () => {
  for (const name of files) {
    test(`${name}: open and save is byte-exact`, async ({ app }) => {
      const bytes = new Uint8Array(readFileSync(join(DIR, name)));
      await app.goto('/');
      await app.hooks((h, a: [string, number[]]) => h.open(a[0], a[1]), [name, Array.from(bytes)]);
      await app.hooks((h, path: string) => h.navigate(path), '/file');
      const { bytes: saved } = await app.saveDownload();
      expect(saved).toEqual(bytes);
    });
  }
});
