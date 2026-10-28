<script setup lang="ts">
import { computed } from 'vue';
import { tickPosAtFrame } from '@omf/formats';
import IntField from '../widgets/IntField.vue';
import { useOpponent } from '../../composables/useOpponent';
import { usePlayback } from '../../composables/usePlayback';
import { useDocument } from '../../composables/useDocument';
import { MAX_PAIR_DISTANCE } from '../../lib/enemyPair';
import type { EnemyPosition } from '../../lib/enemyString';
import { inputValue } from '../../lib/util';

// Preview settings of the enemy string (spec 15 §6.1): the opponent it plays
// on, the variant openomf makes of it, and the paired preview with the move.

const opponent = useOpponent();
const pb = usePlayback();
const docs = useDocument();

const plan = computed(() => pb.enemy.value);
const name = computed(() => opponent.loaded.value?.name ?? docs.fileName.value);
const positions = computed<{ value: EnemyPosition; label: string }[]>(() => [
  { value: 'standing', label: 'Standing' },
  { value: 'airborne', label: 'Airborne' },
  ...(plan.value?.launch.length ? [{ value: 'launch' as const, label: 'Launch' }] : []),
]);
const frameList = (frames: number[]): string => frames.map((i) => i + 1).join(', ');
/** The attacker's frames, to pick the one that hits. */
const attackerFrames = computed(() => {
  const b = plan.value?.pair?.base;
  return b ? b.frames.map((f, i) => ({ i, key: f.key, tick: tickPosAtFrame(b, i) })) : [];
});

function setPosition(p: EnemyPosition): void {
  opponent.variant.value = { ...opponent.variant.value, position: p };
}
function setStun(on: boolean): void {
  opponent.variant.value = { ...opponent.variant.value, stun: on };
}
function setHitFrame(v: string): void {
  if (pb.animId.value !== null)
    opponent.hitFrame.value = { animId: pb.animId.value, frame: Number(v) };
}
</script>

<template>
  <div v-if="plan" class="card mb-2" data-testid="enemy.panel">
    <div class="card-body py-2 px-2 small d-flex flex-column gap-1">
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <span
          class="text-secondary"
          title="The opponent plays this string in place of the script of its move 9 (Damage) when the move hits, so frame letters are sprites of that move."
          >Opponent</span
        >
        <strong class="text-truncate" style="max-width: 12rem" data-testid="enemy.opponent">{{
          name
        }}</strong>
        <span v-if="!opponent.loaded.value" class="text-secondary">(this file)</span>
        <span v-if="opponent.damage.value" class="text-secondary" data-testid="enemy.damage"
          >· move 9, {{ opponent.damage.value.sprites.length }} sprites</span
        >
        <button
          class="btn btn-sm btn-outline-secondary py-0"
          data-testid="enemy.opponent.load"
          @click="opponent.load()"
        >
          Load fighter…
        </button>
        <button
          v-if="opponent.loaded.value"
          class="btn btn-sm btn-link p-0"
          data-testid="enemy.opponent.reset"
          @click="opponent.reset()"
        >
          use this file
        </button>
      </div>
      <div v-if="!opponent.damage.value" class="text-warning" data-testid="enemy.no-damage">
        {{ name }} has no move 9 (Damage), whose sprites this string shows; load another fighter.
      </div>

      <div class="d-flex align-items-center gap-2 flex-wrap">
        <div class="btn-group btn-group-sm" role="group" aria-label="Opponent when hit">
          <button
            v-for="p in positions"
            :key="p.value"
            class="btn py-0"
            :class="plan.variant.position === p.value ? 'btn-secondary' : 'btn-outline-secondary'"
            :aria-pressed="plan.variant.position === p.value"
            :disabled="plan.plain !== null"
            :data-testid="`enemy.variant.${p.value}`"
            @click="setPosition(p.value)"
          >
            {{ p.label }}
          </button>
        </div>
        <label class="form-check mb-0">
          <input
            class="form-check-input"
            type="checkbox"
            :checked="plan.variant.stun"
            :disabled="plan.plain !== null || plan.variant.position === 'launch'"
            data-testid="enemy.variant.stun"
            @change="setStun(($event.target as HTMLInputElement).checked)"
          />
          <span class="form-check-label">stuns or KOs</span>
        </label>
        <span class="vr" />
        <label class="form-check mb-0">
          <input
            v-model="opponent.paired.value"
            class="form-check-input"
            type="checkbox"
            data-testid="enemy.paired"
          />
          <span class="form-check-label">With the move</span>
        </label>
        <template v-if="plan.timing">
          <IntField
            :model-value="opponent.distance.value"
            :min="0"
            :max="MAX_PAIR_DISTANCE"
            suffix="px apart"
            width="8rem"
            aria-label="Distance between the fighters"
            testid="enemy.distance"
            @update:model-value="opponent.distance.value = $event"
          />
          <span v-if="plan.timing.throw" class="text-secondary" data-testid="enemy.start">
            from frame {{ plan.timing.frame + 1 }} (<code>ua</code>, tick
            {{ plan.timing.attackerStart }})
          </span>
          <label v-else class="d-flex align-items-center gap-1 mb-0">
            hit on
            <select
              class="form-select form-select-sm w-auto py-0"
              :value="plan.timing.frame"
              aria-label="Attacker frame that hits"
              data-testid="enemy.hit-frame"
              @change="setHitFrame(inputValue($event))"
            >
              <option v-for="f in attackerFrames" :key="f.i" :value="f.i">
                frame {{ f.i + 1 }} · {{ f.key }} · tick {{ f.tick }}
              </option>
            </select>
          </label>
        </template>
      </div>

      <div v-if="plan.plain" class="text-secondary" data-testid="enemy.variant.plain">
        <template v-if="plan.plain === 'ua'">
          A throw: <code>ua</code> on frame {{ (plan.timing?.frame ?? 0) + 1 }} hands the opponent
          this string as it is, in step with the move.
        </template>
        <template v-else>throw_duration is set, so a hit plays this string as it is.</template>
      </div>
      <div
        v-else-if="plan.launch.length"
        class="text-secondary"
        data-testid="enemy.variant.launch-note"
      >
        Launch: when the attacker's frame that hits has <code>ai</code> (frame
        {{ frameList(plan.launch) }}), openomf plays its own string instead.
      </div>
      <div class="d-flex gap-1 align-items-baseline">
        <span class="text-secondary text-nowrap">openomf plays</span>
        <code v-if="plan.effective.text" class="text-break effective" data-testid="enemy.effective"
          ><span>{{ plan.effective.kept }}</span
          ><del v-if="plan.effective.removed" title="Dropped by openomf">{{
            plan.effective.removed
          }}</del
          ><mark v-if="plan.effective.added" title="Added by openomf">{{
            plan.effective.added
          }}</mark></code
        >
        <span v-else class="text-secondary" data-testid="enemy.effective.none">
          nothing: an empty enemy string is no hit animation (Chronos' stasis).
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.effective mark {
  padding: 0;
  background: var(--bs-warning-bg-subtle);
  color: inherit;
}
.effective del {
  color: var(--bs-danger-text-emphasis);
}
</style>
