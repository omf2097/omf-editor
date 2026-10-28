<script setup lang="ts">
// The file field name next to a readable label, shown only when the display
// setting "Show file field names" is on. The label (or its control) carries
// the name in its tooltip either way.
import { useDisplay } from '../../composables/useDisplay';

defineProps<{ name: string }>();
const { showFieldCodes } = useDisplay();
</script>

<template>
  <span v-if="showFieldCodes && name" class="field-code">{{ name }}</span>
</template>
