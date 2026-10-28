<script setup lang="ts">
// Collision point editor (spec 14). Points belong to a sprite index and are
// relative to the animation origin; the canvas shows them mirrored when flip
// is on while edits keep the stored, unflipped value.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { spriteLetter, type HitCoord } from '@omf/formats';
import Icon from '../components/Icon.vue';
import IntField from '../components/widgets/IntField.vue';
import SceneCanvas from '../components/scene/SceneCanvas.vue';
import PlaybackBar from '../components/scene/PlaybackBar.vue';
import ViewportToolbar from '../components/scene/ViewportToolbar.vue';
import SpriteStrip from '../components/scene/SpriteStrip.vue';
import { useDocument } from '../composables/useDocument';
import { useSelection } from '../composables/useSelection';
import { usePlayback } from '../composables/usePlayback';
import { useViewport } from '../composables/useViewport';
import { useAnimationEdit } from '../composables/useAnimationEdit';
import { useConfirm } from '../composables/useConfirm';
import { useShortcuts } from '../composables/useShortcuts';
import { animationLabel, animationsOf } from '../lib/doc';
import { useSceneOrigin } from '../composables/useSceneOrigin';
import { useSharedImages } from '../composables/useSharedImages';
import { clampHit, hitFromScene, nearestHit, HIT_MAX, HIT_MIN, type Point } from '../lib/scene';
import { inputValue } from '../lib/util';

const route = useRoute();
const docs = useDocument();
const sel = useSelection();
const pb = usePlayback();
const vp = useViewport();
const ed = useAnimationEdit(() => sel.animId.value);
const { confirm } = useConfirm();
const shortcuts = useShortcuts();
const shared = useSharedImages();

const anim = computed(() => sel.animation.value);
/** Sprite whose points are edited: the one shown while paused, followed during playback. */
const currentSprite = ref(0);
const showAll = ref(false);
const placing = ref(false);
const canvas = ref<InstanceType<typeof SceneCanvas> | null>(null);
const menu = ref<{ i: number; x: number; y: number } | null>(null);
const copyFrom = ref('');

/** While paused, the canvas shows the sprite chosen in the table. */
const pinned = computed(() => (pb.playing.value ? null : currentSprite.value));
watch(
  () => canvas.value?.spriteIndex,
  (i) => {
    if (pb.playing.value && typeof i === 'number') currentSprite.value = i;
  },
);
watch(
  () => sel.animId.value,
  () => {
    currentSprite.value = 0;
    sel.selectHitCoord(null);
  },
);

const rows = computed(() => {
  const a = anim.value;
  if (!a) return [];
  return a.hitCoords
    .map((c, i) => ({ c, i }))
    .filter((r) => showAll.value || r.c.spriteId === currentSprite.value);
});
const facingLeft = computed(() => vp.toggles.flip);
const sceneOrigin = useSceneOrigin();
const origin = computed(() => (anim.value ? sceneOrigin.origin(anim.value) : { x: 0, y: 0 }));

/** Edits one point. The default "edit …" label lets rapid field edits coalesce in history. */
function update(i: number, patch: Partial<HitCoord>, label = 'edit collision point'): void {
  ed.edit(label, (a) => {
    a.hitCoords = a.hitCoords.map((c, k) => (k === i ? { ...c, ...patch } : c));
  });
}

function add(at?: { x: number; y: number }): void {
  const a = anim.value;
  if (!a) return;
  const s = a.sprites[currentSprite.value];
  // Centre of the drawn image: header sizes of empty sprites can be garbage (60537×60537).
  const d = s ? shared.decoded(s) : null;
  const p =
    at ??
    (s && d
      ? { x: s.posX + Math.floor(d.width / 2), y: s.posY + Math.floor(d.height / 2) }
      : { x: 0, y: 0 });
  const n = a.hitCoords.length;
  ed.edit('add collision point', (x) => {
    x.hitCoords = [
      ...x.hitCoords,
      { x: clampHit(p.x), y: clampHit(p.y), spriteId: currentSprite.value, null: 0 },
    ];
  });
  sel.selectHitCoord(n);
}

function remove(i: number): void {
  ed.edit('delete collision point', (a) => {
    a.hitCoords = a.hitCoords.filter((_, k) => k !== i);
  });
  sel.selectHitCoord(null);
}

function duplicate(i: number): void {
  const c = anim.value?.hitCoords[i];
  if (!c) return;
  ed.edit('duplicate collision point', (a) => {
    a.hitCoords = [...a.hitCoords, { ...c }];
  });
}

