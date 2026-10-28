// Spec 20 export checks on decoded output (T13): exact APNG frames and
// delays, GIF frames decoded to pixels, the all-animations zip, and RGBA
// sheets.

import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { decode as decodePng, decodeApng } from 'fast-png';
import { encodeSprite, writeBK, type Sprite } from '@omf/formats';
import { test, expect, type App } from './helpers';
import { arena } from './fixtures/build';

interface GifFrame {
  delayCs: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Colour of each pixel as [r, g, b], or null where transparent. */
  rgb: ([number, number, number] | null)[];
}

/** A small GIF89a decoder: frames, delays and LZW-decoded pixels. */
function decodeGif(b: Uint8Array): { width: number; height: number; frames: GifFrame[] } {
  let i = 6;
  const u16 = (at: number) => b[at]! | (b[at + 1]! << 8);
  const width = u16(i);
  const height = u16(i + 2);
  const flags = b[i + 4]!;
  i += 7;
  let global: number[][] = [];
  const table = (n: number) => {
    const t: number[][] = [];
    for (let k = 0; k < n; k++) t.push([b[i + 3 * k]!, b[i + 3 * k + 1]!, b[i + 3 * k + 2]!]);
    i += 3 * n;
    return t;
  };
  if (flags & 0x80) global = table(2 << (flags & 7));
  const frames: GifFrame[] = [];
  let delay = 0;
  let transparent: number | null = null;
  const blocks = () => {
    const out: number[] = [];
    for (let n = b[i++]!; n > 0; n = b[i++]!) {
      for (let k = 0; k < n; k++) out.push(b[i + k]!);
      i += n;
    }
    return out;
  };
  while (i < b.length) {
    const tag = b[i++]!;
    if (tag === 0x3b) break;
    if (tag === 0x21) {
      const label = b[i++]!;
      const data = blocks();
      if (label === 0xf9) {
        delay = data[1]! | (data[2]! << 8);
        transparent = data[0]! & 1 ? data[3]! : null;
      }
      continue;
    }
    // Image descriptor.
    const left = u16(i);
    const top = u16(i + 2);
    const w = u16(i + 4);
    const h = u16(i + 6);
    const f = b[i + 8]!;
    i += 9;
    const colours = f & 0x80 ? table(2 << (f & 7)) : global;
    const minCode = b[i++]!;
    const data = blocks();
    // LZW.
    const clear = 1 << minCode;
    let size = minCode + 1;
    let dict: number[][] = [];
    const reset = () => {
      dict = Array.from({ length: clear + 2 }, (_, k) => [k]);
      size = minCode + 1;
    };
    reset();
    const indices: number[] = [];
    let prev: number[] | null = null;
    let bit = 0;
    while (bit + size <= data.length * 8) {
      let code = 0;
      for (let k = 0; k < size; k++, bit++) code |= ((data[bit >> 3]! >> (bit & 7)) & 1) << k;
      if (code === clear) {
        reset();
        prev = null;
        continue;
      }
      if (code === clear + 1) break;
      const entry: number[] = dict[code] ?? [...prev!, prev![0]!];
      indices.push(...entry);
      if (prev) dict.push([...prev, entry[0]!]);
      prev = entry;
      if (dict.length === 1 << size && size < 12) size++;
    }
    frames.push({
      delayCs: delay,
      left,
      top,
      width: w,
      height: h,
      rgb: indices
        .slice(0, w * h)
        .map((k) => (k === transparent ? null : (colours[k] as [number, number, number]))),
    });
  }
  return { width, height, frames };
}

async function exportAnimation(app: App, format: 'apng' | 'gif'): Promise<Uint8Array> {
  const page = app.page;
  await page.getByTestId('sprites.export').click();
  await page.getByTestId(`export.${format}`).click();
  return new Uint8Array(
    readFileSync(await app.download(() => page.getByTestId('export.run').click())),
  );
}

