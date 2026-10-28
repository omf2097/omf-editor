<script setup lang="ts">
import { computed } from 'vue';
import { ICONS, type IconName } from '../lib/icons';

const props = defineProps<{ name: IconName }>();
// Local, trusted SVG markup from bootstrap-icons.
const svg = computed(() => ICONS[props.name]);
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span class="omf-icon" aria-hidden="true" v-html="svg" />
</template>
