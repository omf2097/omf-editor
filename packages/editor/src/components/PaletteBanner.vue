<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useDocument } from '../composables/useDocument';
import { usePalette } from '../composables/usePalette';

const docs = useDocument();
const palette = usePalette();
const route = useRoute();
const show = computed(
  () =>
    docs.kind.value === 'af' &&
    palette.isFallback.value &&
    !palette.forceGrayscale.value &&
    route.name !== 'start',
);
</script>

<template>
  <div
    v-if="show"
    class="alert alert-info rounded-0 border-0 border-bottom mb-0 py-2 px-3"
    data-testid="palette-banner"
  >
    Sprites are shown in greyscale.
    <button
      class="btn btn-link btn-sm p-0 align-baseline"
      data-testid="palette-banner.choose"
      @click="palette.loadSource()"
    >
      Choose an arena BK
    </button>
    for colours, or see <RouterLink :to="{ name: 'palettes' }">Palettes</RouterLink>.
  </div>
</template>
