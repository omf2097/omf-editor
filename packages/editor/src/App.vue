<script setup lang="ts">
import { onMounted } from 'vue';
import { useEventListener } from '@vueuse/core';
import { useRouter } from 'vue-router';
import TopBar from './components/TopBar.vue';
import StatusBar from './components/StatusBar.vue';
import PaletteBanner from './components/PaletteBanner.vue';
import ToastStack from './components/ToastStack.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import NewFileDialog from './components/NewFileDialog.vue';
import { useDocument } from './composables/useDocument';
import { useShortcuts } from './composables/useShortcuts';
import { useAppActions } from './composables/useAppActions';
import { usePalette } from './composables/usePalette';
import { useViewport } from './composables/useViewport';
import { usePlayback } from './composables/usePlayback';
import { useAutosave } from './composables/useAutosave';
import { useNewFile } from './composables/useNewFile';
import { useSounds } from './composables/useSounds';
import { useFileDrop } from './composables/useFileDrop';
import { useToasts } from './composables/useToasts';
import { installPlaybackSound } from './lib/playbackSound';

const router = useRouter();
const docs = useDocument();
const actions = useAppActions();
const shortcuts = useShortcuts();
const newFile = useNewFile();
const autosave = useAutosave();
const toasts = useToasts();

function onBeforeUnload(e: BeforeUnloadEvent): void {
  docs.commitPending();
  if (docs.dirty.value) {
    e.preventDefault();
    e.returnValue = '';
  }
}

/** A dropped file is loaded by its name: sound bank, ALTPALS, JSON import or a document. */
async function openDropped(
  name: string,
  bytes: Uint8Array,
  handle: FileSystemFileHandle | undefined,
): Promise<void> {
  if (/^sounds\.dat$/i.test(name)) {
    if (await useSounds().loadBytes(name, bytes)) toasts.success(`Loaded ${name}`);
    return;
  }
  if (/^altpals\.dat$/i.test(name)) {
    if (await usePalette().loadAltPalsBytes(name, bytes)) toasts.success(`Loaded ${name}`);
    return;
  }
  if (/\.json$/i.test(name)) {
    if (await actions.confirmDiscard('import')) {
      if (docs.importJSONBytes(name, bytes)) await router.push({ name: 'animations' });
    }
    return;
  }
  await actions.openPicked({ name, bytes, handle });
}

const { dragging, onDragEnter, onDragLeave, onDrop } = useFileDrop(openDropped);

const views = ['file', 'animations', 'palettes', 'background', 'problems', 'reference'] as const;

function registerGlobalShortcuts(): void {
  shortcuts.register('global', [
    {
      keys: 'Ctrl+KeyO',
      label: 'Ctrl+O',
      description: 'Open a file',
      run: () => void actions.open(),
      inInputs: true,
    },
    {
      keys: 'Ctrl+KeyS',
      label: 'Ctrl+S',
      description: 'Save',
      run: () => void docs.save(),
      inInputs: true,
    },
    {
      keys: 'Ctrl+Shift+KeyS',
      label: 'Ctrl+Shift+S',
      description: 'Save as',
      run: () => void docs.saveAs(),
      inInputs: true,
    },
    { keys: 'Ctrl+KeyZ', label: 'Ctrl+Z', description: 'Undo', run: () => docs.undo() },
    { keys: 'Ctrl+KeyY', label: 'Ctrl+Y', description: 'Redo', run: () => docs.redo() },
    { keys: 'Ctrl+Shift+KeyZ', label: 'Ctrl+Shift+Z', description: 'Redo', run: () => docs.redo() },
    {
      keys: 'Ctrl+Alt+KeyN',
      label: 'Ctrl+Alt+N',
      description: 'New fighter or scene',
      run: () => newFile.openDialog(),
    },
    ...views.map((v, i) => ({
      keys: `Ctrl+Alt+Digit${i + 1}`,
      label: `Ctrl+Alt+${i + 1}`,
      description: `Go to ${v[0]!.toUpperCase()}${v.slice(1)}`,
      run: () => void router.push({ name: v }),
      inInputs: true,
    })),
  ]);
}

useEventListener(window, 'beforeunload', onBeforeUnload);

onMounted(() => {
  shortcuts.install();
  // Settings and cached files (palette source, ALTPALS, SOUNDS.DAT) from IndexedDB.
  void usePalette().restore();
  void useViewport().restore();
  void usePlayback().restore();
  void useSounds().restore();
  installPlaybackSound();
  autosave.install();
  registerGlobalShortcuts();
});
</script>

<template>
  <div
    class="app-shell"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover.prevent
    @drop="onDrop"
  >
    <TopBar />
    <div><PaletteBanner /></div>
    <main class="app-main">
      <RouterView />
    </main>
    <StatusBar />
    <ToastStack />
    <ConfirmDialog />
    <NewFileDialog />
    <div v-if="dragging" class="drop-hint" data-testid="drop-hint" />
  </div>
</template>
