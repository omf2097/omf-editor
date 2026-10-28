<script setup lang="ts">
import { computed } from 'vue';
import { HAR_BANDS, vgaToRgb } from '@omf/formats';
import PaletteGrid from './PaletteGrid.vue';
import SceneCanvas from '../scene/SceneCanvas.vue';
import { usePalette } from '../../composables/usePalette';
import { useDocument } from '../../composables/useDocument';
import { animationsOf } from '../../lib/doc';
import { usePaletteUsage } from '../../composables/usePaletteUsage';
import { useSelection } from '../../composables/useSelection';
import { lastAnimationId } from '../../composables/useSelection';
import { inputValue } from '../../lib/util';

// Palettes view of an AF (spec 16 §3). A fighter has no palette: the game
// draws it with the arena's, its sprites using the player 1 bands 0x00–0x2F
// (player 2 adds 48). This picks the palette the editor previews with.

const palette = usePalette();
const docs = useDocument();
useSelection();

/** Indices this fighter's sprites use. */
const used = usePaletteUsage().sprites;
/** Used indices outside the player 1 bands, which are not the fighter's own colours. */
const outside = computed(() => {
  const p2 = [...used.value].filter((i) => i >= 0x30 && i <= 0x5f).length;
  const arena = [...used.value].filter((i) => i >= 0x60 && i <= 0x9f).length;
  return { p2, arena, shared: [...used.value].filter((i) => i >= 0xa0).length };
});
const bandUse = computed(() =>
  [0, 1, 2].map(
    (b) => [...used.value].filter((i) => i >= b * 16 && i < b * 16 + 16 && i > 0).length,
  ),
);
/** A swatch per HAR colour option of ALTPALS palette 0: shade 11 of its 16-shade band. */
const altOptions = computed(() => {
  const alt = palette.altPals.value?.[0];
  if (!alt) return [];
  return Array.from(
    { length: 16 },
    (_, o) => `rgb(${vgaToRgb(alt.colors[o * 16 + 11]!).join(',')})`,
  );
});
const anim = computed(() => {
  const d = docs.doc.value;
  if (!d) return null;
  const m = animationsOf(d);
  return m.get(lastAnimationId.value ?? 11) ?? m.get(11) ?? [...m.values()][0] ?? null;
});
</script>

