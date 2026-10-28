<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import IntField from './widgets/IntField.vue';
import { useDocument } from '../composables/useDocument';
import { useModal } from '../composables/useModal';
import { animationsOf, isAF, maxAnimations } from '../lib/doc';
import { newMove, newSceneAnimation } from '../lib/templates';
import { freeImageIndex } from '../lib/spriteEdit';

// Animation sidebar: adds an animation (AF move or BK animation) with a free
// id, then opens it. Shown while mounted; emits close when done.

const props = defineProps<{ initialId: number }>();
const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const docs = useDocument();
const id = ref(props.initialId);
const panel = ref<HTMLElement | null>(null);
useModal({ open: () => true, panel, close: () => emit('close') });

const kind = computed(() => docs.kind.value ?? 'af');
const addError = computed(() => {
  if (!docs.doc.value) return '';
  if (id.value >= maxAnimations(kind.value)) return `Ids go up to ${maxAnimations(kind.value) - 1}`;
  return animationsOf(docs.doc.value).has(id.value) ? `${id.value} is already used` : '';
});

/** Enter in the dialog adds, except on a button, which runs its own action. */
function onAddEnter(e: KeyboardEvent): void {
  if (e.target instanceof HTMLButtonElement) return;
  // Otherwise the Enter would also click the button focus returns to.
  e.preventDefault();
  confirmAdd();
}

function confirmAdd(): void {
  if (addError.value) return;
  const newId = id.value;
  emit('close');
  docs.mutate(`add animation ${newId}`, (d) => {
    // An unused image index, so no sprite that shares images by index resolves to the new one.
    const index = freeImageIndex(d);
    // Animations are kept in id order, as the file writes them.
    if (isAF(d)) {
      d.moves.set(newId, newMove({}, index));
      d.moves = new Map([...d.moves.entries()].sort((a, b) => a[0] - b[0]));
    } else {
      d.animations.set(newId, newSceneAnimation(index));
      d.animations = new Map([...d.animations.entries()].sort((a, b) => a[0] - b[0]));
    }
  });
  void router.push({ name: 'anim-overview', params: { id: newId } });
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop-omf" @click.self="emit('close')">
      <div
        ref="panel"
        class="modal-panel p-3"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label="Add animation"
        data-testid="add-dialog"
        @keydown.enter="onAddEnter"
      >
        <h5>Add animation</h5>
        <p class="small text-secondary">
          Creates base string <code>A10</code> with one empty sprite.
        </p>
        <IntField v-model="id" :min="0" :max="255" label="Id" testid="add-dialog.id" />
        <div v-if="addError" class="text-danger small" data-testid="add-dialog.error">
          {{ addError }}
        </div>
        <div class="text-end mt-2">
          <button class="btn btn-sm btn-outline-secondary me-2" @click="emit('close')">
            Cancel
          </button>
          <button
            class="btn btn-sm btn-primary"
            :disabled="!!addError"
            data-testid="add-dialog.ok"
            @click="confirmAdd"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
