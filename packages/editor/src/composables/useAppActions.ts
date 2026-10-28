// Top-level actions shared by the TopBar, the Start view and shortcuts.

import { useRouter } from 'vue-router';
import { useDocument } from './useDocument';
import { useConfirm } from './useConfirm';
import { clearPendingRoute, pendingRoute } from '../router';
import type { PickedFile } from '../lib/files';
import { useRecentFiles } from './useRecentFiles';

export function useAppActions() {
  const router = useRouter();
  const docs = useDocument();
  const { ask } = useConfirm();
  const recent = useRecentFiles();

  /** Asks what to do with unsaved changes. Resolves false when the user cancels. */
  async function confirmDiscard(action = 'continue'): Promise<boolean> {
    // An edit still in a focused field or the script debounce counts as unsaved.
    docs.commitPending();
    if (!docs.dirty.value) return true;
    const c = await ask({
      title: 'Unsaved changes',
      message: `${docs.fileName.value} has unsaved changes. Save before you ${action}?`,
      choices: [
        { id: 'cancel', label: 'Cancel', variant: 'outline-secondary' },
        { id: 'discard', label: 'Discard', variant: 'danger' },
        { id: 'save', label: 'Save', variant: 'primary' },
      ],
    });
    if (c === 'cancel') return false;
    if (c === 'save') return docs.save();
    return true;
  }

  async function afterOpen(p: PickedFile | null): Promise<void> {
    if (!p) return;
    if (p.handle) void recent.add(p.handle, docs.kind.value ?? 'af');
    const target = pendingRoute;
    clearPendingRoute();
    await router.push(target ?? { name: 'animations' });
  }

  return {
    confirmDiscard,
    async open() {
      if (!(await confirmDiscard('open another file'))) return;
      await afterOpen(await docs.openFile());
    },
    async openPicked(p: PickedFile) {
      if (!(await confirmDiscard('open another file'))) return;
      if (await docs.openPicked(p)) await afterOpen(p);
    },
    async close() {
      if (!(await confirmDiscard('close'))) return;
      docs.close();
      await router.push({ name: 'start' });
    },
    async importJSON() {
      if (!(await confirmDiscard('import'))) return;
      if (await docs.importJSON()) await router.push({ name: 'animations' });
    },
  };
}
