<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import FieldCode from './FieldCode.vue';

const props = withDefaults(
  defineProps<{
    /** Raw fixed-point integer. */
    modelValue: number;
    min: number;
    max: number;
    scale?: number;
    label?: string;
    code?: string;
    testid?: string;
  }>(),
  { scale: 256, label: '', code: '', testid: undefined },
);
const emit = defineEmits<{ 'update:modelValue': [v: number] }>();

const fmt = (raw: number): string => String(Math.round((raw / props.scale) * 1000) / 1000);
const text = ref(fmt(props.modelValue));
watch(
  () => props.modelValue,
  (v) => {
    if (parse(text.value) !== v) text.value = fmt(v);
  },
);

function parse(s: string): number | null {
  const t = s.trim().replace(',', '.').replace('−', '-');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  // Round, not truncate: the field shows 3 decimals, so trunc would turn a
  // shown value back into raw - 1 (294 → 1.148 → 293).
  const raw = Math.round(Number(t) * props.scale);
  return raw >= props.min && raw <= props.max ? raw : null;
}
/** Characters of the longest value in min…max as shown (3 decimals); the font is monospace. */
const chars = computed(() =>
  Math.max(
    ...[props.min, props.max].map((raw) => String(Math.trunc(raw / props.scale)).length + 4),
  ),
);
const invalid = computed(() => parse(text.value) === null);
function commit(): void {
  const v = parse(text.value);
  if (v === null) return;
  if (v !== props.modelValue) emit('update:modelValue', v);
  text.value = fmt(v);
}
</script>

<template>
  <label class="d-inline-flex flex-column me-2 mb-1" :title="`${code} · raw = value × ${scale}`">
    <span class="small">{{ label }} <FieldCode :name="code" /></span>
    <span class="input-group input-group-sm flex-nowrap w-auto align-self-start">
      <input
        v-model="text"
        class="form-control form-control-sm mono fixed-field"
        :class="{ 'is-invalid': invalid }"
        :style="{ flex: '0 0 auto', width: `calc(${chars + 1}ch + 1rem + 2px)` }"
        inputmode="decimal"
        :data-testid="testid"
        @blur="commit"
        @keydown.enter="commit"
      />
      <span
        class="input-group-text mono text-body-secondary"
        title="Raw value in the file"
        :data-testid="testid ? `${testid}.raw` : undefined"
        >{{ modelValue }}</span
      >
    </span>
  </label>
</template>

<style scoped>
/* Sized to the range: no room for Bootstrap's invalid icon (the border marks it). */
.fixed-field.is-invalid {
  padding-right: 0.5rem;
  background-image: none;
}
</style>
