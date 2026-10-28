<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { cp437Length } from '@omf/formats';
import FieldCode from './FieldCode.vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    maxBytes?: number;
    label?: string;
    code?: string;
    testid?: string;
    width?: string;
  }>(),
  { maxBytes: undefined, label: '', code: '', testid: undefined, width: '100%' },
);
const emit = defineEmits<{ 'update:modelValue': [v: string] }>();
const text = ref(props.modelValue);
watch(
  () => props.modelValue,
  (v) => (text.value = v),
);
const bytes = computed(() => cp437Length(text.value));
/** openomf stops a string at NUL, so typed or pasted NULs are refused; loaded text stays as is. */
const hasNul = computed(() => text.value !== props.modelValue && text.value.includes('\0'));
const invalid = computed(
  () =>
    bytes.value < 0 ||
    hasNul.value ||
    (props.maxBytes !== undefined && bytes.value > props.maxBytes),
);
const reason = computed(() =>
  bytes.value < 0
    ? 'Contains characters the game cannot store (cp437 only)'
    : hasNul.value
      ? 'Contains a NUL character; the game ends the string there'
      : invalid.value
        ? `Longer than ${props.maxBytes} bytes`
        : '',
);
function commit(): void {
  if (!invalid.value && text.value !== props.modelValue) emit('update:modelValue', text.value);
}
</script>

<template>
  <label class="d-flex flex-column mb-1" :title="code" :style="{ width }">
    <span v-if="label" class="small">{{ label }} <FieldCode :name="code" /></span>
    <span class="d-flex align-items-center gap-1">
      <input
        v-model="text"
        class="form-control form-control-sm mono"
        :class="{ 'is-invalid': invalid }"
        :data-testid="testid"
        :title="reason || undefined"
        @blur="commit"
        @keydown.enter="commit"
      />
      <span
        class="field-code text-nowrap"
        :class="{ 'text-danger': invalid }"
        :data-testid="testid ? `${testid}.count` : undefined"
      >
        {{ bytes < 0 ? '!' : bytes
        }}<template v-if="maxBytes !== undefined">/{{ maxBytes }}</template>
      </span>
    </span>
    <span v-if="reason" class="small text-danger">{{ reason }}</span>
  </label>
</template>
