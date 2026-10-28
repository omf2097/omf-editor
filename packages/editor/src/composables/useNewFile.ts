import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDocument } from './useDocument';
import { useAppActions } from './useAppActions';
import { newFighter, newScene, JAGUAR_HEADER, type FighterHeader } from '../lib/templates';
import { cloneDoc, parseDocument, kindOf, type Doc } from '../lib/doc';
import { pickFile } from '../lib/files';
import { errorMessage, useToasts } from './useToasts';

const dialogOpen = ref(false);

export function useNewFile() {
  const router = useRouter();
  const docs = useDocument();
  const actions = useAppActions();
  const toasts = useToasts();

  const confirmNew = () => actions.confirmDiscard('create a new file');

  /** Closes the dialog and shows `d` as a new, unsaved document. */
  async function begin(d: Doc, name: string, view: 'animations' | 'file'): Promise<void> {
    dialogOpen.value = false;
    docs.newDocument(d, name);
    await router.push({ name: view });
  }

  return {
    dialogOpen,
    openDialog: () => {
      dialogOpen.value = true;
    },
    closeDialog: () => {
      dialogOpen.value = false;
    },
    async newFighter(header: FighterHeader = JAGUAR_HEADER) {
      if (await confirmNew()) await begin(newFighter(header), 'Untitled.AF', 'animations');
    },
    async newScene() {
      if (await confirmNew()) await begin(newScene(), 'Untitled.BK', 'file');
    },
    /** Opens an existing file as a new, unsaved document (no file handle kept). */
    async newFrom() {
      const p = await pickFile();
      if (!p) return;
      if (!(await confirmNew())) return;
      try {
        const d = parseDocument(p.name, p.bytes);
        const name =
          `Copy of ${p.name}`.replace(/\.(af|bk)$/i, '') + (kindOf(d) === 'af' ? '.AF' : '.BK');
        await begin(d, name, 'animations');
      } catch (e) {
        toasts.error(`Could not open ${p.name}: ${errorMessage(e)}`);
      }
    },
    duplicate() {
      const d = docs.doc.value;
      if (!d) return;
      docs.newDocument(cloneDoc(d), `Copy of ${docs.fileName.value}`);
    },
  };
}
