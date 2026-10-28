<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useResizeObserver } from '@vueuse/core';
import { LIMITS, normaliseScript, totalTicks, type Script } from '@omf/formats';
import ScenePreview from '../components/scene/ScenePreview.vue';
import Timeline from '../components/script/Timeline.vue';
import FrameCard from '../components/script/FrameCard.vue';
import ScriptText from '../components/script/ScriptText.vue';
import Icon from '../components/Icon.vue';
import EnemyStringPanel from '../components/script/EnemyStringPanel.vue';
import { useSelection } from '../composables/useSelection';
import { usePlayback } from '../composables/usePlayback';
import { useScriptEditor } from '../composables/useScriptEditor';
import { useAnimationEdit } from '../composables/useAnimationEdit';
import { useConfirm } from '../composables/useConfirm';
import { useShortcuts, type Shortcut } from '../composables/useShortcuts';
import { useDocument } from '../composables/useDocument';
import { useTagDrag } from '../composables/useTagDrag';
import { useEnemyScene } from '../composables/useEnemyScene';
import type { ScriptTarget } from '../composables/useWorkingScript';
import * as ops from '../lib/scriptOps';
import { isAF } from '../lib/doc';
import { EXTRA_STRING_SELECTORS } from '@omf/formats';
import { inputValue } from '../lib/util';

// Script tab (spec 15): the animation string being edited, shown as a timeline
// and frame cards (visual) or as text. Edits are scriptOps functions on the
// parsed script; only the frames they touch lose their source spelling (spec 15 §3.2).

// The preview stays in view while scrolling the frames, but only when it sits
// beside them: on a narrow window the row wraps, the preview lands above the
// frames, and a sticky preview would cover them.
const view = ref<HTMLElement | null>(null);
const previewCol = ref<HTMLElement | null>(null);
const framesCol = ref<HTMLElement | null>(null);
const sideBySide = ref(true);
useResizeObserver(view, () => {
  const p = previewCol.value;
  const f = framesCol.value;
  sideBySide.value = !p || !f || f.offsetTop < p.offsetTop + p.offsetHeight;
});

const route = useRoute();
const sel = useSelection();
const pb = usePlayback();
const ed = useScriptEditor();
const anim = useAnimationEdit(() => sel.animId.value);
const { confirm } = useConfirm();
const shortcuts = useShortcuts();
const docs = useDocument();

const mode = ref<'visual' | 'text'>('visual');
const cards = ref<HTMLElement | null>(null);

const script = computed(() => ed.script.value);
const seconds = computed(() =>
  script.value ? ((totalTicks(script.value) * pb.ms.value) / 1000).toFixed(1) : '0',
);
const extras = computed(() => sel.animation.value?.extraStrings ?? []);
/** AF moves have an enemy string, played on the opponent (spec 15 §6.1). */
const hasEnemy = computed(() => !!docs.doc.value && isAF(docs.doc.value));
const enemyScene = useEnemyScene();
/** AF: which extra_string_selector value picks the extra strings (spec 15 §6). */
const selector = computed(() => {
  const d = docs.doc.value;
  if (!d || !isAF(d) || sel.animId.value === null) return null;
  return (
    EXTRA_STRING_SELECTORS.find(
      (s) => s.value === d.moves.get(sel.animId.value!)?.extraStringSelector,
    )?.name ?? null
  );
});

function apply(s: Script, label?: string): void {
  ed.apply(s, label);
}

watch(
  () => pb.state.value.frameIndex,
  (i) => {
    if (pb.playing.value) ed.selectedFrame.value = i;
  },
);
watch(script, (s) => {
  if (s && ed.selectedFrame.value >= s.frames.length)
    ed.selectedFrame.value = Math.max(0, s.frames.length - 1);
});

const { dragTag, startDrag, stopDrag, onPointer } = useTagDrag();

/** Selects frame `i`, clamped to the frames there are. */
function selectFrame(i: number): void {
  i = Math.max(0, Math.min(i, (script.value?.frames.length ?? 1) - 1));
  if (dragTag.value !== null && i !== ed.selectedFrame.value) stopDrag();
  ed.selectFrame(i);
  void nextTick(() =>
    cards.value
      ?.querySelector(`[data-testid="script.frame.${i}"]`)
      ?.scrollIntoView({ block: 'nearest' }),
  );
}

