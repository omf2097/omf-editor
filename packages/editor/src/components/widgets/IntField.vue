<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { clamp } from '../../lib/util';
import FieldCode from './FieldCode.vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min: number;
    max: number;
    label?: string;
    /** File field name, shown muted and in the tooltip. */
    code?: string;
    suffix?: string;
    hint?: string;
    disabled?: boolean;
    hex?: boolean;
    testid?: string;
    /** Width of the whole field; by default the input fits the longest value of min…max. */
    width?: string;
    /** Accessible name when there is no visible label. */
    ariaLabel?: string;
  }>(),
  {
    label: '',
    code: '',
    suffix: '',
    hint: '',
    disabled: false,
    hex: false,
    testid: undefined,
    width: undefined,
    ariaLabel: undefined,
  },
);
const emit = defineEmits<{ 'update:modelValue': [v: number] }>();

const format = (v: number): string =>
  props.hex ? `${v < 0 ? '-' : ''}0x${Math.abs(v).toString(16).toUpperCase()}` : String(v);
const text = ref(format(props.modelValue));
const focused = ref(false);
watch(
  () => props.modelValue,
  (v) => {
    if (!focused.value || parse(text.value) !== v) text.value = format(v);
  },
);

function parse(s: string): number | null {
  const t = s.trim();
  let v: number;
  if (/^-?0x[0-9a-f]+$/i.test(t))
    v = (t.startsWith('-') ? -1 : 1) * parseInt(t.replace(/^-/, ''), 16);
  else if (/^[-+]?\d+$/.test(t)) v = parseInt(t, 10);
  else return null;
  return v >= props.min && v <= props.max ? v : null;
}

const invalid = computed(() => parse(text.value) === null);

function commit(): void {
  const v = parse(text.value);
  if (v === null) return;
  if (v !== props.modelValue) emit('update:modelValue', v);
  text.value = format(v);
}

function nudge(delta: number): void {
  const cur = parse(text.value) ?? props.modelValue;
  const v = clamp(cur + delta, props.min, props.max);
  text.value = format(v);
  if (v !== props.modelValue) emit('update:modelValue', v);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter') commit();
  else if (e.key === 'ArrowUp') {
    e.preventDefault();
    nudge(e.shiftKey ? 10 : 1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    nudge(e.shiftKey ? -10 : -1);
  } else if (e.key === 'Escape') {
    text.value = format(props.modelValue);
  }
}

function onWheel(e: WheelEvent): void {
  if (!focused.value) return;
  e.preventDefault();
  nudge((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 1));
}

/** Characters of the longest value in min…max; the font is monospace, so `ch` fits exactly. */
const chars = computed(() => Math.max(format(props.min).length, format(props.max).length));
const inputStyle = computed(() =>
  props.width ? undefined : { flex: '0 0 auto', width: `calc(${chars.value + 1}ch + 1rem + 2px)` },
);

const title = computed(() =>
  [props.code, `${props.min}…${props.max}`, props.hint].filter(Boolean).join(' · '),
);
</script>

<template>
  <label class="d-inline-flex flex-column me-2 mb-1 int-field-wrap" :title="title">
    <span v-if="label" class="small"> {{ label }} <FieldCode :name="code" /> </span>
    <span
      class="input-group input-group-sm flex-nowrap"
      :class="{ 'w-auto align-self-start': !width }"
      :style="width ? { width } : undefined"
    >
      <input
        v-model="text"
        class="form-control form-control-sm mono int-field"
        :class="{ 'is-invalid': invalid, 'int-field-fit': !width }"
        :style="inputStyle"
        inputmode="numeric"
        :disabled="disabled"
        :aria-invalid="invalid"
        :aria-label="ariaLabel"
        :data-testid="testid"
        @focus="focused = true"
        @blur="
          focused = false;
          commit();
        "
        @keydown="onKey"
        @wheel="onWheel"
      />
      <span v-if="suffix" class="input-group-text">{{ suffix }}</span>
    </span>
  </label>
</template>

<style scoped>
/* A field sized to its range has no room for Bootstrap's invalid icon; the red
   border and outline still mark it. */
.int-field-fit.is-invalid {
  padding-right: 0.5rem;
  background-image: none;
}
</style>
