<script setup lang="ts">
import { computed } from 'vue';
import { useDocument } from '../composables/useDocument';
import { usePalette } from '../composables/usePalette';
import { useViewport } from '../composables/useViewport';
import { docTitle } from '../lib/doc';

const docs = useDocument();
const palette = usePalette();
const viewport = useViewport();

const paletteSummary = computed(() => {
  if (palette.isFallback.value) return 'Greyscale';
  const name = docs.kind.value === 'bk' ? 'this file' : palette.sourceName.value;
  const remap = palette.remapIndex.value === null ? '' : ` remap ${palette.remapIndex.value}`;
  return `${name} pal ${palette.paletteIndex.value}${remap}`;
});
</script>

<template>
  <footer class="statusbar" data-testid="statusbar">
    <template v-if="docs.doc.value">
      <span>{{ docTitle(docs.doc.value) }}</span>
      <span class="mono">{{ docs.fileName.value }}</span>
      <span v-if="docs.byteSize.value !== null" data-testid="status.size"
        >{{ docs.byteSize.value.toLocaleString() }} B</span
      >
      <span
        v-else
        class="text-danger"
        data-testid="status.size"
        title="The file cannot be written as it is; Save shows why"
        >Size: error</span
      >
      <span v-if="docs.dirty.value" class="text-warning" data-testid="status.modified"
        >Modified</span
      >
      <RouterLink :to="{ name: 'palettes' }" class="text-reset"
        >Palette: {{ paletteSummary }}</RouterLink
      >
    </template>
    <span v-else class="text-secondary">No file open. Files never leave your browser.</span>
    <span v-if="viewport.hover.value" class="ms-auto mono" data-testid="status.hover">
      x {{ viewport.hover.value.x }} y {{ viewport.hover.value.y }}
      <template v-if="viewport.hover.value.index !== null">
        · idx {{ viewport.hover.value.index }}</template
      >
    </span>
  </footer>
</template>
