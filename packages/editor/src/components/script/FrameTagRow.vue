<script setup lang="ts">
import { computed } from 'vue';
import type { Script, Tag } from '@omf/formats';
import Icon from '../Icon.vue';
import EffectValue from './EffectValue.vue';
import { DRAG_TAGS, TAG_META, errataText, tagInfo } from '../../lib/tagMeta';
import * as ops from '../../lib/scriptOps';
import { usePlayback } from '../../composables/usePlayback';

// One effect (tag) of a frame card: label, value widget, raw code, erratas
// with their fix, the drag-on-canvas toggle and remove (spec 15 §3.2).

const props = defineProps<{
  script: Script;
  frameIndex: number;
  tagIndex: number;
  /** This tag is the one being dragged on the canvas. */
  armed: boolean;
}>();
const emit = defineEmits<{
  change: [s: Script, label?: string];
  /** Arm this tag for dragging (its index), or disarm (null). */
  drag: [tag: number | null];
}>();

const t = computed<Tag>(() => props.script.frames[props.frameIndex]!.tags[props.tagIndex]!);
const info = computed(() => tagInfo(t.value.key));
const pb = usePlayback();
/** `e` (move to the other fighter) is previewed where there is one: the paired enemy-string preview. */
const previewed = computed(
  () => info.value.previewed || (t.value.key === 'e' && !!pb.enemy.value?.pair),
);
const arg = computed(() => TAG_META[t.value.key]?.arg);
const label = computed(() => TAG_META[t.value.key]?.label ?? t.value.key);
const testid = computed(() => `frame.${props.frameIndex}.tag.${props.tagIndex}`);

function change(s: Script, label?: string): void {
  emit('change', s, label);
}
</script>

<template>
  <div class="tag-row" :data-testid="testid">
    <span class="tag-label text-truncate" :title="info.desc || t.key">
      <template v-if="t.key === '-'">Stray “-”</template>
      <template v-else>{{
        info.meta?.category === 'advanced' ? `Advanced: ${t.key}` : label
      }}</template>
    </span>
    <EffectValue
      v-if="t.value !== null && arg"
      :value="t.value"
      :arg="arg"
      :label="label"
      :testid="`${testid}.value`"
      @change="change(ops.setTagValue(script, frameIndex, tagIndex, $event))"
    />
    <code class="text-secondary small" :data-testid="`${testid}.code`"
      >{{ t.key }}{{ t.value ?? '' }}</code
    >
    <span
      v-if="!previewed && t.key !== '-'"
      class="badge text-bg-light border"
      title="The preview does not simulate this effect"
      :data-testid="`${testid}.no-preview`"
      >no preview</span
    >
    <span v-for="e in t.erratas" :key="e" class="chip-errata">
      {{ errataText(e) }}
      <button
        v-if="e !== 'INVALID' || t.key === '-'"
        class="btn btn-link btn-sm p-0 ms-1 align-baseline"
        :data-testid="`${testid}.fix`"
        @click.stop="change(ops.fixTag(script, frameIndex, tagIndex), 'fix errata')"
      >
        fix
      </button>
    </span>
    <button
      v-if="DRAG_TAGS.has(t.key) && t.value !== null"
      class="btn btn-sm p-0 px-1"
      :class="armed ? 'btn-warning' : 'btn-outline-secondary'"
      title="Drag on the canvas to set this value"
      :aria-pressed="armed"
      :data-testid="`${testid}.drag`"
      @click.stop="emit('drag', armed ? null : tagIndex)"
    >
      <Icon name="move" />
    </button>
    <button
      class="btn btn-sm btn-link p-0 text-danger ms-auto"
      :aria-label="`Remove ${t.key}`"
      :data-testid="`${testid}.remove`"
      @click.stop="change(ops.removeTag(script, frameIndex, tagIndex), 'remove effect')"
    >
      <Icon name="trash" />
    </button>
  </div>
</template>

<style scoped>
/* Compact: label, value, code and buttons fit one line of a frame card. */
.tag-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.125rem 0.375rem;
  min-height: 1.75rem;
}
.tag-label {
  width: 10rem;
}
</style>
