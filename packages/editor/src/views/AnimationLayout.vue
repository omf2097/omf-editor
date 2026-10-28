<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MOVE_CATEGORIES, type AFFile } from '@omf/formats';
import Icon from '../components/Icon.vue';
import AddAnimationDialog from '../components/AddAnimationDialog.vue';
import { useDocument } from '../composables/useDocument';
import { useSelection } from '../composables/useSelection';
import { useProblems } from '../composables/useProblems';
import { useConfirm } from '../composables/useConfirm';
import { useShortcuts } from '../composables/useShortcuts';
import { usePlayback } from '../composables/usePlayback';
import { animationLabel, animationsOf, isAF, maxAnimations, type AnyAnimation } from '../lib/doc';
import { keepImagesOfDoomedOwners, sharersLosingOwner, spriteLabel } from '../lib/spriteEdit';
import { referencesTo } from '../lib/references';
import { categoryColor, categoryLabel } from '../lib/categories';
import { clamp, inputValue } from '../lib/util';

const route = useRoute();
const router = useRouter();
const docs = useDocument();
const sel = useSelection();
const problems = useProblems();
const { ask } = useConfirm();
const shortcuts = useShortcuts();
const pb = usePlayback();

const filter = ref('');
const sidebarOpen = ref(true);
/** The add dialog is open, proposing this id. */
const addingId = ref<number | null>(null);

const kind = computed(() => docs.kind.value ?? 'af');
const rows = computed(() => {
  const d = docs.doc.value;
  if (!d) return [];
  const f = filter.value.trim().toLowerCase();
  return [...animationsOf(d).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, a]) => ({
      id,
      label: animationLabel(kind.value, id),
      sprites: a.sprites.length,
      moveString: isAF(d) ? d.moves.get(id)!.moveString : '',
      category: isAF(d) ? d.moves.get(id)!.category : null,
      severity: problems.worstFor(id),
    }))
    .filter(
      (r) =>
        !f ||
        String(r.id) === f ||
        r.label.toLowerCase().includes(f) ||
        r.moveString.toLowerCase().includes(f),
    );
});

watch(
  sel.animId,
  (id) => {
    pb.bind(id);
  },
  { immediate: true },
);
// The shown animation disappeared (undo of its creation, redo of a delete): pick another.
watch(
  () => sel.animId.value !== null && docs.doc.value !== null && sel.animation.value === null,
  (gone) => {
    if (gone) void router.replace({ name: 'animations' });
  },
);

const tabs = [
  { name: 'anim-overview', label: 'Overview' },
  { name: 'anim-script', label: 'Script' },
  { name: 'anim-sprites', label: 'Sprites' },
  { name: 'anim-collisions', label: 'Collisions' },
];
const pixelMode = computed(() => route.name === 'anim-pixels');

function freeId(): number {
  const d = docs.doc.value!;
  const used = animationsOf(d);
  for (let i = 0; i < maxAnimations(kind.value); i++) if (!used.has(i)) return i;
  return -1;
}

function startAdd(): void {
  const id = freeId();
  if (id < 0) return;
  addingId.value = id;
}

async function remove(): Promise<void> {
  const id = sel.animId.value;
  const d = docs.doc.value;
  if (id === null || !d) return;
  // Sprites of other animations may share images this one owns (by image
  // index); deleting it plainly would leave them without an owner.
  const refs = referencesTo(d, id);
  const doomed = (r: { animId: number }): boolean => r.animId === id;
  const orphans = sharersLosingOwner(d, doomed).flatMap((o) => o.sharers);
  const c = await ask({
    title: `Delete ${animationLabel(kind.value, id)}?`,
    message:
      (refs.length
        ? 'These references will point to a missing animation:'
        : 'Nothing else refers to it.') +
      (orphans.length
        ? ` Sprites elsewhere share images it owns (${orphans.map(spriteLabel).join(', ')}); without an owner they show another image or crash the game.`
        : ''),
    details: refs,
    choices: [
      { id: 'cancel', label: 'Cancel', variant: 'outline-secondary' },
      { id: 'delete', label: 'Delete', variant: orphans.length ? 'secondary' : 'danger' },
      ...(orphans.length
        ? [{ id: 'keep', label: 'Delete, keep images for sharers', variant: 'danger' as const }]
        : []),
    ],
  });
  if (c !== 'delete' && c !== 'keep') return;
  docs.mutate(`delete animation ${id}`, (x) => {
    if (c === 'keep') keepImagesOfDoomedOwners(x, doomed);
    animationsOf(x).delete(id);
  });
  void router.push({ name: 'animations' });
}

function setCategory(v: number): void {
  const id = sel.animId.value;
  if (id === null) return;
  docs.mutate<AFFile>(`set category ${id}`, (d) => {
    d.moves.get(id)!.category = v;
  });
}

function move(delta: number): void {
  const ids = rows.value.map((r) => r.id);
  const i = ids.indexOf(sel.animId.value ?? -1);
  const next = ids[clamp(i + delta, 0, ids.length - 1)];
  if (next !== undefined) sel.selectAnimation(next);
}

const anim = computed<AnyAnimation | null>(() => sel.animation.value);
const category = computed(() => {
  const d = docs.doc.value;
  const id = sel.animId.value;
  return d && isAF(d) && id !== null ? (d.moves.get(id)?.category ?? null) : null;
});

