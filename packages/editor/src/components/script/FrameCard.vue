<script setup lang="ts">
import { computed, ref } from 'vue';
import { spriteIndexOfKey, spriteLetter, type Frame, type Script } from '@omf/formats';
import Icon from '../Icon.vue';
import Thumb from '../Thumb.vue';
import IntField from '../widgets/IntField.vue';
import EffectPicker from './EffectPicker.vue';
import FrameTagRow from './FrameTagRow.vue';
import { defaultTagValue, errataText } from '../../lib/tagMeta';
import * as ops from '../../lib/scriptOps';
import { usePlayback } from '../../composables/usePlayback';
import { useScriptEditor } from '../../composables/useScriptEditor';
import { useToasts } from '../../composables/useToasts';
import { useDismiss } from '../../composables/useModal';
import { inputValue } from '../../lib/util';

const props = defineProps<{
  script: Script;
  index: number;
  selected: boolean;
  dragTag: number | null;
}>();
const emit = defineEmits<{
  /** `select`: frame to select afterwards (the one acted on or created). */
  change: [s: Script, label?: string, select?: number];
  select: [];
  drag: [tag: number | null];
  remove: [];
}>();
const pb = usePlayback();
const ed = useScriptEditor();
/** One picker at a time; Ctrl+Space opens it on the selected frame (spec 15 §7). */
const picker = computed({
  get: () => ed.pickerFrame.value === props.index,
  set: (v: boolean) => {
    if (v) ed.pickerFrame.value = props.index;
    else if (ed.pickerFrame.value === props.index) ed.pickerFrame.value = null;
  },
});
const menu = ref(false);
const menuRoot = ref<HTMLElement | null>(null);
const pickerRoot = ref<HTMLElement | null>(null);
useDismiss(
  () => menu.value,
  menuRoot,
  () => (menu.value = false),
);
useDismiss(
  () => picker.value,
  pickerRoot,
  () => (picker.value = false),
);

const frame = computed<Frame>(() => props.script.frames[props.index]!);
const spriteIdx = computed(() => spriteIndexOfKey(frame.value.key));
// The sprites the letters show (the opponent's move 9 for the enemy string).
const sprites = computed(() => ed.sprites.value);
const spriteMissing = computed(() => spriteIdx.value >= sprites.value.length);
/** Frame keys are A–Z (openomf is_frame_id), so only the first 26 sprites can be shown. */
const MAX_KEYS = 26;
const choosable = computed(() => sprites.value.slice(0, MAX_KEYS));

function change(s: Script, label?: string, select?: number): void {
  emit('change', s, label, select);
}
function pick(key: string): void {
  picker.value = false;
  const next = ops.addTag(props.script, props.index, key, defaultTagValue(key));
  // addTag refuses a tag the frame already has, or one openomf would read
  // together with the frame's other tags as a different tag (spec 08).
  if (next.frames[props.index]!.tags.length === frame.value.tags.length) {
    useToasts().info(
      frame.value.tags.some((t) => t.key === key)
        ? `Frame ${props.index + 1} already has ${key}`
        : `${key} cannot go on frame ${props.index + 1}: openomf would read it with the frame's other effects as a different tag`,
    );
    return;
  }
  change(next, 'add effect');
}
function act(name: string): void {
  menu.value = false;
  const s = props.script;
  const i = props.index;
  const blank = { key: frame.value.key, duration: frame.value.duration, tags: [], erratas: [] };
  if (name === 'duplicate')
    change(ops.insertFrame(s, i + 1, frame.value), 'duplicate frame', i + 1);
  else if (name === 'before') change(ops.insertFrame(s, i, blank), 'insert frame', i);
  else if (name === 'after') change(ops.insertFrame(s, i + 1, blank), 'insert frame', i + 1);
  else if (name === 'up' && i > 0) change(ops.moveFrame(s, i, i - 1), 'move frame', i - 1);
  else if (name === 'down' && i < s.frames.length - 1)
    change(ops.moveFrame(s, i, i + 1), 'move frame', i + 1);
  else if (name === 'delete') emit('remove');
  else if (name === 'copyAll') change(ops.copyEffectsToAll(s, i), 'copy effects');
  else if (name === 'copy')
    ed.effectsClipboard.value = frame.value.tags
      .filter((t) => t.key !== '-')
      .map((t) => ({ ...t }));
  else if (name === 'paste' && ed.effectsClipboard.value)
    change(ops.pasteEffects(s, i, ed.effectsClipboard.value), 'paste effects');
}
</script>

