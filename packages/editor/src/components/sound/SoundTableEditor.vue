<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  AF_OVERRIDDEN_SOUND_SLOTS,
  soundDurationMs,
  soundSampleRate,
  type Sound,
} from '@omf/formats';
import IntField from '../widgets/IntField.vue';
import Icon from '../Icon.vue';
import FieldCode from '../widgets/FieldCode.vue';
import Waveform from './Waveform.vue';
import SoundPlayButton from './SoundPlayButton.vue';
import SoundBrowser from './SoundBrowser.vue';
import { useDocument } from '../../composables/useDocument';
import { useSounds } from '../../composables/useSounds';
import { animationLabel } from '../../lib/doc';
import { soundSlotUsage, type SlotUse } from '../../lib/soundUsage';
import { scriptQuery } from '../../lib/scriptTags';
import { inputChecked } from '../../lib/util';

const docs = useDocument();
const sounds = useSounds();
const onlyUsed = ref(false);
/**
 * Slots "only assigned or used" shows, fixed when the filter is turned on or
 * another file is opened, so a row does not vanish while its value is edited to 0.
 */
const shownSlots = ref<Set<number> | null>(null);
function refreshShown(): void {
  shownSlots.value = onlyUsed.value
    ? new Set(
        table.value
          .map((v, slot) => (v > 0 || (usage.value.get(slot)?.length ?? 0) > 0 ? slot : -1))
          .filter((slot) => slot >= 0),
      )
    : null;
}
const browsing = ref<number | null>(null);

const kind = computed(() => docs.kind.value ?? 'af');
const table = computed(() => docs.doc.value?.soundTable ?? []);
const usage = computed(() =>
  docs.doc.value ? soundSlotUsage(docs.doc.value) : new Map<number, SlotUse[]>(),
);
/** `s` values outside 0..29 that scripts use; the game reads past the table for them. */
const strayUses = computed(() =>
  [...usage.value.entries()].filter(([slot]) => slot < 0 || slot >= table.value.length),
);

interface Row {
  slot: number;
  value: number;
  sound: Sound | null;
  uses: SlotUse[];
  animations: number[];
  note: { severity: 'info' | 'warning'; text: string } | null;
}

const rows = computed<Row[]>(() =>
  table.value
    .map((value, slot) => {
      const uses = usage.value.get(slot) ?? [];
      const sound = value > 0 ? sounds.get(value - 1) : null;
      let note: Row['note'] = null;
      if (kind.value === 'af' && AF_OVERRIDDEN_SOUND_SLOTS.includes(slot))
        note = { severity: 'info', text: 'openomf clears this slot when loading a HAR' };
      else if (value > 0 && sounds.sounds.value && !sound)
        note = {
          severity: 'warning',
          text:
            value > sounds.sounds.value.length
              ? 'not in SOUNDS.DAT'
              : 'empty entry in SOUNDS.DAT: silent',
        };
      else if (value === 0 && uses.length > 0) note = { severity: 'info', text: 'used but silent' };
      return {
        slot,
        value,
        sound,
        uses,
        animations: [...new Set(uses.map((u) => u.animId))],
        note,
      };
    })
    .filter((r) => !shownSlots.value || shownSlots.value.has(r.slot)),
);

watch([onlyUsed, docs.generation], refreshShown);

function setSound(i: number, v: number): void {
  docs.mutate(
    `set sound_table[${i}]`,
    (d) => {
      d.soundTable[i] = v;
    },
    { coalesce: browsing.value === null },
  );
}

function pick(v: number): void {
  const slot = browsing.value;
  if (slot !== null) setSound(slot, v);
  browsing.value = null;
}

const info = (s: Sound): string =>
  `${Math.round(soundDurationMs(s))} ms · ${soundSampleRate(s.freqKey)} Hz`;
/** Script view of `animId` at its first use of the slot, base string first. */
function useTarget(r: Row, animId: number) {
  const mine = r.uses.filter((x) => x.animId === animId);
  const u = mine.find((x) => x.string === 'base') ?? mine[0]!;
  return { name: 'anim-script', params: { id: animId }, query: scriptQuery(u.string, u.frame) };
}
</script>

