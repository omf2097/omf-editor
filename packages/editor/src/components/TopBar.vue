<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import Icon from './Icon.vue';
import { useDocument } from '../composables/useDocument';
import { useHistory } from '../composables/useHistory';
import { useProblems } from '../composables/useProblems';
import { useTheme } from '../composables/useTheme';
import { useDisplay, type TextSize } from '../composables/useDisplay';
import { useAppActions } from '../composables/useAppActions';
import { useNewFile } from '../composables/useNewFile';
import { useDismiss } from '../composables/useModal';

const docs = useDocument();
const history = useHistory();
const problems = useProblems();
const theme = useTheme();
const display = useDisplay();
const TEXT_SIZES: { value: TextSize; label: string; size: string }[] = [
  { value: 'compact', label: 'Compact text', size: '0.75rem' },
  { value: 'default', label: 'Default text size', size: '0.875rem' },
  { value: 'large', label: 'Large text', size: '1.05rem' },
];
const actions = useAppActions();
const newFile = useNewFile();
const route = useRoute();
/** The section the current route is in: /animations/11/script is under Animations. */
const isActive = (name: string): boolean =>
  route.path === `/${name}` || route.path.startsWith(`/${name}/`);
const menuOpen = ref(false);
const menuRoot = ref<HTMLElement | null>(null);
useDismiss(
  () => menuOpen.value,
  menuRoot,
  () => (menuOpen.value = false),
);

const nav = computed(() => {
  const open = docs.doc.value !== null;
  return [
    { name: 'file', label: 'File', enabled: open },
    { name: 'animations', label: 'Animations', enabled: open },
    { name: 'palettes', label: 'Palettes', enabled: open },
    ...(docs.kind.value === 'bk'
      ? [{ name: 'background', label: 'Background', enabled: open }]
      : []),
    { name: 'problems', label: 'Problems', enabled: open },
    { name: 'reference', label: 'Reference', enabled: true },
  ];
});

function run(f: () => unknown): void {
  menuOpen.value = false;
  void f();
}
</script>

