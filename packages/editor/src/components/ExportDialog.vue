<script setup lang="ts">
// Animation export dialog (spec 20 §3): renders the selected animation as
// APNG, GIF or a PNG strip in a Web Worker and downloads the result.
import { computed, onBeforeUnmount, reactive, ref, toRaw } from 'vue';
import { totalTicks, type BKFile } from '@omf/formats';
import { useDocument } from '../composables/useDocument';
import { usePalette } from '../composables/usePalette';
import { usePlayback } from '../composables/usePlayback';
import { useSelection } from '../composables/useSelection';
import { useViewport } from '../composables/useViewport';
import { useConfirm } from '../composables/useConfirm';
import { useModal } from '../composables/useModal';
import { useToasts, errorMessage } from '../composables/useToasts';
import { animationsOf, isAF, type AnyAnimation, type Doc } from '../lib/doc';
import {
  LARGE_EXPORT_TICKS,
  runExport,
  type ExportFormat,
  type ExportJob,
  type ExportMessage,
} from '../lib/animExport';
import { paletteRgb } from '../codecs/export';
import { download } from '../lib/files';

const emit = defineEmits<{ close: [] }>();
const docs = useDocument();
const palette = usePalette();
const pb = usePlayback();
const sel = useSelection();
const vp = useViewport();
const { confirm } = useConfirm();
const toasts = useToasts();
const busy = ref(false);
const progress = ref<{ done: number; total: number } | null>(null);
let worker: Worker | null = null;
const panel = ref<HTMLElement | null>(null);

const total = computed(() => totalTicks(pb.script.value));
const o = reactive({
  format: 'apng' as ExportFormat,
  background: true,
  zoom: 2,
  /** Total plays, 0 = forever. */
  plays: 0,
  start: 0,
  end: total.value,
});
/** The tick range rendered: at least one tick from a non-negative start. */
const range = computed(() => ({ start: Math.max(0, o.start), end: Math.max(o.start + 1, o.end) }));
const ticks = computed(() => Math.max(1, range.value.end - range.value.start));

/**
 * Runs the job in a worker, or on this thread where workers are unavailable
 * (deferred with setTimeout so the progress UI can appear first).
 */