<template>
  <div class="card mb-3 sound-table" data-testid="sound-table">
    <div class="card-body">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h6 class="card-title m-0 me-auto" title="sound_table">
          Sound table <FieldCode name="sound_table" />
        </h6>
        <label class="form-check-label d-inline-flex align-items-center gap-1 small">
          <input
            v-model="onlyUsed"
            type="checkbox"
            class="form-check-input m-0"
            data-testid="sound-table.only-used"
          />
          only assigned or used slots
        </label>
        <label class="form-check-label d-inline-flex align-items-center gap-1 small">
          <input
            type="checkbox"
            class="form-check-input m-0"
            :checked="sounds.playbackSound.value"
            data-testid="sound-table.playback-sound"
            @change="sounds.setPlaybackSound(inputChecked($event))"
          />
          play sounds in animation previews
        </label>
      </div>
      <p class="small text-secondary mb-2">
        A <code>s<i>n</i></code> tag plays slot <i>n</i>. Each slot holds a 1-based number into the
        game's <code>SOUNDS.DAT</code> sound bank; 0 is silent.
      </p>
      <div
        class="d-flex flex-wrap align-items-center gap-2 small mb-2"
        data-testid="sound-table.bank"
      >
        <template v-if="sounds.sounds.value">
          <Icon name="sound" />
          <span data-testid="sound-table.bank-name">
            {{ sounds.sourceName.value }}:
            {{ sounds.sounds.value.filter((s) => s.data.length > 0).length }} sounds
          </span>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary py-0"
            data-testid="sound-table.load"
            @click="sounds.load()"
          >
            Change…
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary py-0"
            data-testid="sound-table.forget"
            @click="sounds.clear()"
          >
            Forget
          </button>
        </template>
        <template v-else>
          <Icon name="mute" />
          <span class="text-secondary">
            Load <code>SOUNDS.DAT</code> from the game directory to hear and browse the sounds (or
            drop it on the window).
          </span>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary py-0"
            data-testid="sound-table.load"
            @click="sounds.load()"
          >
            Load SOUNDS.DAT…
          </button>
        </template>
      </div>

      <table class="table table-sm align-middle small mb-0">
        <thead>
          <tr>
            <th style="width: 3rem">Slot</th>
            <th style="width: 6rem">Sound</th>
            <th v-if="sounds.sounds.value" />
            <th v-if="sounds.sounds.value">Waveform</th>
            <th>Used by</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.slot"
            :class="{ 'text-secondary': r.value === 0 && r.uses.length === 0 }"
            :data-testid="`sound-table.row.${r.slot}`"
          >
            <td>
              <code>s{{ r.slot }}</code>
            </td>
            <td>
              <div class="d-flex gap-1 align-items-center">
                <IntField
                  :model-value="r.value"
                  :min="0"
                  :max="255"
                  :hint="`Slot ${r.slot}`"
                  :aria-label="`Sound for slot ${r.slot}`"
                  :testid="`file.sound.${r.slot}`"
                  @update:model-value="setSound(r.slot, $event)"
                />
                <button
                  v-if="sounds.sounds.value"
                  type="button"
                  class="btn btn-sm btn-outline-secondary py-0 px-1"
                  :aria-label="`Choose a sound for slot ${r.slot}`"
                  title="Choose…"
                  :data-testid="`sound-table.choose.${r.slot}`"
                  @click="browsing = r.slot"
                >
                  …
                </button>
              </div>
            </td>
            <td v-if="sounds.sounds.value">
              <SoundPlayButton
                v-if="r.value > 0"
                :id="r.value - 1"
                :label="`Play slot ${r.slot}`"
                :testid="`sound-table.play.${r.slot}`"
              />
            </td>
            <td v-if="sounds.sounds.value" class="text-nowrap">
              <template v-if="r.sound">
                <Waveform :sound="r.sound" :width="120" :height="20" class="align-middle me-2" />
                <span :data-testid="`sound-table.info.${r.slot}`">{{ info(r.sound) }}</span>
              </template>
            </td>
            <td>
              <span class="d-inline-flex flex-wrap gap-1 align-items-center">
                <RouterLink
                  v-for="u in r.animations.slice(0, 4)"
                  :key="u"
                  class="badge text-bg-light border text-decoration-none fw-normal"
                  :to="useTarget(r, u)"
                  :data-testid="`sound-table.use.${r.slot}.${u}`"
                  >{{ animationLabel(kind, u) }}</RouterLink
                >
                <span
                  v-if="r.animations.length > 4"
                  class="text-secondary"
                  :title="r.animations.map((a) => animationLabel(kind, a)).join(', ')"
                  >+{{ r.animations.length - 4 }} more</span
                >
                <span
                  v-if="r.note"
                  :class="
                    r.note.severity === 'warning' ? 'text-warning-emphasis' : 'text-secondary'
                  "
                  :data-testid="`sound-table.note.${r.slot}`"
                >
                  <Icon :name="r.note.severity === 'warning' ? 'warning' : 'info'" />
                  {{ r.note.text }}
                </span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="strayUses.length" class="small text-warning-emphasis mt-2 mb-0">
        <Icon name="warning" />
        Scripts use slots outside 0–29:
        {{ strayUses.map(([s, u]) => `s${s} (${u.length}×)`).join(', ') }}.
      </p>
    </div>
    <SoundBrowser
      v-if="browsing !== null"
      :slot-index="browsing"
      :value="table[browsing] ?? 0"
      @pick="pick"
      @close="browsing = null"
    />
  </div>
</template>

<style scoped>
.sound-table :deep(.int-field-wrap) {
  margin: 0 !important;
}
.sound-table td {
  padding-top: 0.15rem;
  padding-bottom: 0.15rem;
}
</style>
