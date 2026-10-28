<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FlagInfo } from '@omf/formats';
import Icon from '../Icon.vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    flags: readonly FlagInfo[];
    title: string;
    code?: string;
    bits?: number;
    columns?: number;
    collapsible?: boolean;
    testid?: string;
  }>(),
  { code: '', bits: 16, columns: 2, collapsible: true, testid: undefined },
);
const emit = defineEmits<{ 'update:modelValue': [v: number] }>();
const open = ref(!props.collapsible);

const known = computed(() => props.flags.reduce((m, f) => m | f.bit, 0));
const unknownBits = computed(() => {
  const out: number[] = [];
  for (let b = 0; b < props.bits; b++) {
    const bit = 2 ** b;
    if (props.modelValue & bit && !(known.value & bit)) out.push(bit);
  }
  return out;
});
const hex = computed(
  () =>
    `0x${props.modelValue
      .toString(16)
      .toUpperCase()
      .padStart(props.bits / 4, '0')}`,
);

function toggle(bit: number): void {
  emit('update:modelValue', (props.modelValue ^ bit) >>> 0);
}
</script>

<template>
  <div class="mb-2" :data-testid="testid">
    <button
      v-if="collapsible"
      class="btn btn-link btn-sm p-0 text-reset text-decoration-none fw-semibold"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Icon :name="open ? 'chevronDown' : 'chevronRight'" /> {{ title }}
      <span class="mono text-secondary" :data-testid="testid ? `${testid}.hex` : undefined"
        >({{ hex }})</span
      >
    </button>
    <div v-else class="fw-semibold">
      {{ title }}
      <span class="mono text-secondary" :data-testid="testid ? `${testid}.hex` : undefined"
        >({{ hex }})</span
      >
    </div>
    <div
      v-if="open"
      class="mt-1"
      :style="{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: '0 1rem',
      }"
    >
      <label
        v-for="f in flags"
        :key="f.bit"
        class="form-check small mb-0"
        :title="`${f.desc} (0x${f.bit.toString(16)})`"
      >
        <input
          class="form-check-input"
          type="checkbox"
          :checked="(modelValue & f.bit) !== 0"
          :data-testid="testid ? `${testid}.${f.name}` : undefined"
          @change="toggle(f.bit)"
        />
        <span class="form-check-label mono">{{ f.name }}</span>
      </label>
    </div>
    <div
      v-if="open && unknownBits.length"
      class="small text-warning mt-1"
      :data-testid="testid ? `${testid}.unknown` : undefined"
    >
      Unknown bits set:
      <span v-for="b in unknownBits" :key="b" class="mono me-1"
        >0x{{ b.toString(16).toUpperCase()
        }}<button
          type="button"
          class="btn btn-link btn-sm p-0 ms-1 align-baseline text-warning"
          :aria-label="`Clear unknown bit 0x${b.toString(16).toUpperCase()}`"
          title="Clear this bit"
          :data-testid="testid ? `${testid}.unknown.clear.${b}` : undefined"
          @click="toggle(b)"
        >
          ×
        </button></span
      >
    </div>
    <div v-if="open && modelValue === 0" class="small text-secondary">none</div>
  </div>
</template>