function execute(job: ExportJob): Promise<Extract<ExportMessage, { type: 'done' }>> {
  return new Promise((resolve, reject) => {
    const onMessage = (m: ExportMessage): void => {
      if (m.type === 'progress') progress.value = { done: m.done, total: m.total };
      else if (m.type === 'error') reject(new Error(m.message));
      else resolve(m);
    };
    try {
      worker = new Worker(new URL('../workers/export.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      worker = null;
    }
    if (!worker) {
      setTimeout(() => runExport(job, onMessage), 0);
      return;
    }
    worker.onmessage = (e: MessageEvent<ExportMessage>) => onMessage(e.data);
    worker.onerror = (e) => reject(new Error(e.message || 'the export worker failed'));
    worker.postMessage(job);
  });
}

function stopWorker(): void {
  worker?.terminate();
  worker = null;
}

/**
 * The worker job for the current options. Everything is unwrapped with toRaw
 * because postMessage cannot structured-clone Vue proxies.
 */
function buildJob(d: Doc, a: AnyAnimation): ExportJob {
  const bk = isAF(d) ? palette.sourceBk.value : (d as BKFile);
  return {
    options: {
      kind: docs.kind.value ?? 'af',
      animation: toRaw(a),
      animations: [...animationsOf(toRaw(d)).values()],
      script: toRaw(pb.script.value),
      background:
        o.background && bk
          ? { background: bk.background, backgroundWidth: bk.backgroundWidth }
          : null,
      playerOffset: palette.playerOffset.value,
      facingLeft: vp.toggles.flip,
      startTick: range.value.start,
      endTick: range.value.end,
      zoom: o.zoom,
      msPerTick: pb.ms.value,
    },
    format: o.format,
    palette: paletteRgb(palette.activePalette.value),
    plays: Math.max(0, Math.floor(o.plays || 0)),
  };
}

/** Asks before a render above LARGE_EXPORT_TICKS. */
async function confirmSize(): Promise<boolean> {
  return (
    ticks.value <= LARGE_EXPORT_TICKS ||
    confirm(
      'Large export',
      `This renders ${ticks.value.toLocaleString()} ticks, which can take a while and a lot of memory. Continue?`,
      'Export',
    )
  );
}

async function run(): Promise<void> {
  const d = docs.doc.value;
  const a = sel.animation.value;
  if (!d || !a || !(await confirmSize())) return;
  busy.value = true;
  progress.value = null;
  try {
    const r = await execute(buildJob(d, a));
    if (r.hasTransparency && r.transparentIndex === null)
      toasts.info('All 256 indices are used; transparent areas are written as index 0');
    download(`${docs.fileName.value}-${sel.animId.value}${r.suffix}`, r.bytes, r.mime);
    toasts.success(`Exported ${r.frames} frame(s)`);
    emit('close');
  } catch (e) {
    toasts.error(`Export failed: ${errorMessage(e)}`);
  } finally {
    stopWorker();
    busy.value = false;
    progress.value = null;
  }
}

function close(): void {
  stopWorker();
  emit('close');
}
onBeforeUnmount(stopWorker);
useModal({ open: () => true, panel, close });
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop-omf" @click.self="close">
      <div
        ref="panel"
        class="modal-panel p-3 small"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label="Export animation"
        data-testid="export-dialog"
      >
        <h5>Export animation</h5>
        <div class="mb-2">
          <label class="me-3"
            ><input v-model="o.format" type="radio" value="apng" data-testid="export.apng" /> APNG
            (lossless)</label
          >
          <label class="me-3"
            ><input v-model="o.format" type="radio" value="gif" data-testid="export.gif" />
            GIF</label
          >
          <label
            ><input v-model="o.format" type="radio" value="strip" data-testid="export.strip" /> PNG
            strip</label
          >
        </div>
        <label class="form-check"
          ><input v-model="o.background" type="checkbox" class="form-check-input" />
          background</label
        >
        <label class="me-3"
          >zoom
          <select v-model.number="o.zoom" class="form-select form-select-sm d-inline-block w-auto">
            <option v-for="z in 4" :key="z" :value="z">{{ z }}×</option>
          </select>
        </label>
        <label v-if="o.format !== 'strip'" class="me-3"
          >plays (0 = forever)
          <input
            v-model.number="o.plays"
            type="number"
            min="0"
            class="form-control form-control-sm d-inline-block"
            style="width: 5rem"
            data-testid="export.plays"
        /></label>
        <div class="mt-2">
          ticks
          <input
            v-model.number="o.start"
            type="number"
            min="0"
            class="form-control form-control-sm d-inline-block"
            style="width: 5rem"
            data-testid="export.start"
          />
          –
          <input
            v-model.number="o.end"
            type="number"
            min="1"
            class="form-control form-control-sm d-inline-block"
            style="width: 5rem"
            data-testid="export.end"
          />
          <span class="text-secondary"
            >of {{ total }} at {{ pb.ms.value }} ms per tick; uses the current palette, facing and
            timing</span
          >
        </div>
        <div v-if="o.format === 'gif'" class="text-secondary mt-1">
          GIF frames last at least 20 ms; faster ticks are combined.
        </div>
        <div v-if="busy" class="mt-2" data-testid="export.progress">
          <progress
            class="w-100"
            :max="progress?.total ?? 1"
            :value="progress?.done ?? 0"
            aria-label="Export progress"
          />
          <span class="text-secondary">{{
            progress ? `${progress.done} / ${progress.total} ticks` : 'Starting…'
          }}</span>
        </div>
        <div class="text-end mt-3">
          <button class="btn btn-sm btn-outline-secondary me-2" @click="close">Cancel</button>
          <button
            class="btn btn-sm btn-primary"
            :disabled="busy"
            data-testid="export.run"
            @click="run"
          >
            {{ busy ? 'Rendering…' : 'Export' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