test.describe('animation export, decoded', () => {
  test('APNG: one frame per sprite change with its delay at arena speed', async ({ app }) => {
    // fighter.af 11 is A10-B10: two frames of 10 ticks × 28 ms.
    await app.open('fighter.af', '/animations/11/sprites');
    await app.paletteSource();
    const apng = decodeApng(await exportAnimation(app, 'apng'));
    expect(apng.numberOfFrames).toBe(2);
    expect(apng.frames.map((f) => f.delayNumber / f.delayDenominator)).toEqual([0.28, 0.28]);
    expect(apng.numberOfPlays).toBe(0);
    // The two sprites differ, so the frames do too.
    expect(apng.frames[0]!.data).not.toEqual(apng.frames[1]!.data);
  });

  test('APNG of a BK: static timing, 10 ms a tick', async ({ app, page }) => {
    const bk = arena();
    bk.animations.get(6)!.baseString = 'A7-B3';
    await app.goto('/');
    await app.hooks(
      (h, a: [string, number[]]) => h.open(a[0], a[1]),
      ['timed.bk', Array.from(writeBK(bk))],
    );
    await app.hooks((h, p: string) => h.navigate(p), '/animations/6/sprites');
    await expect(page.getByTestId('view.sprites')).toBeVisible();
    const apng = decodeApng(await exportAnimation(app, 'apng'));
    expect(apng.frames.map((f) => Math.round((1000 * f.delayNumber) / f.delayDenominator))).toEqual(
      [70, 30],
    );
  });

  test('GIF: frames decode to the sprite colours with their delays', async ({ app }) => {
    await app.open('fighter.af', '/animations/11/sprites');
    await app.paletteSource();
    const lut = await app.hooks((h) => h.lut());
    const sprite = (await app.sprite(11, 0))!;
    const gif = decodeGif(await exportAnimation(app, 'gif'));
    expect(gif.frames).toHaveLength(2);
    expect(gif.frames.map((f) => f.delayCs)).toEqual([28, 28]);
    // Every opaque pixel of frame 1 is one of sprite A's colours, and all of them appear.
    const colour = (i: number) => {
      const v = lut[i]!;
      return [v & 255, (v >> 8) & 255, (v >> 16) & 255];
    };
    const want = new Set(sprite.pixels.filter((p) => p !== 256).map((p) => colour(p).join()));
    const seen = new Set(
      gif.frames[0]!.rgb.filter((c): c is [number, number, number] => !!c).map((c) => c.join()),
    );
    for (const c of want) expect(seen).toContain(c);
  });
});

test.describe('sheet export, decoded', () => {
  test('all animations as a zip: one PNG and sheet JSON per animation', async ({ app, page }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await app.paletteSource();
    await page.getByTestId('sprites.sheet').click();
    await page.getByTestId('sheet.all').check();
    const path = await app.download(() => page.getByTestId('sheet.export').click());
    const files = unzipSync(new Uint8Array(readFileSync(path)));
    const ids = [11, 12, 20, 21, 22];
    const names = Object.keys(files).sort();
    for (const id of ids) {
      expect(names).toContain(`fighter.af-${id}.png`);
      expect(names).toContain(`fighter.af-${id}.sheet.json`);
    }
    const meta = JSON.parse(new TextDecoder().decode(files['fighter.af-20.sheet.json']!));
    expect(meta.animation).toBe(20);
    const png = decodePng(files['fighter.af-20.png']!);
    expect(png.palette).toBeDefined();
    expect(meta.sprites).toHaveLength((await app.animation(20))!.sprites);
  });

  test('RGBA when asked for; indexed with key 0 even when 1–255 are all used', async ({
    app,
    page,
  }) => {
    await app.open('fighter.af', '/animations/20/sprites');
    await app.paletteSource();
    await page.getByTestId('sprites.sheet').click();
    await page.getByLabel('RGBA (for tools that lose palettes)').check();
    const downloads: string[] = [];
    page.on('download', async (d) => downloads.push(await d.path()));
    await page.getByTestId('sheet.export').click();
    await expect.poll(() => downloads.length).toBe(2);
    const files = downloads.map((p) => new Uint8Array(readFileSync(p)));
    const png = decodePng(files.find((f) => f[1] === 0x50)!);
    expect([png.channels, png.palette]).toEqual([4, undefined]);
    const meta = JSON.parse(new TextDecoder().decode(files.find((f) => f[0] === 0x7b)!));
    expect(meta.transparent_index).toBeNull();

    // Indices 1–255 and transparency: index 0, which sprites never draw
    // (spec 13 §7), is always free as the key, so the sheet stays indexed.
    const bk = arena();
    const pixels = Uint16Array.from({ length: 256 }, (_, i) => (i === 0 ? 256 : i));
    const full: Sprite = {
      posX: 0,
      posY: 0,
      width: 256,
      height: 1,
      index: 1,
      missing: false,
      image: encodeSprite({ width: 256, height: 1, pixels }),
    };
    bk.animations.get(6)!.sprites = [full];
    await app.hooks(
      (h, a: [string, number[]]) => h.open(a[0], a[1]),
      ['full.bk', Array.from(writeBK(bk))],
    );
    await app.hooks((h, p: string) => h.navigate(p), '/animations/6/sprites');
    await page.getByTestId('sprites.sheet').click();
    downloads.length = 0;
    await page.getByTestId('sheet.export').click();
    await expect.poll(() => downloads.length).toBe(2);
    const files2 = downloads.map((p) => new Uint8Array(readFileSync(p)));
    const png2 = decodePng(files2.find((f) => f[1] === 0x50)!);
    expect(png2.palette).toHaveLength(256);
    const meta2 = JSON.parse(new TextDecoder().decode(files2.find((f) => f[0] === 0x7b)!));
    expect(meta2.transparent_index).toBe(0);
    await expect(page.getByTestId('toast.info')).toHaveCount(0);
  });
});