<template>
  <div class="view-pad d-flex gap-4 flex-wrap align-items-start" data-testid="view.palettes.af">
    <div style="flex: 1 1 420px; max-width: 620px">
      <div class="card mb-2">
        <div class="card-body">
          <h6 class="card-title">Palette source</h6>
          <p class="small text-secondary">
            Fighters carry no palette; the game draws them with the arena's palette and the pilot's
            HAR colours.
          </p>
          <div class="d-flex gap-2 align-items-center flex-wrap">
            <button
              class="btn btn-sm btn-primary"
              data-testid="af-palette.choose"
              @click="palette.loadSource()"
            >
              {{
                palette.sourceName.value
                  ? `${palette.sourceName.value} — change…`
                  : 'Choose an arena BK…'
              }}
            </button>
            <template v-if="palette.sourceBk.value">
              <label class="small"
                >palette
                <select
                  v-model.number="palette.paletteIndex.value"
                  class="form-select form-select-sm d-inline-block w-auto"
                  data-testid="af-palette.index"
                >
                  <option v-for="(_, i) in palette.sourceBk.value.palettes" :key="i" :value="i">
                    {{ i }}
                  </option>
                </select>
              </label>
              <label class="small"
                >remap
                <select
                  v-model="palette.remapIndex.value"
                  class="form-select form-select-sm d-inline-block w-auto"
                  data-testid="af-palette.remap"
                >
                  <option :value="null">none</option>
                  <option v-for="k in 19" :key="k" :value="k - 1">{{ k - 1 }}</option>
                </select>
              </label>
            </template>
            <label class="form-check small mb-0"
              ><input
                v-model="palette.forceGrayscale.value"
                type="checkbox"
                class="form-check-input"
                data-testid="af-palette.gray"
              />
              greyscale</label
            >
          </div>
        </div>
      </div>
      <div class="card mb-2">
        <div class="card-body">
          <h6 class="card-title">HAR colours</h6>
          <template v-if="palette.altPals.value">
            <table class="small">
              <tr>
                <th />
                <th v-for="b in HAR_BANDS" :key="b" class="px-2">{{ b }}</th>
              </tr>
              <tr v-for="(p, pi) in ['p1', 'p2'] as const" :key="p">
                <td class="pe-2">Player {{ pi + 1 }}</td>
                <td v-for="(_, b) in HAR_BANDS" :key="b" class="px-2">
                  <select
                    class="form-select form-select-sm"
                    :value="palette.harColors.value[p][b] ?? ''"
                    :data-testid="`har.${p}.${b}`"
                    @change="
                      palette.setHarColor(
                        p,
                        b,
                        inputValue($event) === '' ? null : Number(inputValue($event)),
                      )
                    "
                  >
                    <option value="">arena's</option>
                    <option
                      v-for="(c, o) in altOptions"
                      :key="o"
                      :value="o"
                      :style="{ background: c }"
                    >
                      option {{ o }}
                    </option>
                  </select>
                </td>
              </tr>
            </table>
          </template>
          <button
            v-else
            class="btn btn-sm btn-outline-primary"
            data-testid="af-palette.altpals"
            @click="palette.loadAltPals()"
          >
            Load ALTPALS.DAT…
          </button>
          <p class="small text-secondary mt-2 mb-0">
            Nothing here is saved into the AF file; the choice is remembered in this browser.
          </p>
        </div>
      </div>
      <div class="card mb-2">
        <div class="card-body small">
          <h6 class="card-title">Index usage of this fighter</h6>
          <div data-testid="af-palette.band-use">
            <template v-for="(n, b) in bandUse" :key="b"
              >{{ b ? ' · ' : '' }}{{ HAR_BANDS[b] }} band: {{ n }} of 16</template
            >
            indices
          </div>
          <div :class="outside.p2 ? 'text-warning' : 'text-secondary'">
            Player 2 bands (0x30–0x5F): {{ outside.p2 }}
          </div>
          <div :class="outside.arena ? 'text-warning' : 'text-secondary'">
            Arena range (0x60–0x9F): {{ outside.arena }}
          </div>
          <div class="text-secondary">
            Shared effects range (0xA0–0xFF): {{ outside.shared }} — normal for sparks, oil and
            scrap.
          </div>
        </div>
      </div>
      <div data-testid="af-palette.preview-pane">
        <div class="mb-1">
          <div class="btn-group btn-group-sm">
            <button
              class="btn"
              :class="palette.playerOffset.value === 0 ? 'btn-secondary' : 'btn-outline-secondary'"
              data-testid="af-palette.p1"
              @click="palette.playerOffset.value = 0"
            >
              Preview as P1
            </button>
            <button
              class="btn"
              :class="palette.playerOffset.value === 48 ? 'btn-secondary' : 'btn-outline-secondary'"
              data-testid="af-palette.p2"
              @click="palette.playerOffset.value = 48"
            >
              Preview as P2
            </button>
          </div>
        </div>
        <SceneCanvas
          v-if="anim"
          :animation="anim"
          :sprite-override="0"
          :scale="1.25"
          testid="af-palette.preview"
        />
      </div>
    </div>
    <div class="grid-col">
      <PaletteGrid
        :palette="palette.activePalette.value"
        :selected="new Set()"
        :marks="used"
        marks-label="used by this fighter's sprites"
        testid="af-palette.grid"
      />
    </div>
  </div>
</template>

<style scoped>
/* Left column: the cards and the preview under them; right: the grid, sized so
   grid and preview are both in view at 1440×900 (spec 16 §3). */
.grid-col {
  flex: 1 1 360px;
  max-width: 560px;
  min-width: 0;
}
</style>