function onDuration(i: number, d: number): void {
  if (script.value) apply(ops.setDuration(script.value, i, d));
}
function onMove(a: number, b: number): void {
  if (!script.value) return;
  apply(ops.moveFrame(script.value, a, b), 'move frame');
  selectFrame(b);
}
function onCardChange(s: Script, label?: string, select?: number): void {
  apply(s, label);
  if (select !== undefined) selectFrame(select);
}

/** Adds a frame after `after` with its sprite and duration and no tags. */
function addFrame(after = ed.selectedFrame.value): void {
  const s = script.value;
  if (!s) return;
  const prev = s.frames[after] ?? s.frames[s.frames.length - 1];
  const f = { key: prev?.key ?? 'A', duration: prev?.duration ?? 10, tags: [], erratas: [] };
  const at = s.frames.length === 0 ? 0 : after + 1;
  apply(ops.insertFrame(s, at, f), 'add frame');
  selectFrame(at);
}

async function deleteFrame(i = ed.selectedFrame.value): Promise<void> {
  if (!script.value?.frames[i]) return;
  if (!(await confirm('Delete frame?', `Delete frame ${i + 1}?`, 'Delete'))) return;
  // The script may have changed while the dialog was open.
  const s = script.value;
  if (!s?.frames[i]) return;
  const selected = ed.selectedFrame.value;
  apply(ops.deleteFrame(s, i), 'delete frame');
  // Keep the selected frame selected when an earlier one goes.
  selectFrame(selected > i ? selected - 1 : selected);
}

function duplicateSelected(): void {
  const s = script.value;
  const i = ed.selectedFrame.value;
  const f = s?.frames[i];
  if (!s || !f) return;
  apply(ops.insertFrame(s, i + 1, f), 'duplicate frame');
  selectFrame(i + 1);
}

async function normalise(): Promise<void> {
  const s = script.value;
  if (!s) return;
  if (
    !(await confirm(
      'Normalise string',
      'Rewrite every frame in canonical form (no leading zeros or plus signs) and remove the text openomf drops?',
      'Normalise',
    ))
  )
    return;
  apply(normaliseScript(s), 'normalise script');
}

function moveSelected(delta: number): void {
  const s = script.value;
  if (!s) return;
  const i = ed.selectedFrame.value;
  const j = i + delta;
  if (j < 0 || j >= s.frames.length) return;
  apply(ops.moveFrame(s, i, j), 'move frame');
  selectFrame(j);
}

// ----------------------------------------------------- extra strings
// The string being edited is the playback source, so the preview plays it.
// Switching commits the pending edit of the old one first.
function setTarget(v: string): void {
  ed.flush();
  pb.source.value = v === 'base' || v === 'enemy' ? v : Number(v);
  ed.selectedFrame.value = 0;
}
/** openomf SD_EXTRASTR_COUNT_MAX */
const canAddExtra = computed(() => extras.value.length < LIMITS.extraStrings);
function addExtra(): void {
  if (!canAddExtra.value) return;
  ed.flush();
  const n = extras.value.length;
  anim.edit('add extra string', (a) => {
    a.extraStrings = [...a.extraStrings, 'A1'];
  });
  pb.source.value = n;
}
async function removeExtra(): Promise<void> {
  const t = pb.source.value;
  if (typeof t !== 'number') return;
  if (!(await confirm('Delete extra string?', `Delete extra string ${t}?`, 'Delete'))) return;
  ed.flush();
  pb.source.value = 'base';
  anim.edit('delete extra string', (a) => {
    a.extraStrings = a.extraStrings.filter((_, i) => i !== t);
  });
}

/**
 * ?string=base|K|enemy[&frame=N]: that string (base when not given), on frame
 * N. Without either the view keeps the string playback is on.
 */
function openFromQuery(): void {
  const qf = Number(route.query.frame);
  const frame = route.query.frame !== undefined && Number.isInteger(qf) && qf >= 0 ? qf : null;
  const qs = route.query.string;
  if (frame === null && qs === undefined) return;
  const k = Number(qs);
  const target: ScriptTarget =
    qs === 'enemy' && hasEnemy.value
      ? 'enemy'
      : qs !== undefined &&
          qs !== 'base' &&
          Number.isInteger(k) &&
          k >= 0 &&
          k < extras.value.length
        ? k
        : 'base';
  if (pb.source.value !== target) setTarget(String(target));
  if (frame !== null) selectFrame(frame);
}

