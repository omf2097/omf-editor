import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  afFromJSON,
  afToJSON,
  bkFromJSON,
  bkToJSON,
  JsonPathError,
  jsonWarnings,
  readAF,
  readBK,
  writeAF,
  writeBK,
} from '../src';
import { HAS_DATA, dataFiles, readData, readFixture } from './data';
import { af, bk, bkAnim, move, sprite } from './helpers';

const PARITY_DIR = process.env.OMF_PYOMFTOOLS_JSON_DIR;
const HAS_PARITY = !!PARITY_DIR && existsSync(PARITY_DIR);

describe('JSON', () => {
  it('AF round trip through JSON text is byte-exact (except move string padding)', () => {
    const file = af([
      [11, move({ hitCoords: [{ x: -5, y: 3, spriteId: 0, null: 0 }], extraStrings: ['A1'] })],
      [12, move({ sprites: [sprite({ missing: true, image: new Uint8Array(0) })] })],
    ]);
    const j = JSON.parse(JSON.stringify(afToJSON(file)));
    expect(j.moves['12'].sprites[0].image).toEqual(
      Array.from(file.moves.get(11)!.sprites[0]!.image),
    );
    expect(writeAF(afFromJSON(j))).toEqual(writeAF(file));
  });

  it('BK round trip through JSON is byte-exact, palettes included', () => {
    const bytes = readFixture('test.bk');
    const j = JSON.parse(JSON.stringify(bkToJSON(readBK(bytes))));
    expect(writeBK(bkFromJSON(j))).toEqual(bytes);
    const file = bk([[6, bkAnim({ footerString: 'x' })]]);
    file.palettes[0]!.colors.colors[7] = [1, 22, 63];
    const j2 = bkToJSON(file);
    expect(j2.palettes[0]!.colors.data[7]).toEqual([4, 89, 255]);
    expect(writeBK(bkFromJSON(j2))).toEqual(writeBK(file));
  });

  it('reports errors with a JSON path', () => {
    const j = afToJSON(af());
    j.moves['11']!.sprites[0]!.pos_x = 40000;
    expect(() => afFromJSON(j)).toThrow(JsonPathError);
    expect(() => afFromJSON(j)).toThrow('moves.11.sprites[0].pos_x');
    const b = bkToJSON(bk());
    b.background_image.pop();
    expect(() => bkFromJSON(b)).toThrow('background_image');
    expect(() => afFromJSON({ ...afToJSON(af()), moves: { 70: {} } })).toThrow('moves.70');
  });

  it('warns about values pyomftools rejects', () => {
    const file = af([[11, move({ hitCoords: [{ x: -512, y: 0, spriteId: 0, null: 1 }] })]]);
    expect(jsonWarnings(file).map((w) => w.message)).toHaveLength(2);
  });
});

describe.skipIf(!HAS_DATA)('JSON round trip on shipped data', () => {
  for (const name of [...dataFiles('AF'), ...dataFiles('BK')]) {
    it(name, () => {
      const bytes = readData(name);
      if (name.toUpperCase().endsWith('.AF')) {
        const file = readAF(bytes);
        const back = afFromJSON(JSON.parse(JSON.stringify(afToJSON(file))));
        // JSON drops move string padding, as pyomftools does.
        for (const m of file.moves.values()) delete m.moveStringRaw;
        expect(writeAF(back)).toEqual(writeAF(file));
      } else {
        expect(writeBK(bkFromJSON(JSON.parse(JSON.stringify(bkToJSON(readBK(bytes))))))).toEqual(
          bytes,
        );
      }
    });
  }
});

describe.skipIf(!HAS_DATA || !HAS_PARITY)('parity with pyomftools JSON', () => {
  for (const name of [...dataFiles('AF'), ...dataFiles('BK')]) {
    const jsonPath = join(PARITY_DIR ?? '', `${name}.json`);
    it.skipIf(!existsSync(jsonPath))(name, () => {
      const expected = JSON.parse(readFileSync(jsonPath, 'utf8'));
      const bytes = readData(name);
      const ours = name.toUpperCase().endsWith('.AF')
        ? afToJSON(readAF(bytes))
        : bkToJSON(readBK(bytes));
      expect(JSON.parse(JSON.stringify(ours))).toEqual(expected);
    });
  }
});
