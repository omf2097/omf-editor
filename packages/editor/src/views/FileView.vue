<script setup lang="ts">
import { computed } from 'vue';
import { HAR_NAMES, MUSIC_MASK, type AFFile, type BKFile } from '@omf/formats';
import IntField from '../components/widgets/IntField.vue';
import FixedField from '../components/widgets/FixedField.vue';
import FlagGroup from '../components/widgets/FlagGroup.vue';
import FieldCode from '../components/widgets/FieldCode.vue';
import SoundTableEditor from '../components/sound/SoundTableEditor.vue';
import { useDocument } from '../composables/useDocument';
import { animationsOf, isAF } from '../lib/doc';
import { inputValue } from '../lib/util';

const docs = useDocument();
const af = computed(() => (docs.doc.value && isAF(docs.doc.value) ? docs.doc.value : null));
const bk = computed(() =>
  docs.doc.value && !isAF(docs.doc.value) ? (docs.doc.value as BKFile) : null,
);

const harOptions = computed(() => HAR_NAMES.map((n, i) => ({ value: i, name: n })));

function setAF<K extends keyof AFFile>(key: K, value: AFFile[K]): void {
  docs.mutate<AFFile>(`set ${String(key)}`, (d) => {
    d[key] = value;
  });
}
function setBK<K extends keyof BKFile>(key: K, value: BKFile[K]): void {
  docs.mutate<BKFile>(`set ${String(key)}`, (d) => {
    d[key] = value;
  });
}

const summary = computed(() => {
  const d = docs.doc.value;
  if (!d) return null;
  const anims = [...animationsOf(d).values()];
  return {
    animations: anims.length,
    sprites: anims.reduce((n, a) => n + a.sprites.length, 0),
    imageBytes: anims.reduce((n, a) => n + a.sprites.reduce((m, s) => m + s.image.length, 0), 0),
    fileBytes: docs.byteSize.value,
  };
});

const I32 = { min: -0x80000000, max: 0x7fffffff };
</script>

