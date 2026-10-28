<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  AI_MOVE_TRIGGERS,
  EXTRA_STRING_SELECTORS,
  POSITION_CONSTRAINTS,
  type AFMove,
  type BKAnimation,
} from '@omf/formats';
import ScenePreview from '../components/scene/ScenePreview.vue';
import IntField from '../components/widgets/IntField.vue';
import FlagGroup from '../components/widgets/FlagGroup.vue';
import EnumSelect from '../components/widgets/EnumSelect.vue';
import ByteString from '../components/widgets/ByteString.vue';
import LinkedId from '../components/widgets/LinkedId.vue';
import FieldCode from '../components/widgets/FieldCode.vue';
import TriggerEditor from '../components/TriggerEditor.vue';
import Icon from '../components/Icon.vue';
import { useDocument } from '../composables/useDocument';
import { useSelection } from '../composables/useSelection';
import { useAnimationEdit } from '../composables/useAnimationEdit';
import { animationLabel, animationsOf, isAF } from '../lib/doc';

const router = useRouter();
const docs = useDocument();
const sel = useSelection();
const ed = useAnimationEdit(() => sel.animId.value);
const unknownOpen = ref(false);

const kind = computed(() => docs.kind.value ?? 'af');
const move = computed<AFMove | null>(() => {
  const d = docs.doc.value;
  return d && isAF(d) && sel.animId.value !== null ? (d.moves.get(sel.animId.value) ?? null) : null;
});
const bkAnim = computed<BKAnimation | null>(() => {
  const d = docs.doc.value;
  return d && !isAF(d) && sel.animId.value !== null
    ? (d.animations.get(sel.animId.value) ?? null)
    : null;
});

function resolve(id: number): string | null {
  const d = docs.doc.value;
  if (!d || !animationsOf(d).has(id)) return null;
  return animationLabel(kind.value, id);
}
function go(id: number): void {
  void router.push({ name: 'anim-overview', params: { id } });
}
const unknownKeys = [
  'unknown4',
  'unknown5',
  'unknown6',
  'unknown7',
  'unknown8',
  'unknown9',
  'unknown10',
  'unknown11',
] as const;
</script>

