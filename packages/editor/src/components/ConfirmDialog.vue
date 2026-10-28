<script setup lang="ts">
import { ref } from 'vue';
import { useConfirm } from '../composables/useConfirm';
import { useModal } from '../composables/useModal';

const { current } = useConfirm();
const panel = ref<HTMLElement | null>(null);

useModal({
  open: () => !!current.value,
  panel,
  close: () => current.value?.resolve('cancel'),
  initialFocus: () => panel.value?.querySelector<HTMLButtonElement>('.btn-primary, .btn-danger'),
});
</script>

<template>
  <Teleport to="body">
    <div v-if="current" class="modal-backdrop-omf" @click.self="current.resolve('cancel')">
      <div
        ref="panel"
        class="modal-panel p-3"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="current.title"
        data-testid="confirm"
      >
        <h5 class="mb-2">{{ current.title }}</h5>
        <p class="mb-2" style="white-space: pre-line">{{ current.message }}</p>
        <ul v-if="current.details?.length" class="small mb-2" data-testid="confirm.details">
          <li v-for="(d, i) in current.details" :key="i">{{ d }}</li>
        </ul>
        <div class="d-flex justify-content-end gap-2 mt-3">
          <button
            v-for="c in current.choices"
            :key="c.id"
            class="btn btn-sm"
            :class="`btn-${c.variant ?? 'secondary'}`"
            :data-testid="`confirm.${c.id}`"
            @click="current.resolve(c.id)"
          >
            {{ c.label }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
