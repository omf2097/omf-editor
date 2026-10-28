import { describe, expect, it, vi } from 'vitest';
import { newFighter } from '../lib/templates';
import { serializeDocument } from '../lib/doc';

vi.mock('../lib/db', () => ({
  getSetting: async (_k: string, fallback: unknown) => fallback,
  setSetting: async () => undefined,
  getCachedFile: async () => undefined,
  setCachedFile: async () => undefined,
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({}),
}));

describe('per-document state resets on open (D8)', () => {
  it('remap preview and selected collision point are cleared', async () => {
    const { useDocument } = await import('./useDocument');
    const { usePalette } = await import('./usePalette');
    const { useSelection } = await import('./useSelection');
    const docs = useDocument();
    const palette = usePalette();
    const sel = useSelection();
    const bytes = serializeDocument(newFighter());
    docs.openBytes('A.AF', bytes);
    palette.remapIndex.value = 3;
    sel.selectHitCoord(2);
    docs.openBytes('B.AF', bytes);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(palette.remapIndex.value).toBeNull();
    expect(sel.hitCoordIndex.value).toBeNull();
  });
});