<template>
  <div class="view-pad mx-auto" style="max-width: 960px" data-testid="view.file">
    <template v-if="af">
      <div class="card mb-3">
        <div class="card-body">
          <h6 class="card-title">Identity</h6>
          <label class="d-inline-flex flex-column me-3 mb-1" title="fighter_id">
            <span class="small">HAR <FieldCode name="fighter_id" /></span>
            <select
              class="form-select form-select-sm"
              :value="af.fighterId"
              data-testid="file.fighter_id"
              @change="setAF('fighterId', Number(inputValue($event)))"
            >
              <option v-if="af.fighterId >= HAR_NAMES.length" :value="af.fighterId">
                Unknown ({{ af.fighterId }})
              </option>
              <option v-for="o in harOptions" :key="o.value" :value="o.value">
                {{ o.value }} {{ o.name }}
              </option>
            </select>
          </label>
          <IntField
            :model-value="af.fighterId"
            :min="0"
            :max="65535"
            label="Raw id"
            code="fighter_id"
            testid="file.fighter_id.raw"
            @update:model-value="setAF('fighterId', $event)"
          />
          <IntField
            :model-value="af.version1"
            :min="0"
            :max="255"
            label="Version"
            code="version_1"
            testid="file.version_1"
            @update:model-value="setAF('version1', $event)"
          />
        </div>
      </div>
      <div class="card mb-3">
        <div class="card-body">
          <h6 class="card-title">Stats</h6>
          <IntField
            :model-value="af.health"
            :min="0"
            :max="65535"
            label="Health"
            code="health"
            testid="file.health"
            @update:model-value="setAF('health', $event)"
          />
          <FixedField
            :model-value="af.endurance"
            :min="0"
            :max="0xffffffff"
            label="Endurance"
            code="endurance"
            testid="file.endurance"
            @update:model-value="setAF('endurance', $event)"
          />
          <IntField
            :model-value="af.execWindow"
            :min="0"
            :max="65535"
            label="Exec window"
            code="exec_window"
            testid="file.exec_window"
            @update:model-value="setAF('execWindow', $event)"
          />
        </div>
      </div>
      <div class="card mb-3">
        <div class="card-body">
          <h6 class="card-title">Movement</h6>
          <FixedField
            :model-value="af.forwardSpeed"
            v-bind="I32"
            label="Forward speed"
            code="forward_speed"
            testid="file.forward_speed"
            @update:model-value="setAF('forwardSpeed', $event)"
          />
          <FixedField
            :model-value="af.reverseSpeed"
            v-bind="I32"
            label="Reverse speed"
            code="reverse_speed"
            testid="file.reverse_speed"
            @update:model-value="setAF('reverseSpeed', $event)"
          />
          <FixedField
            :model-value="af.jumpSpeed"
            v-bind="I32"
            label="Jump speed"
            code="jump_speed"
            testid="file.jump_speed"
            @update:model-value="setAF('jumpSpeed', $event)"
          />
          <FixedField
            :model-value="af.fallSpeed"
            v-bind="I32"
            label="Fall speed"
            code="fall_speed"
            testid="file.fall_speed"
            @update:model-value="setAF('fallSpeed', $event)"
          />
          <IntField
            :model-value="af.upwardsJumpFrameLimit"
            :min="0"
            :max="255"
            label="Upwards jump frame limit"
            code="upwards_jump_frame_limit"
            testid="file.upwards_jump_frame_limit"
            @update:model-value="setAF('upwardsJumpFrameLimit', $event)"
          />
        </div>
      </div>
      <div class="card mb-3">
        <div class="card-body">
          <h6 class="card-title">AI</h6>
          <IntField
            :model-value="af.aiProjectileYThreshold"
            :min="0"
            :max="255"
            label="Projectile Y threshold"
            code="ai_projectile_y_threshold"
            testid="file.ai_projectile_y_threshold"
            @update:model-value="setAF('aiProjectileYThreshold', $event)"
          />
        </div>
      </div>
    </template>

    <template v-if="bk">
      <div class="card mb-3">
        <div class="card-body">
          <h6 class="card-title">Scene</h6>
          <p class="mb-2">
            Background {{ bk.backgroundWidth }}×{{ bk.backgroundHeight }}
            <RouterLink :to="{ name: 'background' }" class="ms-1">Background view</RouterLink>
          </p>
          <IntField
            :model-value="bk.unknownA"
            :min="0"
            :max="255"
            label="Unknown"
            code="unknown_a"
            testid="file.unknown_a"
            @update:model-value="setBK('unknownA', $event)"
          />
        </div>
      </div>
      <div class="card mb-3">
        <div class="card-body">
          <FlagGroup
            :model-value="bk.musicMask"
            :flags="MUSIC_MASK"
            title="Music"
            code="music_mask"
            :bits="32"
            :columns="4"
            :collapsible="false"
            testid="file.music_mask"
            @update:model-value="setBK('musicMask', $event)"
          />
        </div>
      </div>
      <div class="card mb-3">
        <div class="card-body">
          <h6 class="card-title">Palettes</h6>
          {{ bk.palettes.length }} palette(s).
          <RouterLink :to="{ name: 'palettes' }">Edit palettes</RouterLink>
        </div>
      </div>
    </template>

    <SoundTableEditor v-if="docs.doc.value" />

    <div v-if="summary" class="card mb-3">
      <div class="card-body small">
        <h6 class="card-title">Summary</h6>
        {{ summary.animations }} animations · {{ summary.sprites }} sprites ·
        {{ summary.imageBytes.toLocaleString() }} B of image data ·
        <template v-if="summary.fileBytes !== null"
          >{{ summary.fileBytes.toLocaleString() }} B file</template
        ><span v-else class="text-danger">file size unknown (cannot be written as it is)</span>
      </div>
    </div>
  </div>
</template>
