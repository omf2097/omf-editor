// File System Access API with <input type="file"> / download fallbacks (spec 11).

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
  handle?: FileSystemFileHandle;
}

export type FileTypeSpec = FilePickerAcceptType & {
  accept: Record<`${string}/${string}`, `.${string}`[]>;
};

export const OMF_TYPES: FileTypeSpec[] = [
  {
    description: 'OMF fighter or scene',
    accept: { 'application/octet-stream': ['.af', '.bk', '.AF', '.BK'] },
  },
];

/** Tests set this to exercise the fallback path in Chromium too. */
export const fileAccess = {
  useNativePicker: typeof window !== 'undefined' && 'showOpenFilePicker' in window,
};

/** The user closed a file picker without choosing. */
const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

/** The file behind a handle was moved or deleted. */
export const isNotFound = (e: unknown): boolean =>
  e instanceof DOMException && e.name === 'NotFoundError';

export async function readHandle(handle: FileSystemFileHandle): Promise<PickedFile> {
  const file = await handle.getFile();
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle };
}

function inputPick(accept: string): Promise<PickedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.dataset.testid = 'file-input';
    document.body.append(input);
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.remove();
      try {
        resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    input.click();
  });
}

const acceptString = (types: FileTypeSpec[]): string =>
  types.flatMap((t) => Object.values(t.accept).flat()).join(',');

/** Returns null when the user cancels. */
export async function pickFile(types: FileTypeSpec[] = OMF_TYPES): Promise<PickedFile | null> {
  if (fileAccess.useNativePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types, multiple: false });
      return handle ? readHandle(handle) : null;
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  return inputPick(acceptString(types));
}

export async function writeHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const w = await handle.createWritable();
  try {
    await w.write(bytes as Uint8Array<ArrayBuffer>);
    await w.close();
  } catch (e) {
    // Abort so the half-written swap file is discarded and the original stays as it was.
    await w.abort().catch(() => undefined);
    throw e;
  }
}

export function download(
  name: string,
  bytes: Uint8Array | string,
  type = 'application/octet-stream',
): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Save as": native save picker when available, otherwise a download. Returns the handle or null. */
export async function saveAs(
  suggestedName: string,
  bytes: Uint8Array,
  types: FileTypeSpec[] = OMF_TYPES,
): Promise<{ handle: FileSystemFileHandle | null; name: string } | null> {
  if (fileAccess.useNativePicker && 'showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName, types });
      await writeHandle(handle, bytes);
      return { handle, name: handle.name };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  download(suggestedName, bytes);
  return { handle: null, name: suggestedName };
}

export async function ensurePermission(
  handle: FileSystemFileHandle,
  mode: 'read' | 'readwrite',
): Promise<boolean> {
  const h = handle as FileSystemFileHandle & {
    queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
    requestPermission?: (d: { mode: string }) => Promise<PermissionState>;
  };
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode })) === 'granted') return true;
  return (await h.requestPermission?.({ mode })) === 'granted';
}