/** Spec 15 §7. */
function scriptShortcuts(): Omit<Shortcut, 'scope'>[] {
  return [
    {
      keys: 'Ctrl+Shift+Enter',
      label: 'Ctrl+Shift+Enter',
      description: 'Add a frame after the selected one',
      run: () => addFrame(),
    },
    {
      keys: 'Ctrl+KeyD',
      label: 'Ctrl+D',
      description: 'Duplicate the selected frame',
      run: duplicateSelected,
    },
    {
      keys: 'Ctrl+Space',
      label: 'Ctrl+Space',
      description: 'Add an effect to the selected frame (in text mode: at the caret)',
      run: () => {
        if (mode.value === 'visual' && script.value?.frames[ed.selectedFrame.value])
          ed.pickerFrame.value = ed.selectedFrame.value;
      },
    },
    {
      keys: 'Alt+ArrowUp',
      label: 'Alt+↑',
      description: 'Move the selected frame earlier',
      run: () => moveSelected(-1),
    },
    {
      keys: 'Alt+ArrowDown',
      label: 'Alt+↓',
      description: 'Move the selected frame later',
      run: () => moveSelected(1),
    },
    {
      keys: 'Delete',
      label: 'Delete',
      description: 'Delete the selected frame',
      run: () => void deleteFrame(),
    },
    {
      keys: 'KeyL',
      label: 'L',
      description: 'Loop the selected frame',
      run: () => (pb.holdFrame.value = pb.holdFrame.value === null ? ed.selectedFrame.value : null),
    },
    {
      keys: 'Ctrl+KeyM',
      label: 'Ctrl+M',
      description: 'Switch between visual and text mode',
      run: () => (mode.value = mode.value === 'visual' ? 'text' : 'visual'),
      inInputs: true,
    },
    {
      keys: 'Escape',
      label: 'Esc',
      description: 'Stop dragging a value on the canvas',
      run: stopDrag,
    },
  ];
}

let off: (() => void)[] = [];
onMounted(() => {
  openFromQuery();
  off = [shortcuts.activate('script'), shortcuts.register('script', scriptShortcuts())];
});
onBeforeUnmount(() => {
  off.forEach((f) => f());
  ed.pickerFrame.value = null;
  ed.flush();
  pb.holdFrame.value = null;
});
</script>