<template>
  <div
    v-if="sel.animation.value"
    class="view-pad d-flex gap-4 flex-wrap align-items-start"
    data-testid="view.overview"
  >
    <ScenePreview :animation="sel.animation.value" :anim-id="sel.animId.value!" />

    <div style="flex: 0 1 400px; min-width: 360px">
      <div class="card mb-2">
        <div class="card-body py-2">
          <h6 class="card-title">{{ kind === 'af' ? 'Move' : 'Animation' }}</h6>
          <IntField
            :model-value="sel.animation.value.startX"
            :min="-32768"
            :max="32767"
            label="Start X"
            code="start_x"
            testid="ov.start_x"
            @update:model-value="ed.set('startX', $event)"
          />
          <IntField
            :model-value="sel.animation.value.startY"
            :min="-32768"
            :max="32767"
            label="Start Y"
            code="start_y"
            testid="ov.start_y"
            @update:model-value="ed.set('startY', $event)"
          />
          <IntField
            v-if="move"
            :model-value="move.points"
            :min="0"
            :max="255"
            label="Points"
            code="points"
            testid="ov.points"
            @update:model-value="ed.setMove('points', $event)"
          />
        </div>
      </div>

      <template v-if="move">
        <div class="card mb-2">
          <div class="card-body py-2">
            <h6 class="card-title">Damage</h6>
            <IntField
              :model-value="move.damageAmount"
              :min="0"
              :max="255"
              label="Damage"
              code="damage_amount"
              testid="ov.damage_amount"
              @update:model-value="ed.setMove('damageAmount', $event)"
            />
            <IntField
              :model-value="move.blockDamage"
              :min="0"
              :max="255"
              label="Block damage"
              code="block_damage"
              testid="ov.block_damage"
              @update:model-value="ed.setMove('blockDamage', $event)"
            />
            <IntField
              :model-value="move.blockStunAndScrap"
              :min="0"
              :max="255"
              label="Block stun / scrap"
              code="block_stun_and_scrap"
              testid="ov.block_stun_and_scrap"
              @update:model-value="ed.setMove('blockStunAndScrap', $event)"
            />
            <IntField
              :model-value="move.throwDuration"
              :min="0"
              :max="255"
              label="Throw duration"
              code="throw_duration"
              testid="ov.throw_duration"
              @update:model-value="ed.setMove('throwDuration', $event)"
            />
          </div>
        </div>
        <div class="card mb-2">
          <div class="card-body py-2">
            <h6 class="card-title">Chaining</h6>
            <LinkedId
              :model-value="move.nextAnimationId"
              label="Next animation"
              code="next_animation_id"
              :resolved="resolve(move.nextAnimationId)"
              testid="ov.next_animation_id"
              @update:model-value="ed.setMove('nextAnimationId', $event)"
              @go="go(move.nextAnimationId)"
            />
            <LinkedId
              :model-value="move.successorId"
              label="Successor"
              code="successor_id"
              :resolved="resolve(move.successorId)"
              testid="ov.successor_id"
              @update:model-value="ed.setMove('successorId', $event)"
              @go="go(move.successorId)"
            />
          </div>
        </div>
        <div class="card mb-2">
          <div class="card-body py-2">
            <h6 class="card-title">Input</h6>
            <TriggerEditor
              :move-id="sel.animId.value!"
              :model-value="move.moveString"
              @update:model-value="ed.setMove('moveString', $event)"
            />
            <ByteString
              :model-value="move.enemyString"
              :max-bytes="510"
              label="Enemy string"
              code="enemy_string"
              testid="ov.enemy_string"
              @update:model-value="ed.setMove('enemyString', $event)"
            />
            <div class="text-end small mb-2">
              <RouterLink
                :to="{
                  name: 'anim-script',
                  params: { id: sel.animId.value },
                  query: { string: 'enemy' },
                }"
                data-testid="ov.edit-enemy"
                >Edit in Script →</RouterLink
              >
            </div>
            <EnumSelect
              :model-value="move.extraStringSelector"
              :options="EXTRA_STRING_SELECTORS"
              label="Extra string selector"
              code="extra_string_selector"
              testid="ov.extra_string_selector"
              @update:model-value="ed.setMove('extraStringSelector', $event)"
            />
          </div>
        </div>
        <div class="card mb-2">
          <div class="card-body py-2">
            <FlagGroup
              :model-value="move.aiFlags"
              :flags="AI_MOVE_TRIGGERS"
              title="AI triggers"
              code="ai_flags"
              testid="ov.ai_flags"
              @update:model-value="ed.setMove('aiFlags', $event)"
            />
            <FlagGroup
              :model-value="move.posConstraint"
              :flags="POSITION_CONSTRAINTS"
              title="Constraints"
              code="pos_constraint"
              testid="ov.pos_constraint"
              @update:model-value="ed.setMove('posConstraint', $event)"
            />
            <button
              class="btn btn-link btn-sm p-0 text-reset text-decoration-none fw-semibold"
              data-testid="ov.unknown.toggle"
              @click="unknownOpen = !unknownOpen"
            >
              <Icon :name="unknownOpen ? 'chevronDown' : 'chevronRight'" /> Unknown
            </button>
            <div v-if="unknownOpen" class="mt-1 text-secondary">
              <p class="small mb-1">Meaning not identified; preserved as is.</p>
              <IntField
                v-for="(k, i) in unknownKeys"
                :key="k"
                :model-value="move[k]"
                :min="0"
                :max="255"
                :label="`unknown_${i + 4}`"
                :testid="`ov.unknown_${i + 4}`"
                @update:model-value="ed.setMove(k, $event)"
              />
            </div>
          </div>
        </div>
      </template>

      <template v-if="bkAnim">
        <div class="card mb-2">
          <div class="card-body py-2">
            <h6 class="card-title">Behaviour</h6>
            <LinkedId
              :model-value="bkAnim.chainHit"
              label="Chain on hit"
              code="chain_hit"
              :resolved="resolve(bkAnim.chainHit)"
              testid="ov.chain_hit"
              @update:model-value="ed.setBk('chainHit', $event)"
              @go="go(bkAnim.chainHit)"
            />
            <LinkedId
              :model-value="bkAnim.chainNoHit"
              label="Chain on no hit"
              code="chain_no_hit"
              :resolved="resolve(bkAnim.chainNoHit)"
              testid="ov.chain_no_hit"
              @update:model-value="ed.setBk('chainNoHit', $event)"
              @go="go(bkAnim.chainNoHit)"
            />
            <IntField
              :model-value="bkAnim.repeat"
              :min="0"
              :max="255"
              label="Repeat"
              code="repeat"
              testid="ov.repeat"
              @update:model-value="ed.setBk('repeat', $event)"
            />
            <IntField
              :model-value="bkAnim.probability"
              :min="0"
              :max="65535"
              label="Probability"
              code="probability"
              testid="ov.probability"
              @update:model-value="ed.setBk('probability', $event)"
            />
            <IntField
              :model-value="bkAnim.hazardDamage"
              :min="0"
              :max="255"
              label="Hazard damage"
              code="hazard_damage"
              testid="ov.hazard_damage"
              @update:model-value="ed.setBk('hazardDamage', $event)"
            />
          </div>
        </div>
        <div class="card mb-2">
          <div class="card-body py-2">
            <h6 class="card-title">Strings</h6>
            <ByteString
              :model-value="bkAnim.footerString"
              :max-bytes="510"
              label="Footer string"
              code="footer_string"
              testid="ov.footer_string"
              @update:model-value="ed.setBk('footerString', $event)"
            />
            <IntField
              :model-value="bkAnim.null"
              :min="0"
              :max="255"
              label="Unknown"
              code="null"
              testid="ov.null"
              @update:model-value="ed.setBk('null', $event)"
            />
          </div>
        </div>
      </template>

      <div class="card mb-2">
        <div class="card-body py-2">
          <h6 class="card-title d-flex">
            <span title="base_string">Script</span>
            <FieldCode name="base_string" class="ms-1" />
            <RouterLink
              class="ms-auto small"
              :to="{ name: 'anim-script', params: { id: sel.animId.value } }"
              data-testid="ov.edit-script"
              >Edit in Script →</RouterLink
            >
          </h6>
          <code class="d-block text-break small" data-testid="ov.base_string">{{
            sel.animation.value.baseString
          }}</code>
        </div>
      </div>
    </div>
  </div>
</template>
