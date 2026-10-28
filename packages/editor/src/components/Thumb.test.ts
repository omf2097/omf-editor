import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { newScene } from '../lib/templates';

const calls: { width: number; rgba: Uint8ClampedArray }[] = [];
vi.mock('../canvas/render', async (orig) => ({
  ...(await orig<typeof import('../canvas/render')>()),
  blit: (_c: HTMLCanvasElement, rgba: Uint8ClampedArray, width: number) =>
    calls.push({ width, rgba }),
}));

const { default: Thumb } = await import('./Thumb.vue');
const { useDocument } = await import('../composables/useDocument');
const { usePalette } = await import('../composables/usePalette');

afterEach(() => {
  calls.length = 0;
  usePalette().playerOffset.value = 0;
});

describe('Thumb', () => {
  it('draws once an empty image gets pixels (G10)', async () => {
    const d = ref({ width: 0, height: 0, pixels: new Uint16Array(0) });
    const w = mount(defineComponent({ setup: () => () => h(Thumb, { decoded: d.value }) }));
    await nextTick();
    d.value = { width: 2, height: 1, pixels: Uint16Array.from([1, 2]) };
    await nextTick();
    await nextTick();
    expect(w.find('canvas').exists()).toBe(true);
    expect(calls.map((c) => c.width)).toEqual([2]);
  });

  it('applies the player 2 shift to fighters only (G16)', async () => {
    const docs = useDocument();
    const scene = newScene();
    scene.palettes[0]!.colors.colors = Array.from({ length: 256 }, (_, k) => [k % 64, k >> 2, 0]);
    docs.newDocument(scene, 'Untitled.BK');
    usePalette().playerOffset.value = 48;
    const lut = usePalette().lut.value;
    // A HAR-band index whose player 2 colour differs.
    const i = 5;
    expect(lut[i]).not.toBe(lut[i + 48]);
    mount(Thumb, {
      props: { decoded: { width: 1, height: 1, pixels: Uint16Array.from([i]) }, shift: true },
    });
    await nextTick();
    const px = new Uint32Array(calls.at(-1)!.rgba.buffer)[0];
    expect(px).toBe(lut[i]);
  });
});
