<script setup lang="ts">
// Resize dialog of the pixel editor (spec 13 §6). Mount it with v-if; it
// starts from the image's size and emits the resized image on OK.
import { computed, ref } from 'vue';
import IntField from '../widgets/IntField.vue';
import Thumb from '../Thumb.vue';
import { useModal } from '../../composables/useModal';
import * as px from '../../lib/pixels';

const props = defineProps<{ img: px.Img }>();
const emit = defineEmits<{
  close: [];
  /** `dx`/`dy` is the change to pos_x/pos_y that keeps the content in place. */
  resize: [r: { img: px.Img; dx: number; dy: number }];
}>();

const panel = ref<HTMLElement | null>(null);
useModal({ open: () => true, panel, close: () => emit('close') });

const ANCHORS: px.Anchor[] = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];
/** Sprite x/y and run lengths are 14-bit fields in the RLE stream (spec 04). */
const MAX_SIDE = 16383;

const { width: w0, height: h0 } = props.img;
const rs = ref({ w: w0, h: h0, anchor: 'b' as px.Anchor, allowLarge: w0 > 320 || h0 > 200 });
const maxW = computed(() => (rs.value.allowLarge ? MAX_SIDE : 320));
const maxH = computed(() => (rs.value.allowLarge ? MAX_SIDE : 200));
const valid = computed(
  () =>
    Number.isInteger(rs.value.w) &&
    Number.isInteger(rs.value.h) &&
    rs.value.w >= 1 &&
    rs.value.h >= 1 &&
    rs.value.w <= maxW.value &&
    rs.value.h <= maxH.value,
);
/** The resized image for the preview; skipped for huge sizes. */
const preview = computed(() =>
  valid.value && rs.value.w * rs.value.h <= 1 << 20
    ? px.resize(props.img, rs.value.w, rs.value.h, rs.value.anchor).img
    : null,
);

function ok(): void {
  if (!valid.value) return;
  emit('resize', px.resize(props.img, rs.value.w, rs.value.h, rs.value.anchor));
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop-omf" @click.self="emit('close')">
      <div
        ref="panel"
        class="modal-panel p-3"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label="Resize sprite"
        data-testid="resize-dialog"
      >
        <h5>Resize sprite</h5>
        <IntField v-model="rs.w" :min="1" :max="maxW" label="Width" testid="resize.w" />
        <IntField v-model="rs.h" :min="1" :max="maxH" label="Height" testid="resize.h" />
        <div class="small mt-2">Anchor</div>
        <div class="d-grid" style="grid-template-columns: repeat(3, 2rem); gap: 2px">
          <button
            v-for="a in ANCHORS"
            :key="a"
            class="btn btn-sm"
            :class="rs.anchor === a ? 'btn-primary' : 'btn-outline-secondary'"
            :data-testid="`resize.anchor.${a}`"
            @click="rs.anchor = a"
          >
            ●
          </button>
        </div>
        <label class="form-check small mt-2">
          <input
            v-model="rs.allowLarge"
            type="checkbox"
            class="form-check-input"
            data-testid="resize.large"
          />
          allow larger than 320×200, up to {{ MAX_SIDE }} (the game may not render it)
        </label>
        <div class="small mt-2" data-testid="resize.preview">
          <template v-if="preview">
            <Thumb :decoded="preview" :size="96" shift />
            <span class="text-secondary ms-2">{{ rs.w }}×{{ rs.h }}</span>
          </template>
          <span v-else-if="!valid" class="text-danger">1–{{ maxW }} × 1–{{ maxH }} pixels</span>
        </div>
        <div class="text-end mt-2">
          <button class="btn btn-sm btn-outline-secondary me-2" @click="emit('close')">
            Cancel
          </button>
          <button
            class="btn btn-sm btn-primary"
            :disabled="!valid"
            data-testid="resize.ok"
            @click="ok"
          >
            Resize
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
