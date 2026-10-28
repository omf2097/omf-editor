<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  AF_MOVE_STRING_BYTES,
  analyzeTriggers,
  cp437Length,
  directionArrow,
  formatTrigger,
  parseTrigger,
  triggerNotation,
  type TriggerButton,
} from '@omf/formats';
import Icon from './Icon.vue';
import FieldCode from './widgets/FieldCode.vue';
import TriggerTry from './TriggerTry.vue';
import { useDocument } from '../composables/useDocument';
import { animationLabel, isAF } from '../lib/doc';
import { inputValue } from '../lib/util';

// Editor of an AF move's move_string, the input that triggers the move (spec 18).
// A sequence is the button then numpad directions, most recent first, for a
// HAR facing right: "P632" is 2, 3, 6, punch. Anything else (e.g. "!") is a
// special value that never matches input and is kept verbatim.

const props = defineProps<{ moveId: number; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [v: string] }>();
const router = useRouter();
const docs = useDocument();

const parsed = computed(() => parseTrigger(props.modelValue));
const isSeq = computed(() => parsed.value.kind === 'sequence');
/** Directions in input order, oldest first (the file stores them reversed). */
const dirs = computed(() => (parsed.value.kind === 'sequence' ? parsed.value.directions : ''));
const button = computed<TriggerButton>(() =>
  parsed.value.kind === 'sequence' ? parsed.value.button : 'P',
);
const bytes = computed(() => cp437Length(props.modelValue));
const hint = ref('');
/** Last special value, so switching back restores it. */
const lastSpecial = ref(parsed.value.kind === 'special' ? props.modelValue : '!');

function emitSeq(b: TriggerButton, d: string): void {
  const s = formatTrigger({ kind: 'sequence', button: b, directions: d });
  if (cp437Length(s) > AF_MOVE_STRING_BYTES) {
    hint.value = `At most ${AF_MOVE_STRING_BYTES - 1} directions fit`;
    return;
  }
  hint.value = '';
  emit('update:modelValue', s);
}

function setMode(seq: boolean): void {
  if (seq === isSeq.value) return;
  if (seq) {
    lastSpecial.value = props.modelValue;
    emitSeq('P', '');
  } else {
    emit('update:modelValue', lastSpecial.value || '!');
  }
}

function append(d: string): void {
  if (dirs.value.endsWith(d)) {
    hint.value = 'The game collapses repeated directions, so a repeat can never match';
    return;
  }
  emitSeq(button.value, dirs.value + d);
}
function removeAt(i: number): void {
  emitSeq(button.value, dirs.value.slice(0, i) + dirs.value.slice(i + 1));
}
function backspace(): void {
  emitSeq(button.value, dirs.value.slice(0, -1));
}

// Reordering the direction chips by HTML drag and drop.
let dragFrom = -1;
function onDragStart(e: DragEvent, i: number): void {
  dragFrom = i;
  // Firefox starts an HTML drag only when data is set.
  e.dataTransfer?.setData('text/plain', String(i));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDragEnd(): void {
  dragFrom = -1;
}
function onDrop(to: number): void {
  const from = dragFrom;
  dragFrom = -1;
  if (from < 0 || from === to) return;
  const a = [...dirs.value];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x!);
  emitSeq(button.value, a.join(''));
}

function onPadKey(e: KeyboardEvent): void {
  const k = e.key;
  if (/^[1-9]$/.test(k)) {
    e.preventDefault();
    append(k);
  } else if (k === 'p' || k === 'P') {
    e.preventDefault();
    emitSeq('P', dirs.value);
  } else if (k === 'k' || k === 'K') {
    e.preventDefault();
    emitSeq('K', dirs.value);
  } else if (k === 'Backspace') {
    e.preventDefault();
    backspace();
  } else if (k === 'Escape') {
    (e.target as HTMLElement).blur();
  }
}

/** The raw field as typed; only a value that fits (cp437, ≤ 21 bytes) is emitted. */
const rawText = ref(props.modelValue);
watch(
  () => props.modelValue,
  (v) => (rawText.value = v),
);
function onRaw(e: Event): void {
  const v = inputValue(e);
  rawText.value = v;
  if (cp437Length(v) < 0 || cp437Length(v) > AF_MOVE_STRING_BYTES) return;
  emit('update:modelValue', v);
}

const conflicts = computed(() => {
  const d = docs.doc.value;
  if (!d || !isAF(d)) return [];
  return analyzeTriggers(d).filter((i) => i.moveId === props.moveId);
});

/** The direction pad, laid out like a numpad. */
const PAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

// The component is reused across moves: nothing of the previous move may leak.
watch(
  () => props.moveId,
  () => {
    lastSpecial.value = parsed.value.kind === 'special' ? props.modelValue : '!';
    hint.value = '';
    rawText.value = props.modelValue;
    dragFrom = -1;
  },
);
</script>

