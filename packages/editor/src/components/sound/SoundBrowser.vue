<script setup lang="ts">
import { computed, ref } from 'vue';
import { soundDurationMs, soundSampleRate, soundToWav } from '@omf/formats';
import Icon from '../Icon.vue';
import { download } from '../../lib/files';
import Waveform from './Waveform.vue';
import SoundPlayButton from './SoundPlayButton.vue';
import { useSounds } from '../../composables/useSounds';
import { useDocument } from '../../composables/useDocument';
import { useModal } from '../../composables/useModal';

/**
 * Sound table entries are bytes (value = SOUNDS.DAT index + 1), so entries
 * from 255 on cannot be referenced.
 */
const MAX_VALUE = 255;

const props = defineProps<{ slotIndex: number; value: number }>();
const emit = defineEmits<{ pick: [value: number]; close: [] }>();
const sounds = useSounds();
const docs = useDocument();
const showEmpty = ref(false);
const filter = ref('');
const panel = ref<HTMLElement | null>(null);

/** Table value → slots of this file holding it (0: the silent slots). */
const slotsByValue = computed(() => {
  const m = new Map<number, number[]>();
  (docs.doc.value?.soundTable ?? []).forEach((v, slot) => {
    m.set(v, [...(m.get(v) ?? []), slot]);
  });
  return m;
});

const rows = computed(() =>
  (sounds.sounds.value ?? [])
    .map((s, id) => ({
      id,
      value: id + 1,
      sound: s,
      empty: s.data.length === 0,
      ms: Math.round(soundDurationMs(s)),
      rate: s.data.length ? soundSampleRate(s.freqKey) : 0,
      slots: slotsByValue.value.get(id + 1) ?? [],
    }))
    .filter((r) => r.value <= MAX_VALUE)
    .filter((r) => showEmpty.value || !r.empty || r.value === props.value)
    .filter((r) => !filter.value.trim() || String(r.value).includes(filter.value.trim())),
);

function exportWav(value: number): void {
  const s = sounds.sounds.value?.[value - 1];
  if (s) download(`sound-${value}.wav`, soundToWav(s), 'audio/wav');
}

/** Sounds of SOUNDS.DAT the table cannot reach. */
const unreachable = computed(() => Math.max(0, (sounds.sounds.value?.length ?? 0) - MAX_VALUE));

useModal({
  open: () => true,
  panel,
  close: () => emit('close'),
  initialFocus: () =>
    panel.value?.querySelector<HTMLElement>(
      '[data-current="true"] [data-testid^="sound-browser.use."]',
    ),
});
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop-omf" @click.self="emit('close')">
      <div
        ref="panel"
        tabindex="-1"
        class="modal-panel p-3 small d-flex flex-column"
        style="width: min(720px, calc(100vw - 2rem))"
        role="dialog"
        aria-modal="true"
        :aria-label="`Choose a sound for slot ${slotIndex}`"
        data-testid="sound-browser"
      >
        <div class="d-flex align-items-center gap-2 mb-2">
          <h6 class="m-0 me-auto">Sound for slot {{ slotIndex }}</h6>
          <input
            v-model="filter"
            class="form-control form-control-sm"
            style="width: 8rem"
            placeholder="Number"
            aria-label="Filter by sound number"
            data-testid="sound-browser.filter"
          />
          <label class="form-check-label d-inline-flex align-items-center gap-1">
            <input
              v-model="showEmpty"
              type="checkbox"
              class="form-check-input m-0"
              data-testid="sound-browser.show-empty"
            />
            empty entries
          </label>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            data-testid="sound-browser.close"
            @click="emit('close')"
          />
        </div>
        <div style="overflow: auto; max-height: 60vh">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="sticky-top">
              <tr>
                <th>Sound</th>
                <th />
                <th>Waveform</th>
                <th class="text-end">Length</th>
                <th class="text-end">Rate</th>
                <th>In slots</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr
                :class="{ 'table-active': value === 0 }"
                :data-current="value === 0"
                data-testid="sound-browser.row.0"
              >
                <td>0</td>
                <td />
                <td colspan="3" class="text-secondary">None (silent)</td>
                <td>{{ (slotsByValue.get(0) ?? []).join(', ') }}</td>
                <td class="text-end">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-primary py-0"
                    data-testid="sound-browser.use.0"
                    @click="emit('pick', 0)"
                  >
                    Use
                  </button>
                </td>
              </tr>
              <tr
                v-for="r in rows"
                :key="r.id"
                :class="{ 'table-active': r.value === value, 'text-secondary': r.empty }"
                :data-current="r.value === value"
                :data-testid="`sound-browser.row.${r.value}`"
              >
                <td :title="`SOUNDS.DAT entry ${r.id}`">{{ r.value }}</td>
                <td>
                  <SoundPlayButton :id="r.id" :testid="`sound-browser.play.${r.value}`" />
                </td>
                <td>
                  <Waveform v-if="!r.empty" :sound="r.sound" :width="140" :height="20" />
                  <span v-else>empty</span>
                </td>
                <td class="text-end text-nowrap">{{ r.empty ? '' : `${r.ms} ms` }}</td>
                <td class="text-end text-nowrap">{{ r.empty ? '' : `${r.rate} Hz` }}</td>
                <td>{{ r.slots.join(', ') }}</td>
                <td class="text-end text-nowrap">
                  <button
                    v-if="!r.empty"
                    type="button"
                    class="btn btn-sm btn-outline-secondary py-0 px-1 me-1"
                    :aria-label="`Export sound ${r.value} as WAV`"
                    title="Export WAV"
                    :data-testid="`sound-browser.wav.${r.value}`"
                    @click="exportWav(r.value)"
                  >
                    <Icon name="download" />
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm py-0"
                    :class="r.value === value ? 'btn-primary' : 'btn-outline-primary'"
                    :data-testid="`sound-browser.use.${r.value}`"
                    @click="emit('pick', r.value)"
                  >
                    Use
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-if="unreachable"
          class="text-secondary mt-2 mb-0"
          data-testid="sound-browser.unreachable"
        >
          {{ unreachable }} sounds above {{ MAX_VALUE }} are not offered: a sound table entry is one
          byte.
        </p>
      </div>
    </div>
  </Teleport>
</template>