<template>
  <div
    class="card frame-card"
    :class="{ 'border-primary': selected }"
    :data-testid="`script.frame.${index}`"
    @click="emit('select')"
  >
    <!-- One row per frame (spec 15 §3.2); the effects follow below it. -->
    <div class="frame-row">
      <strong class="frame-no" :title="`Frame ${index + 1}`" :data-testid="`frame.${index}.number`"
        ><span class="visually-hidden">Frame </span>{{ index + 1 }}</strong
      >
      <span class="frame-thumb">
        <Thumb
          v-if="!spriteMissing"
          :decoded="ed.decode(sprites[spriteIdx]!)"
          :size="28"
          shift
          :offset="ed.playerOffset.value"
        />
      </span>
      <select
        class="form-select form-select-sm frame-sprite"
        :class="{ 'is-invalid': spriteMissing && frame.key !== 'Z' }"
        :value="spriteIdx"
        aria-label="Sprite"
        :data-testid="`frame.${index}.sprite`"
        @change="
          change(ops.setSprite(script, index, Number(inputValue($event))), 'set frame sprite')
        "
      >
        <option v-if="spriteMissing" :value="spriteIdx">
          {{ frame.key }} ({{ frame.key === 'Z' ? 'nothing' : 'missing' }})
        </option>
        <option v-for="(s, i) in choosable" :key="i" :value="i">
          {{ spriteLetter(i) }} · {{ s.width }}×{{ s.height }}
        </option>
      </select>
      <span
        v-if="sprites.length > MAX_KEYS"
        class="frame-note text-secondary"
        :data-testid="`frame.${index}.sprite.limit`"
        :title="`Frame keys are A–Z; sprites ${MAX_KEYS + 1}–${sprites.length} cannot be shown by a frame`"
        >A–Z only</span
      >
      <IntField
        :model-value="frame.duration"
        :min="0"
        :max="32767"
        suffix="ticks"
        width="5.75rem"
        aria-label="Duration"
        :testid="`frame.${index}.duration`"
        @update:model-value="change(ops.setDuration(script, index, $event))"
      />
      <span class="frame-note text-secondary" :data-testid="`frame.${index}.ms`"
        >{{ frame.duration * pb.ms.value }} ms</span
      >
      <span
        v-for="e in frame.erratas"
        :key="e"
        class="chip-errata"
        :title="`Written ${errataText(e)}`"
      >
        {{ e === 'INVALID' ? 'lowercase key' : errataText(e) }}
        <button
          class="btn btn-link btn-sm p-0 ms-1 align-baseline"
          data-testid="frame.fix"
          @click.stop="change(ops.fixFrame(script, index), 'fix errata')"
        >
          fix
        </button>
      </span>
      <div ref="pickerRoot" class="position-relative ms-auto">
        <button
          class="btn btn-sm btn-outline-primary frame-add"
          aria-label="Add effect"
          title="Add effect"
          :data-testid="`frame.${index}.add-effect`"
          @click.stop="picker = !picker"
        >
          <Icon name="plus" /> Effect
        </button>
        <EffectPicker
          v-if="picker"
          class="end-0"
          :existing="frame.tags.map((t) => t.key)"
          @pick="pick"
          @close="picker = false"
          @click.stop
        />
      </div>
      <div ref="menuRoot" class="frame-actions position-relative">
        <button
          class="btn btn-sm btn-link p-0 text-secondary"
          aria-label="Move up"
          title="Move up"
          :disabled="index === 0"
          @click.stop="act('up')"
        >
          <Icon name="up" />
        </button>
        <button
          class="btn btn-sm btn-link p-0 text-secondary"
          aria-label="Move down"
          title="Move down"
          :disabled="index === script.frames.length - 1"
          @click.stop="act('down')"
        >
          <Icon name="down" />
        </button>
        <button
          class="btn btn-sm btn-link p-0 text-secondary"
          aria-label="Duplicate frame"
          title="Duplicate frame"
          :data-testid="`frame.${index}.duplicate`"
          @click.stop="act('duplicate')"
        >
          <Icon name="copy" />
        </button>
        <button
          class="btn btn-sm btn-link p-0 text-danger"
          aria-label="Delete frame"
          title="Delete frame"
          :data-testid="`frame.${index}.delete`"
          @click.stop="act('delete')"
        >
          <Icon name="trash" />
        </button>
        <button
          class="btn btn-sm btn-link p-0 text-secondary"
          aria-label="Frame menu"
          title="Frame menu"
          :data-testid="`frame.${index}.menu`"
          @click.stop="menu = !menu"
        >
          <Icon name="menu" />
        </button>
        <ul v-if="menu" class="dropdown-menu show end-0" style="top: 100%" @click.stop>
          <li>
            <button class="dropdown-item" data-testid="frame.menu.before" @click="act('before')">
              Insert frame before
            </button>
          </li>
          <li>
            <button class="dropdown-item" data-testid="frame.menu.after" @click="act('after')">
              Insert frame after
            </button>
          </li>
          <li><button class="dropdown-item" @click="act('copy')">Copy effects</button></li>
          <li>
            <button
              class="dropdown-item"
              :disabled="!ed.effectsClipboard.value"
              @click="act('paste')"
            >
              Paste effects
            </button>
          </li>
          <li>
            <button class="dropdown-item" @click="act('copyAll')">
              Copy effects to all frames
            </button>
          </li>
        </ul>
      </div>
    </div>
    <div v-if="frame.tags.length" class="frame-tags" :data-testid="`frame.${index}.tags`">
      <FrameTagRow
        v-for="(_, ti) in frame.tags"
        :key="ti"
        :script="script"
        :frame-index="index"
        :tag-index="ti"
        :armed="dragTag === ti"
        @change="change"
        @drag="emit('drag', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.frame-card {
  margin-bottom: 0.25rem;
}
/* The row has only a few pixels to spare at 1440 px, and how many depends on
   the font; the sprite select gives way rather than the actions wrapping. */
.frame-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1875rem 0.375rem;
}
.frame-no {
  min-width: 1.25rem;
  text-align: right;
  font-family: ui-monospace, monospace;
}
.frame-thumb {
  display: inline-flex;
  width: 28px;
  height: 28px;
}
.frame-sprite {
  width: auto;
  min-width: 4.5rem;
  padding-right: 1.75rem;
  background-position: right 0.375rem center;
}
.frame-row :deep(.input-group-text) {
  padding-inline: 0.375rem;
}
.frame-note {
  font-size: var(--omf-text-label);
  white-space: nowrap;
}
/* IntField leaves room under itself for form layouts; not in this row. */
.frame-row :deep(.int-field-wrap) {
  margin: 0 !important;
}
.frame-add {
  white-space: nowrap;
}
.frame-actions {
  display: flex;
  gap: 0.125rem;
}
.frame-tags {
  padding: 0 0.375rem 0.125rem calc(0.375rem + 1.25rem + 0.25rem);
}
</style>
