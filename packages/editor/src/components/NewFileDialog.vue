<script setup lang="ts">
import { reactive, ref } from 'vue';
import { HAR_NAMES } from '@omf/formats';
import IntField from './widgets/IntField.vue';
import FixedField from './widgets/FixedField.vue';
import { useNewFile } from '../composables/useNewFile';
import { useModal } from '../composables/useModal';
import { JAGUAR_HEADER } from '../lib/templates';

const nf = useNewFile();
const h = reactive({ ...JAGUAR_HEADER });
const panel = ref<HTMLElement | null>(null);
const I32 = { min: -0x80000000, max: 0x7fffffff };
const SPEEDS = [
  ['forwardSpeed', 'Forward speed', 'forward_speed'],
  ['reverseSpeed', 'Reverse speed', 'reverse_speed'],
  ['jumpSpeed', 'Jump speed', 'jump_speed'],
  ['fallSpeed', 'Fall speed', 'fall_speed'],
] as const;

useModal({ open: () => nf.dialogOpen.value, panel, close: () => nf.closeDialog() });

function createFighter(): void {
  void nf.newFighter({ ...h });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="nf.dialogOpen.value" class="modal-backdrop-omf" @click.self="nf.closeDialog()">
      <div
        ref="panel"
        class="modal-panel p-3"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label="New file"
        data-testid="new-dialog"
      >
        <h5>New file</h5>
        <div class="row g-3">
          <div class="col-7">
            <h6 class="text-secondary">Fighter (AF)</h6>
            <p class="small text-secondary mb-2">
              The 16 base animations the game needs, each with an empty sprite. Header defaults are
              Jaguar's.
            </p>
            <div class="small">
              <label class="d-flex flex-column me-2 mb-1"
                >HAR
                <select
                  v-model.number="h.fighterId"
                  class="form-select form-select-sm"
                  style="width: auto"
                  data-testid="new.har"
                >
                  <option v-for="(n, i) in HAR_NAMES" :key="i" :value="i">{{ i }} {{ n }}</option>
                </select>
              </label>
              <IntField
                v-model="h.health"
                :min="0"
                :max="65535"
                label="Health"
                testid="new.health"
              />
              <FixedField
                v-model="h.endurance"
                :min="0"
                :max="0xffffffff"
                label="Endurance"
                testid="new.endurance"
              />
              <FixedField
                v-for="[k, label, code] in SPEEDS"
                :key="k"
                v-model="h[k]"
                v-bind="I32"
                :label="label"
                :testid="`new.${code}`"
              />
            </div>
            <button
              class="btn btn-primary btn-sm mt-2"
              data-testid="new.fighter"
              @click="createFighter"
            >
              Create fighter
            </button>
          </div>
          <div class="col-5">
            <h6 class="text-secondary">Scene (BK)</h6>
            <p class="small text-secondary mb-2">
              320×200 black background, one palette with a grey ramp in the arena range, no
              animations.
            </p>
            <button class="btn btn-primary btn-sm" data-testid="new.scene" @click="nf.newScene()">
              Create scene
            </button>
            <h6 class="text-secondary mt-3">From a file</h6>
            <p class="small text-secondary mb-2">
              Opens a copy as a new unsaved file; the original is never written.
            </p>
            <button
              class="btn btn-outline-primary btn-sm"
              data-testid="new.from"
              @click="nf.newFrom()"
            >
              New from…
            </button>
          </div>
        </div>
        <div class="text-end mt-3">
          <button class="btn btn-sm btn-outline-secondary" @click="nf.closeDialog()">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
