<script setup lang="ts">
import IntField from './IntField.vue';
import FieldCode from './FieldCode.vue';
import Icon from '../Icon.vue';

defineProps<{
  modelValue: number;
  label: string;
  code: string;
  /** Name of the target, or null when it does not exist. */
  resolved: string | null;
  testid?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [v: number]; go: [] }>();
</script>

<template>
  <!-- The label sits above one row of field, go-to button and target name, so
       the button and name stay next to the field however long the label is. -->
  <div class="d-inline-flex flex-column me-3 mb-1 linked-id" :title="code">
    <span class="small">{{ label }} <FieldCode :name="code" /></span>
    <span
      class="d-flex align-items-center gap-1"
      :data-testid="testid ? `${testid}.row` : undefined"
    >
      <IntField
        :model-value="modelValue"
        :min="0"
        :max="255"
        :code="code"
        :aria-label="label"
        :testid="testid"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="resolved === null"
        :aria-label="`Go to ${resolved ?? modelValue}`"
        :data-testid="testid ? `${testid}.go` : undefined"
        @click="emit('go')"
      >
        <Icon name="goto" />
      </button>
      <span
        class="small text-nowrap"
        :class="resolved === null && modelValue !== 0 ? 'text-warning' : 'text-secondary'"
        :data-testid="testid ? `${testid}.name` : undefined"
      >
        {{ resolved ?? (modelValue === 0 ? '–' : 'missing') }}
      </span>
    </span>
  </div>
</template>

<style scoped>
/* The field's own wrapper margins would push the button away. */
.linked-id :deep(.int-field-wrap) {
  margin: 0 !important;
}
</style>
