// Dropping a file on the window: drag state for the drop hint, and the dropped
// file's bytes and (in Chromium) its File System Access handle.

import { ref } from 'vue';
import { errorMessage, useToasts } from './useToasts';

/** Called with the first dropped file. `handle` is there when the browser gives one. */
export type DropHandler = (
  name: string,
  bytes: Uint8Array,
  handle: FileSystemFileHandle | undefined,
) => Promise<void>;

type ItemWithHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

function hasFiles(e: DragEvent): boolean {
  return [...(e.dataTransfer?.types ?? [])].includes('Files');
}

/** Bind the returned handlers on the drop target; add `@dragover.prevent` there too. */
export function useFileDrop(onFile: DropHandler) {
  const toasts = useToasts();
  const dragging = ref(false);
  // dragenter/dragleave also fire for every child element crossed: count them.
  let dragDepth = 0;

  function onDragEnter(e: DragEvent): void {
    if (!hasFiles(e)) return;
    dragDepth++;
    dragging.value = true;
  }

  function onDragLeave(e: DragEvent): void {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragging.value = false;
  }

  async function onDrop(e: DragEvent): Promise<void> {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dragging.value = false;
    // The DataTransfer is emptied once the event handler returns, so the handle
    // is requested before the first await.
    const item = [...(e.dataTransfer?.items ?? [])].find((i) => i.kind === 'file');
    const handlePromise = (item as ItemWithHandle | undefined)?.getAsFileSystemHandle?.();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    let handle: FileSystemFileHandle | undefined;
    try {
      const h = await handlePromise;
      if (h && h.kind === 'file') handle = h as FileSystemFileHandle;
    } catch {
      // no handle support
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (err) {
      toasts.error(`Could not read ${file.name}: ${errorMessage(err)}`);
      return;
    }
    await onFile(file.name, bytes, handle);
  }

  return { dragging, onDragEnter, onDragLeave, onDrop };
}