<template>
  <header class="topbar d-flex align-items-center gap-3 px-3" data-testid="topbar">
    <RouterLink to="/" class="fw-bold text-decoration-none text-body text-nowrap"
      >OMF Editor</RouterLink
    >
    <nav class="nav" aria-label="Primary">
      <template v-for="n in nav" :key="n.name">
        <RouterLink
          v-if="n.enabled"
          :to="{ name: n.name }"
          class="nav-link"
          :class="{ active: isActive(n.name) }"
          active-class=""
          exact-active-class=""
          :aria-current="isActive(n.name) ? 'page' : undefined"
          :data-testid="`nav.${n.name}`"
        >
          {{ n.label }}
          <span
            v-if="n.name === 'problems' && problems.count.value > 0"
            class="badge text-bg-warning ms-1"
            data-testid="nav.problems.count"
            >{{ problems.count.value }}</span
          >
        </RouterLink>
        <span v-else class="nav-link disabled" :data-testid="`nav.${n.name}`">{{ n.label }}</span>
      </template>
    </nav>
    <div class="ms-auto d-flex align-items-center gap-2">
      <span
        v-if="docs.doc.value"
        class="mono text-truncate"
        style="max-width: 16rem"
        data-testid="doc-title"
      >
        {{ docs.fileName.value
        }}<span v-if="docs.dirty.value" class="text-warning ms-1" title="Modified">●</span>
      </span>
      <div ref="menuRoot" class="btn-group position-relative">
        <button
          class="btn btn-sm btn-primary"
          :disabled="!docs.doc.value"
          title="Save (Ctrl+S)"
          data-testid="save"
          @click="docs.save()"
        >
          <Icon name="save" /> Save
        </button>
        <button
          class="btn btn-sm btn-primary dropdown-toggle dropdown-toggle-split"
          aria-label="More file actions"
          data-testid="file-menu"
          @click="menuOpen = !menuOpen"
        />
        <ul
          v-if="menuOpen"
          class="dropdown-menu dropdown-menu-end show"
          style="top: 100%; right: 0"
        >
          <li>
            <button class="dropdown-item" data-testid="menu.open" @click="run(actions.open)">
              Open… <kbd class="float-end">Ctrl+O</kbd>
            </button>
          </li>
          <li>
            <button class="dropdown-item" data-testid="menu.new" @click="run(newFile.openDialog)">
              New…
            </button>
          </li>
          <li>
            <button
              class="dropdown-item"
              :disabled="!docs.doc.value"
              data-testid="menu.saveas"
              @click="run(docs.saveAs)"
            >
              Save as… <kbd class="float-end">Ctrl+Shift+S</kbd>
            </button>
          </li>
          <li>
            <button
              class="dropdown-item"
              :disabled="!docs.doc.value"
              data-testid="menu.duplicate"
              @click="run(newFile.duplicate)"
            >
              Duplicate
            </button>
          </li>
          <li><hr class="dropdown-divider" /></li>
          <li>
            <button
              class="dropdown-item"
              :disabled="!docs.doc.value"
              data-testid="menu.export-json"
              @click="run(docs.exportJSON)"
            >
              Export JSON
            </button>
          </li>
          <li>
            <button
              class="dropdown-item"
              data-testid="menu.import-json"
              @click="run(actions.importJSON)"
            >
              Import JSON…
            </button>
          </li>
          <li><hr class="dropdown-divider" /></li>
          <li>
            <button
              class="dropdown-item"
              :disabled="!docs.doc.value"
              data-testid="menu.close"
              @click="run(actions.close)"
            >
              Close
            </button>
          </li>
        </ul>
      </div>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="!history.canUndo.value"
        :title="`Undo ${history.undoLabel.value} (Ctrl+Z)`"
        aria-label="Undo"
        data-testid="undo"
        @click="docs.undo()"
      >
        <Icon name="undo" />
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="!history.canRedo.value"
        :title="`Redo ${history.redoLabel.value} (Ctrl+Y)`"
        aria-label="Redo"
        data-testid="redo"
        @click="docs.redo()"
      >
        <Icon name="redo" />
      </button>
      <div class="btn-group btn-group-sm" role="group" aria-label="Text size">
        <button
          v-for="t in TEXT_SIZES"
          :key="t.value"
          class="btn text-size-btn"
          :class="display.textSize.value === t.value ? 'btn-secondary' : 'btn-outline-secondary'"
          :title="t.label"
          :aria-label="t.label"
          :aria-pressed="display.textSize.value === t.value"
          :data-testid="`text-size.${t.value}`"
          @click="display.textSize.value = t.value"
        >
          <span :style="{ fontSize: t.size }" aria-hidden="true">A</span>
        </button>
      </div>
      <button
        class="btn btn-sm"
        :class="display.showFieldCodes.value ? 'btn-primary' : 'btn-outline-secondary'"
        :title="`Show file field names: ${display.showFieldCodes.value ? 'on' : 'off'}`"
        aria-label="Show file field names"
        :aria-pressed="display.showFieldCodes.value"
        data-testid="field-codes"
        @click="display.showFieldCodes.value = !display.showFieldCodes.value"
      >
        <Icon name="fieldCodes" />
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        aria-label="Toggle theme"
        data-testid="theme"
        @click="theme.toggle()"
      >
        <Icon name="theme" />
      </button>
    </div>
    <div
      v-if="menuOpen"
      class="position-fixed top-0 start-0 w-100 h-100"
      style="z-index: 999"
      @click="menuOpen = false"
    />
  </header>
</template>

<style scoped>
.dropdown-menu {
  z-index: 1000;
}
.text-size-btn {
  width: 1.9rem;
  padding-left: 0;
  padding-right: 0;
  line-height: 1.3;
}
</style>
