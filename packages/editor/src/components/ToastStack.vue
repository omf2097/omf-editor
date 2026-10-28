<script setup lang="ts">
import { useToasts } from '../composables/useToasts';
const { toasts, dismiss } = useToasts();
</script>

<template>
  <div class="toast-stack" aria-live="polite">
    <div
      v-for="t in toasts"
      :key="t.id"
      class="toast show align-items-center border-0"
      :class="
        t.kind === 'error'
          ? 'text-bg-danger'
          : t.kind === 'success'
            ? 'text-bg-success'
            : 'text-bg-secondary'
      "
      role="status"
      :data-testid="`toast.${t.kind}`"
    >
      <div class="d-flex">
        <div class="toast-body">{{ t.message }}</div>
        <button
          type="button"
          class="btn-close btn-close-white me-2 m-auto"
          aria-label="Dismiss"
          @click="dismiss(t.id)"
        />
      </div>
    </div>
  </div>
</template>