async function clearSprite(): Promise<void> {
  const n = anim.value?.hitCoords.filter((c) => c.spriteId === currentSprite.value).length ?? 0;
  if (
    !n ||
    !(await confirm(
      'Clear points?',
      `Remove the ${n} collision point(s) of sprite ${spriteLetter(currentSprite.value)}?`,
      'Remove',
    ))
  )
    return;
  ed.edit('clear collision points', (a) => {
    a.hitCoords = a.hitCoords.filter((c) => c.spriteId !== currentSprite.value);
  });
}

const copySources = computed(() => {
  const d = docs.doc.value;
  const a = anim.value;
  if (!d || !a) return [];
  const out: { value: string; label: string }[] = [];
  a.sprites.forEach((_, i) => {
    if (i !== currentSprite.value && a.hitCoords.some((c) => c.spriteId === i))
      out.push({ value: `${sel.animId.value}:${i}`, label: `Sprite ${spriteLetter(i)}` });
  });
  for (const [id, other] of animationsOf(d)) {
    if (id === sel.animId.value) continue;
    if (other.hitCoords.some((c) => c.spriteId === currentSprite.value)) {
      out.push({
        value: `${id}:${currentSprite.value}`,
        label: `${animationLabel(docs.kind.value ?? 'af', id)} · ${spriteLetter(currentSprite.value)}`,
      });
    }
  }
  return out;
});

function doCopy(v: string): void {
  copyFrom.value = '';
  const d = docs.doc.value;
  if (!d || !v) return;
  const [aid, sid] = v.split(':').map(Number) as [number, number];
  const src =
    animationsOf(d)
      .get(aid)
      ?.hitCoords.filter((c) => c.spriteId === sid) ?? [];
  ed.edit('copy collision points', (a) => {
    a.hitCoords = [...a.hitCoords, ...src.map((c) => ({ ...c, spriteId: currentSprite.value }))];
  });
}

// --------------------------------------------------------- canvas interaction
// SceneCanvas reports pointer events in scene pixels (`p`).
type ScenePointer = { type: string; p: Point; ev: PointerEvent | MouseEvent };

/** Point being dragged: its stored value at the press and the press position. */
let drag: { i: number; start: Point; orig: { x: number; y: number }; moved: boolean } | null = null;

/** Point of the current sprite under scene position `p`. */
function pointAt(p: Point): number | null {
  const a = anim.value;
  return a ? nearestHit(a.hitCoords, currentSprite.value, p, origin.value, facingLeft.value) : null;
}

/** Left press: adds a point in place mode, otherwise selects the point there and starts dragging it. */
function onPress(e: ScenePointer, hitCoords: readonly HitCoord[]): void {
  menu.value = null;
  pb.pause();
  if (placing.value) {
    add(hitFromScene(e.p, origin.value, facingLeft.value));
    return;
  }
  const i = pointAt(e.p);
  sel.selectHitCoord(i);
  if (i === null) return;
  (e.ev.target as HTMLElement).setPointerCapture?.((e.ev as PointerEvent).pointerId);
  const c = hitCoords[i]!;
  drag = { i, start: e.p, orig: { x: c.x, y: c.y }, moved: false };
}

