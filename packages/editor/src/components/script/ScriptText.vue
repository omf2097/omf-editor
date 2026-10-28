<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Script } from '@omf/formats';
import EffectPicker from './EffectPicker.vue';
import { TAG_META, defaultTagValue } from '../../lib/tagMeta';
import { useDismiss } from '../../composables/useModal';

// Text mode of the Script tab (spec 15 §4). The textarea sits over a <pre>
// that colours the same text; the textarea text is transparent so only its
// caret shows. Typing commits after 150 ms idle; the parent's working string
// (useWorkingScript) then debounces the document commit on its own.

const props = defineProps<{
  text: string;
  script: Script;
}>();
const emit = defineEmits<{ change: [text: string] }>();
const area = ref<HTMLTextAreaElement | null>(null);
const local = ref(props.text);
const picker = ref(false);
const wrap = ref<HTMLElement | null>(null);
useDismiss(
  () => picker.value,
  wrap,
  () => (picker.value = false),
);
/** openomf stops the string at NUL, so a typed or pasted NUL is refused. */
const hasNul = computed(() => local.value !== props.text && local.value.includes('\0'));
let timer: ReturnType<typeof setTimeout> | null = null;

// Outside changes (undo, another string) replace the text, but not while the
// field has focus: what is typed there may be ahead of the prop (debounce).
watch(
  () => props.text,
  (t) => {
    if (t !== local.value && document.activeElement !== area.value) local.value = t;
  },
);

function commit(): void {
  if (!hasNul.value) emit('change', local.value);
}
function onInput(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(commit, 150);
}

interface Tok {
  t: string;
  cls: string;
}

const classOf = (c: string): string =>
  c >= 'A' && c <= 'Z'
    ? 'tok-frame'
    : (c >= 'a' && c <= 'z') || c === '=' || c === '+'
      ? 'tok-tag'
      : c >= '0' && c <= '9'
        ? 'tok-num'
        : c === '-'
          ? 'tok-sep'
          : 'tok-other';

/** Runs of characters with the same class. */
const tokens = computed<Tok[]>(() => {
  const s = local.value;
  const out: Tok[] = [];
  for (let i = 0; i < s.length; i++) {
    const cls = classOf(s[i]!);
    const last = out[out.length - 1];
    if (last && last.cls === cls) last.t += s[i];
    else out.push({ t: s[i]!, cls });
  }
  return out;
});

function onKey(e: KeyboardEvent): void {
  if (e.ctrlKey && e.code === 'Space') {
    e.preventDefault();
    picker.value = true;
  }
}

async function insert(key: string): Promise<void> {
  picker.value = false;
  const el = area.value;
  if (!el) return;
  const value = defaultTagValue(key);
  const code = key + (value === null ? '' : String(value));
  const at = el.selectionStart;
  local.value = local.value.slice(0, at) + code + local.value.slice(el.selectionEnd);
  commit();
  await nextTick();
  el.focus();
  el.setSelectionRange(at + code.length, at + code.length);
}
</script>

<template>
  <div>
    <div ref="wrap" class="position-relative script-text">
      <pre
        class="hl mono"
        aria-hidden="true"
      ><span v-for="(tk, i) in tokens" :key="i" :class="tk.cls">{{ tk.t }}</span>{{ '\n' }}</pre>
      <textarea
        ref="area"
        v-model="local"
        class="form-control mono"
        :class="{ 'is-invalid': hasNul }"
        spellcheck="false"
        rows="5"
        aria-label="Animation string"
        data-testid="script.text"
        @input="onInput"
        @blur="commit"
        @keydown="onKey"
      />
      <EffectPicker v-if="picker" :existing="[]" @pick="insert" @close="picker = false" />
    </div>
    <div v-if="hasNul" class="small text-danger mt-1" data-testid="script.text.nul">
      The text contains a NUL character, which ends the string in the game; it is not applied.
    </div>
    <ol class="small mt-2 mb-0 ps-4" data-testid="script.text.frames">
      <li v-for="(f, i) in script.frames" :key="i">
        <code>{{ f.key }}{{ f.duration }}</code>
        <span v-for="(t, ti) in f.tags" :key="ti" class="ms-2 text-secondary"
          >{{ TAG_META[t.key]?.label ?? t.key }}{{ t.value !== null ? ` ${t.value}` : '' }}</span
        >
      </li>
    </ol>
  </div>
</template>

<style scoped>
.script-text {
  font-size: 0.85rem;
}
.script-text textarea,
.script-text .hl {
  font-size: inherit;
  line-height: 1.5;
  padding: 0.375rem 0.75rem;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  border: 1px solid transparent;
}
.script-text textarea {
  position: relative;
  background: transparent;
  color: transparent;
  caret-color: var(--bs-body-color);
  resize: vertical;
}
.script-text .hl {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.tok-frame {
  color: var(--bs-primary);
  font-weight: 600;
}
.tok-tag {
  color: var(--bs-success);
}
.tok-num {
  color: var(--bs-body-color);
}
.tok-sep {
  color: var(--bs-secondary-color);
}
.tok-other,
.tok-plain {
  color: var(--bs-body-color);
}
</style>