let off: (() => void)[] = [];
onMounted(() => {
  off = [
    shortcuts.activate('animations'),
    shortcuts.register('animations', [
      {
        keys: 'Ctrl+KeyB',
        label: 'Ctrl+B',
        description: 'Toggle the animation sidebar',
        run: () => (sidebarOpen.value = !sidebarOpen.value),
      },
      ...tabs.map((t, i) => ({
        keys: `Digit${i + 1}`,
        label: String(i + 1),
        description: `Animation ${t.label}`,
        run: () => void router.push({ name: t.name, params: { id: sel.animId.value } }),
      })),
      { keys: 'ArrowUp', label: '↑', description: 'Previous animation', run: () => move(-1) },
      { keys: 'ArrowDown', label: '↓', description: 'Next animation', run: () => move(1) },
    ]),
  ];
});
onBeforeUnmount(() => {
  off.forEach((f) => f());
  // Playback (and its sounds) belongs to the animation views.
  pb.pause();
});
</script>

<template>
  <div class="d-flex h-100" data-testid="view.animations">
    <aside v-if="sidebarOpen && !pixelMode" class="sidebar" data-testid="anim-sidebar">
      <div class="p-2 border-bottom">
        <input
          v-model="filter"
          class="form-control form-control-sm"
          placeholder="Filter by id, name or input"
          aria-label="Filter animations"
          data-testid="anim-filter"
        />
      </div>
      <div class="list" role="listbox" aria-label="Animations">
        <div
          v-for="r in rows"
          :key="r.id"
          class="row-item"
          :class="{ active: r.id === sel.animId.value }"
          role="option"
          tabindex="0"
          :aria-selected="r.id === sel.animId.value"
          :data-testid="`anim-row.${r.id}`"
          @click="sel.selectAnimation(r.id)"
          @keydown.enter.space.prevent="sel.selectAnimation(r.id)"
        >
          <span
            v-if="r.category !== null"
            class="cat-dot"
            :style="{ background: categoryColor(r.category) }"
            role="img"
            :title="categoryLabel(r.category)"
            :aria-label="categoryLabel(r.category)"
            :data-testid="`anim-dot.${r.id}`"
          />
          <span class="mono text-secondary" style="width: 1.6rem; text-align: right">{{
            r.id
          }}</span>
          <span class="text-truncate flex-grow-1">{{ r.label }}</span>
          <span
            v-if="r.moveString && r.moveString.length > 1 && /^[PK]/.test(r.moveString)"
            class="mono small text-secondary"
            >{{ r.moveString }}</span
          >
          <span class="small text-secondary">{{ r.sprites }}</span>
          <span v-if="r.severity === 'error'" class="text-danger" title="Has errors"
            ><Icon name="error"
          /></span>
          <span
            v-else-if="r.severity === 'warning'"
            class="text-warning"
            title="Has warnings"
            :data-testid="`anim-row.${r.id}.warn`"
            ><Icon name="warning"
          /></span>
        </div>
      </div>
      <div class="p-2 border-top d-flex gap-1">
        <button class="btn btn-sm btn-outline-primary" data-testid="anim-add" @click="startAdd">
          <Icon name="plus" /> Add
        </button>
        <button
          class="btn btn-sm btn-outline-danger"
          :disabled="sel.animId.value === null"
          aria-label="Delete animation"
          data-testid="anim-delete"
          @click="remove"
        >
          <Icon name="trash" />
        </button>
      </div>
    </aside>

    <section class="flex-grow-1 d-flex flex-column" style="min-width: 0">
      <div
        v-if="anim && !pixelMode"
        class="d-flex align-items-center gap-3 px-3 pt-2 border-bottom sticky-head"
      >
        <button
          class="btn btn-sm btn-link text-secondary p-0"
          aria-label="Toggle sidebar"
          @click="sidebarOpen = !sidebarOpen"
        >
          <Icon name="sidebar" />
        </button>
        <h5 class="mb-0" data-testid="anim-title">
          {{ sel.animId.value }} · {{ animationLabel(kind, sel.animId.value!) }}
        </h5>
        <select
          v-if="category !== null"
          class="form-select form-select-sm"
          style="width: auto"
          :value="category"
          aria-label="Category"
          data-testid="anim-category"
          @change="setCategory(Number(inputValue($event)))"
        >
          <option v-if="!MOVE_CATEGORIES.some((c) => c.value === category)" :value="category">
            Unknown ({{ category }})
          </option>
          <option v-for="c in MOVE_CATEGORIES" :key="c.value" :value="c.value">
            {{ c.value }} {{ c.name }}
          </option>
        </select>
        <nav class="nav nav-tabs ms-auto border-0" role="tablist">
          <RouterLink
            v-for="t in tabs"
            :key="t.name"
            :to="{ name: t.name, params: { id: sel.animId.value } }"
            class="nav-link"
            :class="{ active: route.name === t.name }"
            role="tab"
            :aria-selected="route.name === t.name"
            :data-testid="`tab.${t.name}`"
            >{{ t.label }}</RouterLink
          >
        </nav>
      </div>
      <div class="flex-grow-1 overflow-auto">
        <RouterView v-if="anim" :key="String(route.name)" />
        <div v-else class="view-pad text-secondary" data-testid="anim-empty">
          No animations.
          <button class="btn btn-sm btn-outline-primary ms-2" @click="startAdd">Add one</button>
        </div>
      </div>
    </section>

    <AddAnimationDialog v-if="addingId !== null" :initial-id="addingId" @close="addingId = null" />
  </div>
</template>