/** Moves the dragged point by the pointer offset; Shift keeps the larger axis only. */
function onDrag(e: ScenePointer, d: NonNullable<typeof drag>): void {
  let dx = e.p.x - d.start.x;
  let dy = e.p.y - d.start.y;
  if (e.ev.shiftKey) {
    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  // No history entry for a click that does not move.
  if (!dx && !dy && !d.moved) return;
  d.moved = true;
  // Screen offsets mirror back into stored (facing right) offsets.
  const sx = facingLeft.value ? -dx : dx;
  update(
    d.i,
    { x: clampHit(d.orig.x + sx), y: clampHit(d.orig.y + dy) },
    // One undo step per drag: "edit …" labels coalesce while the pointer keeps moving.
    `edit collision point ${d.i}`,
  );
}

function onContextMenu(e: ScenePointer): void {
  const i = pointAt(e.p);
  if (i === null) return;
  sel.selectHitCoord(i);
  menu.value = { i, x: (e.ev as MouseEvent).clientX, y: (e.ev as MouseEvent).clientY };
}

function onPointer(e: ScenePointer): void {
  const a = anim.value;
  if (!a) return;
  if (e.type === 'down' && (e.ev as PointerEvent).button === 0) onPress(e, a.hitCoords);
  else if (e.type === 'move' && drag) onDrag(e, drag);
  else if (e.type === 'up') drag = null;
  else if (e.type === 'contextmenu') onContextMenu(e);
}

function nudge(dx: number, dy: number): void {
  const i = sel.hitCoordIndex.value;
  const c = i === null ? undefined : anim.value?.hitCoords[i];
  if (i === null || !c) return;
  update(i, { x: clampHit(c.x + dx), y: clampHit(c.y + dy) }, `edit collision point ${i}`);
}

function selectRow(i: number): void {
  sel.selectHitCoord(i);
  const c = anim.value?.hitCoords[i];
  if (c && c.spriteId !== currentSprite.value) {
    pb.pause();
    currentSprite.value = c.spriteId;
  }
}

/** ?point=N (from the Problems view) selects that point and shows its sprite. */
function selectQueryPoint(): void {
  const q = Number(route.query.point);
  const c = Number.isInteger(q) ? anim.value?.hitCoords[q] : undefined;
  if (!c) return;
  // A point of a missing sprite is only listed with "show all sprites".
  if (c.spriteId < (anim.value?.sprites.length ?? 0)) currentSprite.value = c.spriteId;
  else showAll.value = true;
  sel.selectHitCoord(q);
}

let off: (() => void)[] = [];
onMounted(() => {
  pb.pause();
  selectQueryPoint();
  off = [
    shortcuts.activate('collisions'),
    shortcuts.register('collisions', [
      {
        keys: 'Shift+KeyH',
        label: 'Shift+H',
        description: 'Place collision points by clicking',
        run: () => (placing.value = !placing.value),
      },
      {
        keys: 'Escape',
        label: 'Esc',
        description: 'Leave place mode',
        run: () => ((placing.value = false), (menu.value = null)),
      },
      {
        keys: 'Delete',
        label: 'Delete',
        description: 'Delete the selected point',
        run: () => sel.hitCoordIndex.value !== null && remove(sel.hitCoordIndex.value),
      },
      {
        keys: 'Backspace',
        label: 'Backspace',
        description: 'Delete the selected point',
        run: () => sel.hitCoordIndex.value !== null && remove(sel.hitCoordIndex.value),
      },
      ...(
        [
          ['ArrowLeft', -1, 0, '←'],
          ['ArrowRight', 1, 0, '→'],
          ['ArrowUp', 0, -1, '↑'],
          ['ArrowDown', 0, 1, '↓'],
        ] as const
      ).flatMap(([k, dx, dy, l]) => [
        { keys: k, label: l, description: 'Nudge the selected point', run: () => nudge(dx, dy) },
        {
          keys: `Shift+${k}`,
          label: `Shift+${l}`,
          description: 'Nudge the selected point by 8',
          run: () => nudge(dx * 8, dy * 8),
        },
      ]),
    ]),
  ];
});
onBeforeUnmount(() => off.forEach((f) => f()));
</script>

<template>
  <div
    v-if="anim"
    class="view-pad d-flex gap-4 flex-wrap align-items-start"
    data-testid="view.collisions"
    @click="menu = null"
  >
    <div class="scene-preview">
      <ViewportToolbar />
      <SceneCanvas
        ref="canvas"
        :animation="anim"
        :sprite-override="pinned"
        :selected-hit="sel.hitCoordIndex.value"
        :all-hits="showAll"
        interactive
        @pointer="onPointer"
      />
      <PlaybackBar />
      <SpriteStrip
        :animation="anim"
        :anim-id="sel.animId.value!"
        :current="currentSprite"
        @select="
          (i) => {
            pb.pause();
            currentSprite = i;
          }
        "
      />
      <div
        v-if="placing"
        class="alert alert-info py-1 px-2 small mt-2"
        data-testid="collisions.placing"
      >
        Place mode: click on the canvas to add points to sprite {{ spriteLetter(currentSprite) }}.
        <button class="btn btn-link btn-sm p-0 align-baseline" @click.stop="placing = false">
          Done
        </button>
      </div>
    </div>

    <div style="flex: 0 1 400px; min-width: 360px">
      <div class="d-flex align-items-center gap-2 flex-wrap mb-2">
        <strong>Collision points</strong>
        <label class="d-flex align-items-center gap-1 small"
          >sprite
          <select
            v-model.number="currentSprite"
            class="form-select form-select-sm"
            style="width: auto"
            data-testid="collisions.sprite"
            @change="pb.pause()"
          >
            <option v-for="(_, i) in anim.sprites" :key="i" :value="i">
              {{ spriteLetter(i) }}
            </option>
          </select>
        </label>
        <label class="form-check small mb-0"
          ><input
            v-model="showAll"
            type="checkbox"
            class="form-check-input"
            data-testid="collisions.show-all"
          />
          show all sprites</label
        >
      </div>
      <div class="d-flex gap-2 flex-wrap mb-2">
        <button class="btn btn-sm btn-outline-primary" data-testid="collisions.add" @click="add()">
          <Icon name="plus" /> Add
        </button>
        <button
          class="btn btn-sm"
          :class="placing ? 'btn-warning' : 'btn-outline-secondary'"
          data-testid="collisions.place"
          @click.stop="placing = !placing"
        >
          Place (Shift+H)
        </button>
        <select
          v-model="copyFrom"
          class="form-select form-select-sm"
          style="width: auto"
          :disabled="!copySources.length"
          aria-label="Copy points from"
          data-testid="collisions.copy"
          @change="doCopy(copyFrom)"
        >
          <option value="">Copy from…</option>
          <option v-for="s in copySources" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
        <button
          class="btn btn-sm btn-outline-danger"
          data-testid="collisions.clear"
          @click="clearSprite"
        >
          Clear sprite
        </button>
      </div>
      <table class="table table-sm align-middle small" data-testid="collisions.table">
        <thead>
          <tr>
            <th>#</th>
            <th>Sprite</th>
            <th>x</th>
            <th>y</th>
            <th>null</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.i"
            :class="{
              'table-warning': r.i === sel.hitCoordIndex.value,
              'text-secondary': r.c.spriteId !== currentSprite,
              'table-danger': r.c.spriteId >= anim.sprites.length,
            }"
            :data-testid="`collisions.row.${r.i}`"
            @click="selectRow(r.i)"
          >
            <td class="mono">{{ r.i }}</td>
            <td>
              <select
                class="form-select form-select-sm"
                style="width: auto"
                :value="r.c.spriteId"
                :aria-label="`Sprite of point ${r.i}`"
                :data-testid="`collisions.row.${r.i}.sprite`"
                @change="update(r.i, { spriteId: Number(inputValue($event)) })"
              >
                <option v-if="r.c.spriteId >= anim.sprites.length" :value="r.c.spriteId">
                  {{ r.c.spriteId }} (missing)
                </option>
                <option v-for="(_, i) in anim.sprites" :key="i" :value="i">
                  {{ spriteLetter(i) }}
                </option>
              </select>
            </td>
            <td>
              <IntField
                :model-value="r.c.x"
                :min="HIT_MIN"
                :max="HIT_MAX"
                :testid="`collisions.row.${r.i}.x`"
                @update:model-value="update(r.i, { x: $event })"
              />
            </td>
            <td>
              <IntField
                :model-value="r.c.y"
                :min="HIT_MIN"
                :max="HIT_MAX"
                :testid="`collisions.row.${r.i}.y`"
                @update:model-value="update(r.i, { y: $event })"
              />
            </td>
            <td class="mono text-secondary">{{ r.c.null }}</td>
            <td>
              <button
                class="btn btn-sm btn-link text-danger p-0"
                :aria-label="`Delete point ${r.i}`"
                :data-testid="`collisions.row.${r.i}.delete`"
                @click.stop="remove(r.i)"
              >
                <Icon name="trash" />
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="6" class="text-secondary">
              No points{{ showAll ? '' : ` on sprite ${spriteLetter(currentSprite)}` }}.
            </td>
          </tr>
        </tbody>
      </table>
      <p class="small text-secondary">
        Points belong to a sprite and are relative to the animation origin. The game tests the
        attacker's points of its current sprite against the defender's opaque pixels; facing left
        mirrors them.
      </p>
    </div>

    <ul
      v-if="menu"
      class="dropdown-menu show position-fixed"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      data-testid="collisions.menu"
      @click.stop
    >
      <li>
        <button class="dropdown-item" @click="(remove(menu.i), (menu = null))">Delete</button>
      </li>
      <li>
        <button class="dropdown-item" @click="(duplicate(menu.i), (menu = null))">Duplicate</button>
      </li>
      <li><h6 class="dropdown-header">Move to sprite</h6></li>
      <li v-for="(_, k) in anim.sprites" :key="k">
        <button class="dropdown-item" @click="(update(menu.i, { spriteId: k }), (menu = null))">
          {{ spriteLetter(k) }}
        </button>
      </li>
    </ul>
  </div>
</template>
