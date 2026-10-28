<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import { useAppActions } from '../composables/useAppActions';
import { useRecentFiles } from '../composables/useRecentFiles';
import { useNewFile } from '../composables/useNewFile';
import { useAutosave } from '../composables/useAutosave';
import { useDocument } from '../composables/useDocument';
import type { RecentEntry, Snapshot } from '../lib/db';

const router = useRouter();
const actions = useAppActions();
const recent = useRecentFiles();
const nf = useNewFile();
const autosave = useAutosave();
const docs = useDocument();

onMounted(() => {
  void recent.refresh();
  void autosave.listRecoverable();
});
onBeforeUnmount(() => autosave.stopListing());

async function openRecent(e: RecentEntry): Promise<void> {
  const p = await recent.reopen(e);
  if (p) await actions.openPicked(p);
}

async function restore(s: Snapshot): Promise<void> {
  if (!(await actions.confirmDiscard('restore a snapshot'))) return;
  if (await autosave.restore(s))
    await router.push(s.route && s.route !== '/' ? s.route : { name: 'animations' });
}

const fmtTime = (t: number): string => new Date(t).toLocaleString();
</script>

<template>
  <div class="view-pad d-flex justify-content-center">
    <div class="card mt-4" style="width: min(720px, 100%)">
      <div class="card-body">
        <h4 class="card-title">One Must Fall 2097 file editor</h4>
        <p class="text-secondary">
          Edit fighter (<code>.AF</code>) and scene (<code>.BK</code>) files.
        </p>
        <div
          class="border border-2 rounded p-4 text-center mb-3"
          style="border-style: dashed !important"
          data-testid="start.drop"
        >
          Drop an .AF or .BK file here, or
          <button
            class="btn btn-primary btn-sm ms-1"
            data-testid="start.open"
            @click="actions.open()"
          >
            <Icon name="open" /> Open…
          </button>
        </div>
        <div class="d-flex gap-2 flex-wrap mb-3">
          <button
            class="btn btn-outline-secondary btn-sm"
            data-testid="start.new-fighter"
            @click="nf.newFighter()"
          >
            <Icon name="newFile" /> New fighter
          </button>
          <button
            class="btn btn-outline-secondary btn-sm"
            data-testid="start.new-scene"
            @click="nf.newScene()"
          >
            <Icon name="newFile" /> New scene
          </button>
          <button
            class="btn btn-outline-secondary btn-sm"
            data-testid="start.new-from"
            @click="nf.newFrom()"
          >
            New from…
          </button>
          <button
            class="btn btn-outline-secondary btn-sm"
            data-testid="start.import-json"
            @click="actions.importJSON()"
          >
            Import JSON…
          </button>
          <RouterLink
            v-if="docs.doc.value"
            class="btn btn-link btn-sm ms-auto"
            :to="{ name: 'animations' }"
          >
            Back to {{ docs.fileName.value }}
          </RouterLink>
        </div>

        <div v-if="autosave.recoverable.value.length" class="mb-3" data-testid="start.recover">
          <h6>Recover unsaved work</h6>
          <div
            v-for="s in autosave.recoverable.value"
            :key="s.session"
            class="d-flex align-items-center gap-2 border rounded p-2 mb-1"
            data-testid="recover.card"
          >
            <span class="mono">{{ s.name }}</span>
            <span class="text-secondary small"
              >{{ fmtTime(s.savedAt) }} · {{ s.bytes.length.toLocaleString() }} B</span
            >
            <button
              class="btn btn-sm btn-primary ms-auto"
              data-testid="recover.restore"
              @click="restore(s)"
            >
              Restore
            </button>
            <button
              class="btn btn-sm btn-outline-danger"
              data-testid="recover.discard"
              @click="autosave.discard(s)"
            >
              Discard
            </button>
          </div>
        </div>

        <div v-if="recent.entries.value.length" data-testid="start.recent">
          <h6><Icon name="recent" /> Recent files</h6>
          <div class="list-group list-group-flush">
            <div
              v-for="e in recent.entries.value"
              :key="e.id"
              class="list-group-item d-flex align-items-center gap-2 px-0"
            >
              <button
                class="btn btn-link btn-sm p-0 mono"
                data-testid="recent.item"
                @click="openRecent(e)"
              >
                {{ e.name }}
              </button>
              <span class="text-secondary small">{{ fmtTime(e.openedAt) }}</span>
              <button
                class="btn btn-sm btn-link text-secondary ms-auto"
                aria-label="Forget"
                @click="recent.forget(e)"
              >
                <Icon name="close" />
              </button>
            </div>
          </div>
        </div>
        <p class="small text-secondary mt-3 mb-0">
          Everything runs in your browser. Files are never uploaded.
        </p>
      </div>
    </div>
  </div>
</template>
