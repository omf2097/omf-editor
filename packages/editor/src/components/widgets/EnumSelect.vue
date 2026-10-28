<script setup lang="ts">
import { computed } from 'vue';
import type { EnumInfo } from '@omf/formats';
import { inputValue } from '../../lib/util';
import FieldCode from './FieldCode.vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    options: readonly EnumInfo[];
    label?: string;
    code?: string;
    testid?: string;
  }>(),
  { label: '', code: '', testid: undefined },
);
const emit = defineEmits<{ 'update:modelValue': [v: number] }>();
const unknown = computed(() => !props.options.some((o) => o.value === props.modelValue));
</script>

<template>
  <label class="d-inline-flex flex-column me-2 mb-1" :title="code">
    <span v-if="label" class="small">{{ label }} <FieldCode :name="code" /></span>
    <select
      class="form-select form-select-sm"
      style="width: auto"
      :value="modelValue"
      :data-testid="testid"
      @change="emit('update:modelValue', Number(inputValue($event)))"
    >
      <option v-if="unknown" :value="modelValue">Unknown ({{ modelValue }})</option>
      <option v-for="o in options" :key="o.value" :value="o.value" :title="o.desc">
        {{ o.value }} {{ o.name }}
      </option>
    </select>
  </label>
</template>
