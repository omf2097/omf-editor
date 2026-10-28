import { computed, watch, type Ref } from 'vue';
import { spriteIndexOfFrame, type BKFile } from '@omf/formats';
import { isAF, type AnyAnimation } from '../lib/doc';
import { animationOrigin } from '../lib/scene';
import { blit, compositeFrame, playerShift, type DrawSprite } from '../canvas/render';
import {
  backgroundBehind,
  dimTransparent,
  drawOverlay,
  onionNeighbour,
} from '../canvas/pixelCanvas';
import type { Img } from '../lib/pixels';
import { useDocument } from './useDocument';
import { usePalette } from './usePalette';
import { usePlayback } from './usePlayback';
import { usePixelEditor } from './usePixelEditor';
import { useSharedImages } from './useSharedImages';

export interface PixelRenderSources {
  main: Ref<HTMLCanvasElement | null>;
  overlay: Ref<HTMLCanvasElement | null>;
  animation: () => AnyAnimation | null;
  /** Index of the sprite being edited. */
  index: () => number;
  /** The working image. */
  img: () => Img;
  /** Drag preview shown instead of the working image. */
  preview: () => { img: Img } | null;
  hoverPx: () => { x: number; y: number } | null;
}

/**
 * Draws the pixel editor canvases whenever what they show changes: the
 * image (with onion skins and the arena behind it) on `main`, grid, origin,
 * selection and brush on `overlay`. The caller renders once on mount.
 */
export function usePixelRender(src: PixelRenderSources) {
  const docs = useDocument();
  const palette = usePalette();
  const pb = usePlayback();
  const pe = usePixelEditor();
  const shared = useSharedImages();

  /** Palette shift of the player-2 preview; AF only. */
  const shift = computed(() =>
    docs.kind.value === 'af' ? playerShift(palette.playerOffset.value) : (p: number) => p,
  );
  /** BK whose arena backs the sprite: the palette source for an AF, the file itself for a BK. */
  const bgBk = computed<BKFile | null>(() => {
    const d = docs.doc.value;
    if (!d) return null;
    return isAF(d) ? palette.sourceBk.value : d;
  });

  /** Neighbouring sprites drawn at 30 % for the enabled onion skins, placed relative to this one. */
  function onionSprites(a: AnyAnimation): DrawSprite[] {
    const index = src.index();
    const order = pb.script.value.frames.map(spriteIndexOfFrame);
    const out: DrawSprite[] = [];
    for (const [on, delta] of [
      [pe.onionPrev.value, -1],
      [pe.onionNext.value, 1],
    ] as const) {
      if (!on) continue;
      const k = onionNeighbour(order, index, delta, a.sprites.length);
      const s = k === null || k === index ? null : a.sprites[k];
      if (!s) continue;
      out.push({
        decoded: shared.decoded(s),
        x: s.posX - pe.posX.value,
        y: s.posY - pe.posY.value,
        alpha: 0.3,
        shift: shift.value,
      });
    }
    return out;
  }

  function render(): void {
    const c = src.main.value;
    const a = src.animation();
    if (!c || !a) return;
    const d = src.preview()?.img ?? src.img();
    const W = d.width;
    const H = d.height;
    const sprites = [...onionSprites(a), { decoded: d, x: 0, y: 0, shift: shift.value }];
    const bk = bgBk.value;
    let background: Uint8Array | null = null;
    if (pe.arenaBg.value && bk) {
      // The sprite's top-left in scene space is the origin plus pos.
      const origin = animationOrigin(docs.kind.value ?? 'af', a);
      background = backgroundBehind(bk, origin.x + pe.posX.value, origin.y + pe.posY.value, W, H);
    }
    const rgba = compositeFrame(
      { width: W, height: H, background, backgroundWidth: W, sprites },
      palette.lut.value,
    );
    if (background) dimTransparent(rgba, d);
    blit(c, rgba, W, H);
    renderOverlay();
  }

  function renderOverlay(): void {
    const o = src.overlay.value;
    if (!o) return;
    const d = src.img();
    const h = src.hoverPx();
    const brushTool = pe.tool.value === 'pencil' || pe.tool.value === 'eraser';
    drawOverlay(o, {
      zoom: pe.zoom.value,
      width: d.width,
      height: d.height,
      grid: pe.grid.value,
      origin: { x: -pe.posX.value, y: -pe.posY.value },
      selection: pe.selection.value,
      brush: h && brushTool ? { x: h.x, y: h.y, size: pe.brush.value } : null,
    });
  }

  watch(
    [
      src.img,
      src.preview,
      () => palette.lut.value,
      pe.onionPrev,
      pe.onionNext,
      pe.arenaBg,
      pe.zoom,
      pe.grid,
      pe.selection,
      src.hoverPx,
      pe.posX,
      pe.posY,
      shift,
    ],
    render,
  );

  return { render };
}