<template>
  <div
    v-if="sel.animation.value"
    ref="view"
    class="view-pad d-flex gap-3 flex-wrap align-items-start"
    data-testid="view.script"
  >
    <div
      ref="previewCol"
      class="scene-preview"
      :style="sideBySide ? { position: 'sticky', top: '0.5rem' } : undefined"
      data-testid="script.preview-column"
    >
      <ScenePreview
        :animation="sel.animation.value"
        :anim-id="sel.animId.value!"
        show-hold
        :interactive="dragTag !== null"
        :enemy="enemyScene"
        @pointer="onPointer"
      />
      <div
        v-if="dragTag !== null"
        class="alert alert-warning py-1 px-2 small mt-2"
        data-testid="script.drag-hint"
      >
        Drag on the canvas to set the value.
        <button class="btn btn-link btn-sm p-0 align-baseline" @click="stopDrag">Done</button>
      </div>
    </div>

    <div ref="framesCol" style="flex: 1 1 420px; min-width: 0; max-width: 760px">
      <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <div class="btn-group btn-group-sm" role="group" aria-label="Editor mode">
          <button
            class="btn"
            :class="mode === 'visual' ? 'btn-secondary' : 'btn-outline-secondary'"
            data-testid="script.mode.visual"
            @click="mode = 'visual'"
          >
            Visual
          </button>
          <button
            class="btn"
            :class="mode === 'text' ? 'btn-secondary' : 'btn-outline-secondary'"
            data-testid="script.mode.text"
            @click="mode = 'text'"
          >
            Text
          </button>
        </div>
        <select
          class="form-select form-select-sm"
          style="width: auto"
          :value="String(pb.source.value)"
          aria-label="String"
          data-testid="script.target"
          @change="setTarget(inputValue($event))"
        >
          <option value="base">Base string</option>
          <option v-for="(_, i) in extras" :key="i" :value="String(i)">Extra string {{ i }}</option>
          <option v-if="hasEnemy" value="enemy">Enemy string</option>
        </select>
        <button
          class="btn btn-sm btn-outline-secondary"
          :title="
            canAddExtra
              ? 'Add an extra string'
              : `openomf reads at most ${LIMITS.extraStrings} extra strings`
          "
          :disabled="!canAddExtra"
          data-testid="script.extra.add"
          @click="addExtra"
        >
          <Icon name="plus" /> extra
        </button>
        <button
          v-if="typeof pb.source.value === 'number'"
          class="btn btn-sm btn-outline-danger"
          aria-label="Delete extra string"
          data-testid="script.extra.delete"
          @click="removeExtra"
        >
          <Icon name="trash" />
        </button>
        <span v-if="typeof pb.source.value === 'number' && selector" class="small text-secondary"
          >selected by {{ selector }}</span
        >
        <span
          v-if="pb.source.value === 'enemy'"
          class="small text-secondary"
          data-testid="script.enemy-note"
          >played on the opponent</span
        >
        <span class="ms-auto small" data-testid="script.summary">
          <template v-if="script">
            <span class="text-success">✓</span> {{ script.frames.length }} frames ·
            {{ totalTicks(script) }} ticks · {{ seconds }} s
          </template>
          <span v-else class="text-danger">Does not parse</span>
          <span
            v-if="pb.source.value === 'enemy' || ed.bytes.value.used > ed.bytes.value.max"
            :class="ed.bytes.value.used > ed.bytes.value.max ? 'text-danger' : 'text-secondary'"
            data-testid="script.bytes"
          >
            · {{ ed.bytes.value.used }}/{{ ed.bytes.value.max }} bytes</span
          >
        </span>
      </div>
      <div
        v-if="ed.bytes.value.used > ed.bytes.value.max"
        class="alert alert-danger py-1 px-2 small"
        data-testid="script.too-long"
      >
        openomf refuses strings longer than {{ ed.bytes.value.max }} bytes; the file cannot be saved
        until this one is shorter.
      </div>

      <EnemyStringPanel v-if="pb.source.value === 'enemy'" />
      <ul
        v-if="ed.diagnostics.value.some((d) => d.severity !== 'error')"
        class="small mb-2 ps-3"
        data-testid="script.diagnostics"
      >
        <li
          v-for="(d, i) in ed.diagnostics.value.filter((x) => x.severity !== 'error')"
          :key="i"
          :class="d.severity === 'warning' ? 'text-warning' : 'text-secondary'"
        >
          <template v-if="d.frame !== undefined">Frame {{ d.frame + 1 }}: </template>{{ d.message }}
        </li>
      </ul>

      <template v-if="mode === 'visual' && script">
        <Timeline
          :script="script"
          :selected="ed.selectedFrame.value"
          :tick="Math.max(0, pb.state.value.tick)"
          :sprite-count="ed.spriteCount.value"
          @select="selectFrame"
          @duration="onDuration"
          @move="onMove"
        />
        <div ref="cards">
          <FrameCard
            v-for="(_, i) in script.frames"
            :key="i"
            :script="script"
            :index="i"
            :selected="i === ed.selectedFrame.value"
            :drag-tag="i === ed.selectedFrame.value ? dragTag : null"
            @change="onCardChange"
            @remove="deleteFrame(i)"
            @select="ed.selectedFrame.value !== i && selectFrame(i)"
            @drag="
              (t) => {
                selectFrame(i);
                startDrag(t);
              }
            "
          />
        </div>
        <div class="d-flex gap-2">
          <button
            class="btn btn-sm btn-outline-primary"
            data-testid="script.add-frame"
            @click="addFrame()"
          >
            <Icon name="plus" /> Add frame
          </button>
          <button
            class="btn btn-sm btn-outline-secondary"
            data-testid="script.normalise"
            @click="normalise"
          >
            Normalise text
          </button>
        </div>
      </template>
      <ScriptText v-else :text="ed.text.value" :script="script" @change="ed.setText" />
    </div>
  </div>
</template>