<template>
  <div class="mb-2" data-testid="trigger">
    <div class="d-flex gap-3 align-items-center mb-1 small">
      <label class="form-check mb-0">
        <input
          class="form-check-input"
          type="radio"
          :checked="!isSeq"
          data-testid="trigger.mode.special"
          @change="setMode(false)"
        />
        Not triggered by input
      </label>
      <label class="form-check mb-0">
        <input
          class="form-check-input"
          type="radio"
          :checked="isSeq"
          data-testid="trigger.mode.sequence"
          @change="setMode(true)"
        />
        Input sequence
      </label>
      <span
        class="ms-auto field-code"
        :class="{ 'text-danger': bytes > AF_MOVE_STRING_BYTES }"
        data-testid="trigger.bytes"
      >
        {{ bytes }}/{{ AF_MOVE_STRING_BYTES }} bytes
      </span>
    </div>

    <div v-if="isSeq" class="d-flex gap-3 flex-wrap align-items-start">
      <div
        class="d-grid border rounded p-1"
        style="grid-template-columns: repeat(3, 2.2rem); gap: 2px"
        tabindex="0"
        aria-label="Direction pad: digits or numpad add a direction, P or K set the button, Backspace removes"
        data-testid="trigger.pad"
        @keydown="onPadKey"
      >
        <button
          v-for="d in PAD"
          :key="d"
          class="btn btn-sm btn-outline-secondary p-0"
          :title="`${d} (${directionArrow(d)})`"
          :data-testid="`trigger.pad.${d}`"
          tabindex="-1"
          @click="append(d)"
        >
          {{ directionArrow(d) }}<sub class="text-secondary">{{ d }}</sub>
        </button>
      </div>
      <div class="flex-grow-1">
        <div class="d-flex align-items-center gap-1 flex-wrap mb-1" data-testid="trigger.chips">
          <span class="small text-secondary me-1">oldest →</span>
          <span
            v-for="(d, i) in dirs"
            :key="`${i}${d}`"
            class="badge text-bg-secondary mono"
            role="button"
            tabindex="0"
            draggable="true"
            :title="`Remove ${d}`"
            :aria-label="`Remove direction ${d} (${directionArrow(d)})`"
            :data-testid="`trigger.chip.${i}`"
            @click="removeAt(i)"
            @keydown.enter.space.delete.prevent="removeAt(i)"
            @dragstart="onDragStart($event, i)"
            @dragend="onDragEnd"
            @dragover.prevent
            @drop.prevent="onDrop(i)"
          >
            {{ directionArrow(d) }} {{ d }}
          </span>
          <span class="small">+</span>
          <div class="btn-group btn-group-sm">
            <button
              class="btn"
              :class="button === 'P' ? 'btn-primary' : 'btn-outline-primary'"
              data-testid="trigger.button.P"
              @click="emitSeq('P', dirs)"
            >
              P
            </button>
            <button
              class="btn"
              :class="button === 'K' ? 'btn-primary' : 'btn-outline-primary'"
              data-testid="trigger.button.K"
              @click="emitSeq('K', dirs)"
            >
              K
            </button>
          </div>
          <button
            class="btn btn-sm btn-link text-secondary"
            aria-label="Remove last"
            :disabled="!dirs"
            data-testid="trigger.backspace"
            @click="backspace"
          >
            <Icon name="backspace" />
          </button>
          <button
            class="btn btn-sm btn-link text-secondary"
            :disabled="!dirs"
            data-testid="trigger.clear"
            @click="emitSeq(button, '')"
          >
            clear
          </button>
        </div>
        <div class="small">
          Notation <code data-testid="trigger.notation">{{ triggerNotation(parsed) }}</code>
          <span class="text-secondary ms-2">→ is toward the opponent</span>
        </div>
        <div v-if="hint" class="small text-warning" data-testid="trigger.hint">{{ hint }}</div>
      </div>
    </div>

    <label class="d-flex align-items-center gap-2 small mt-1" title="move_string">
      Raw <FieldCode name="move_string" />
      <input
        class="form-control form-control-sm mono"
        style="width: 12rem"
        :value="modelValue"
        aria-label="Raw move_string"
        :class="{
          'is-invalid': cp437Length(rawText) < 0 || cp437Length(rawText) > AF_MOVE_STRING_BYTES,
        }"
        data-testid="trigger.raw"
        @input="onRaw"
      />
      <span v-if="!isSeq" class="text-secondary">preserved as is</span>
    </label>

    <ul v-if="conflicts.length" class="small mb-1 mt-1 ps-3" data-testid="trigger.conflicts">
      <li
        v-for="(c, i) in conflicts"
        :key="i"
        :class="c.severity === 'warning' ? 'text-warning' : 'text-secondary'"
      >
        {{ c.message }}
        <a
          v-if="c.otherId !== undefined"
          href="#"
          @click.prevent="router.push({ name: 'anim-overview', params: { id: c.otherId } })"
        >
          {{ animationLabel('af', c.otherId) }}
        </a>
      </li>
    </ul>

    <TriggerTry :move-id="moveId" />
  </div>
</template>
