<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { INVALID_TAGS, TAGS } from '@omf/formats';
import { CATEGORIES, TAG_META } from '../../lib/tagMeta';

const props = defineProps<{ existing: string[] }>();
const emit = defineEmits<{ pick: [key: string]; close: [] }>();
const q = ref('');
const input = ref<HTMLInputElement | null>(null);
const active = ref(0);

const entries = computed(() => {
  const f = q.value.trim().toLowerCase();
  return Object.keys(TAGS)
    .filter((k) => !INVALID_TAGS.includes(k))
    .map((k) => ({ key: k, meta: TAG_META[k]!, desc: TAGS[k]!.desc }))
    .filter(
      (e) =>
        !f ||
        e.key.includes(f) ||
        e.meta.label.toLowerCase().includes(f) ||
        e.desc.toLowerCase().includes(f) ||
        e.meta.category.includes(f),
    );
});
const groups = computed(() =>
  CATEGORIES.map((c) => ({
    ...c,
    items: entries.value.filter((e) => e.meta.category === c.id),
  })).filter((g) => g.items.length),
);
const flat = computed(() => groups.value.flatMap((g) => g.items));

function onKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    active.value = Math.min(flat.value.length - 1, active.value + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    active.value = Math.max(0, active.value - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const it = flat.value[active.value];
    if (it) emit('pick', it.key);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  }
}
onMounted(() => nextTick(() => input.value?.focus()));
</script>

<template>
  <div
    class="card shadow position-absolute"
    style="z-index: 20; width: 26rem; max-height: 26rem"
    data-testid="effect-picker"
  >
    <div class="card-header p-2">
      <input
        ref="input"
        v-model="q"
        class="form-control form-control-sm"
        placeholder="Search effects"
        data-testid="effect-picker.search"
        @keydown="onKey"
        @input="active = 0"
      />
    </div>
    <div class="overflow-auto" style="max-height: 22rem">
      <div v-for="g in groups" :key="g.id">
        <div class="small fw-semibold text-secondary px-2 pt-2">{{ g.label }}</div>
        <button
          v-for="it in g.items"
          :key="it.key"
          class="dropdown-item d-flex gap-2 px-2 py-1 small"
          :class="{ active: flat[active]?.key === it.key }"
          :title="it.desc"
          :data-testid="`effect-picker.item.${it.key}`"
          @click="emit('pick', it.key)"
        >
          <span class="flex-grow-1 text-truncate">
            {{ it.meta.label }}
            <span v-if="props.existing.includes(it.key)" class="text-success">✓</span>
          </span>
          <code>{{ it.key }}</code>
        </button>
      </div>
      <div v-if="!flat.length" class="p-2 text-secondary small">No match.</div>
    </div>
  </div>
</template>
