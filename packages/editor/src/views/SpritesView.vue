<script setup lang="ts">
// Sprite list and header fields of one animation (spec 12 §4.2), with add,
// import, delete, reorder and PNG export. Pixel editing is PixelEditorView.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  encodeScript,
  encodeSprite,
  spritePaletteRange,
  decodeScript,
  spriteIndexOfFrame,
  spriteLetter,
  type Sprite,
} from '@omf/formats';
import Icon from '../components/Icon.vue';
import Thumb from '../components/Thumb.vue';
import IntField from '../components/widgets/IntField.vue';
import FieldCode from '../components/widgets/FieldCode.vue';
import SceneCanvas from '../components/scene/SceneCanvas.vue';
import SheetDialog from '../components/SheetDialog.vue';
import ExportDialog from '../components/ExportDialog.vue';
import { useDocument } from '../composables/useDocument';
import { useSelection } from '../composables/useSelection';
import { useSharedImages } from '../composables/useSharedImages';
import { usePlayback } from '../composables/usePlayback';
import { useConfirm } from '../composables/useConfirm';
import { useAnimationEdit } from '../composables/useAnimationEdit';
import { useSpriteImport, PNG_TYPES } from '../composables/useSpriteImport';
import { useShortcuts } from '../composables/useShortcuts';
import { useToasts } from '../composables/useToasts';
import { animationLabel, animationsOf } from '../lib/doc';
import {
  deleteSpriteFrom,
  framesShowing,
  freeImageIndex,
  keepImagesOfDoomedOwners,
  ownerRef,
  sharersLosingOwner,
  sharersOf,
  spriteLabel,
  stringLabel,
  type SpriteRef,
} from '../lib/spriteEdit';
import { templateSprite } from '../lib/templates';
import { blank } from '../lib/pixels';
import { indexedPngOf, rgbaPngOf } from '../codecs/export';
import { download, pickFile } from '../lib/files';
import { remapSprites } from '../lib/scriptOps';
import { errorMessage } from '../composables/useToasts';

const router = useRouter();
const docs = useDocument();
const sel = useSelection();
const shared = useSharedImages();
const pb = usePlayback();
const { ask } = useConfirm();
const ed = useAnimationEdit(() => sel.animId.value);
const imp = useSpriteImport();
const shortcuts = useShortcuts();
const toasts = useToasts();
const sheetOpen = ref(false);
const exportOpen = ref(false);

const anim = computed(() => sel.animation.value);
const current = computed(() => {
  const i = sel.spriteIndex.value ?? 0;
  return anim.value && i < anim.value.sprites.length ? i : anim.value?.sprites.length ? 0 : null;
});
const sprite = computed<Sprite | null>(() =>
  anim.value && current.value !== null ? (anim.value.sprites[current.value] ?? null) : null,
);
const decoded = computed(() => (sprite.value ? shared.decoded(sprite.value) : null));
/** Sprites the playing script shows. */
const usedLetters = computed(() => new Set(pb.script.value.frames.map(spriteIndexOfFrame)));
const range = computed(() => (decoded.value ? spritePaletteRange(decoded.value) : null));
const ref_ = (i: number): SpriteRef => ({ animId: sel.animId.value!, index: i });

const shareInfo = computed(() => {
  const d = docs.doc.value;
  const s = sprite.value;
  if (!d || !s) return null;
  if (s.missing) {
    const o = ownerRef(d, s);
    return o
      ? `shares the image of ${spriteLabel(o)}`
      : 'shared, but no owner found (renders empty)';
  }
  const sh = sharersOf(d, s);
  return sh.length ? `owner; shared with ${sh.map(spriteLabel).join(', ')}` : null;
});

function select(i: number): void {
  sel.selectSprite(i);
}

function setField<K extends keyof Sprite>(key: K, value: Sprite[K]): void {
  const i = current.value;
  if (i === null) return;
  ed.edit(`set sprite ${String(key)}`, (a) => {
    a.sprites[i] = { ...a.sprites[i]!, [key]: value };
  });
}

/** The sprite count is a u8 in the animation header. */
const MAX_SPRITES = 255;

/** Refuses with a toast when the animation is full. */
function roomForSprite(): boolean {
  if ((anim.value?.sprites.length ?? 0) < MAX_SPRITES) return true;
  toasts.error(`An animation can have at most ${MAX_SPRITES} sprites`);
  return false;
}

function addSprite(): void {
  const d = docs.doc.value;
  if (!d || !anim.value || !roomForSprite()) return;
  const sprite = templateSprite(freeImageIndex(d));
  const n = anim.value.sprites.length;
  ed.edit('add sprite', (a) => {
    a.sprites = [...a.sprites, sprite];
  });
  select(n);
}

/** Adds a sprite from a PNG under a fresh image index, so nothing shares it. */
async function importNew(): Promise<void> {
  if (!docs.doc.value || !anim.value || !roomForSprite()) return;
  const f = await pickFile(PNG_TYPES);
  if (!f) return;
  const dec = await imp.decodeAndMatch(f);
  if (!dec || !docs.doc.value || !anim.value) return;
  let image: Uint8Array;
  try {
    image = encodeSprite(dec);
  } catch (e) {
    toasts.error(`${f.name}: ${errorMessage(e)}`);
    return;
  }
  const n = anim.value.sprites.length;
  const index = freeImageIndex(docs.doc.value);
  ed.edit('import sprite', (a) => {
    a.sprites = [
      ...a.sprites,
      {
        // Origin at the bottom centre, where a HAR stands.
        posX: -Math.floor(dec.width / 2),
        posY: -dec.height,
        width: dec.width,
        height: dec.height,
        index,
        missing: false,
        image,
      },
    ];
  });
  select(n);
}

/**
 * Asks before deleting sprite `letter`: lists the frames that go with it, and
 * when it owns an image others share, offers to hand the image to the first
 * sharer. Resolves 'delete', 'keep' (hand over) or anything else to cancel.
 */
function confirmDelete(
  letter: string,
  frames: { string: number; frame: number }[],
  sharers: SpriteRef[],
): Promise<string> {
  return ask({
    title: `Delete sprite ${letter}?`,
    message: [
      frames.length
        ? 'These frames show it and are removed; later letters shift down by one.'
        : 'No frame shows it. Later letters shift down by one.',
      sharers.length
        ? `It owns an image that ${sharers.map(spriteLabel).join(', ')} share; without it they show another image or crash the game.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    details: frames.map((f) => `${stringLabel(f.string)}, frame ${f.frame + 1}`),
    choices: [
      { id: 'cancel', label: 'Cancel', variant: 'outline-secondary' },
      { id: 'delete', label: 'Delete', variant: sharers.length ? 'secondary' : 'danger' },
      ...(sharers.length
        ? [
            {
              id: 'keep',
              label: `Delete, give the image to ${spriteLabel(sharers[0]!)}`,
              variant: 'danger' as const,
            },
          ]
        : []),
    ],
  });
}

/** Deletes the current sprite with its frames and points (see deleteSpriteFrom). */
async function deleteSprite(): Promise<void> {
  const i = current.value;
  const a = anim.value;
  const d = docs.doc.value;
  const id = sel.animId.value;
  if (i === null || !a || !d || id === null) return;
  const letter = spriteLetter(i);
  // Dry run on a shallow copy: refuses when a string would lose every frame.
  const blocked = deleteSpriteFrom({ ...a }, i);
  if (blocked) {
    toasts.error(`Cannot delete sprite ${letter}: ${blocked}`);
    return;
  }
  const doomed = (r: SpriteRef): boolean => r.animId === id && r.index === i;
  const sharers = sharersLosingOwner(d, doomed).flatMap((o) => o.sharers);
  const c = await confirmDelete(letter, framesShowing(a, i), sharers);
  if (c !== 'delete' && c !== 'keep') return;
  docs.mutate('delete sprite', (x) => {
    if (c === 'keep') keepImagesOfDoomedOwners(x, doomed);
    deleteSpriteFrom(animationsOf(x).get(id)!, i);
  });
  select(Math.max(0, i - 1));
}

async function clearImage(): Promise<void> {
  const i = current.value;
  if (i === null) return;
  await imp.applyImage(ref_(i), blank(1, 1), 'clear sprite');
}

async function exportPng(): Promise<void> {
  const d = decoded.value;
  if (!d || d.width === 0 || current.value === null) return;
  const name = `${docs.fileName.value}-${sel.animId.value}-${spriteLetter(current.value)}.png`;
  // Stored indices with the palette imports match against, so the file re-imports unchanged.
  const bytes = indexedPngOf(d, imp.matchPalette.value) ?? (await rgbaPngOf(d, imp.matchLut.value));
  download(name, bytes, 'image/png');
}

// Reordering: drag a thumbnail onto another.
let dragFrom = -1;
/**
 * Moves sprite `dragFrom` to `to`. Frame letters address sprites by position,
 * so collision points always follow their sprite, and on request the scripts
 * are rewritten to keep showing the same images.
 */
async function onDrop(to: number): Promise<void> {
  const from = dragFrom;
  dragFrom = -1;
  if (from < 0 || from === to || !anim.value) return;
  const c = await ask({
    title: 'Reorder sprites',
    message:
      'Frame letters refer to sprites by position. Rewrite the script so frames keep showing the same images?',
    choices: [
      { id: 'cancel', label: 'Cancel', variant: 'outline-secondary' },
      { id: 'keep', label: 'Reorder only', variant: 'secondary' },
      { id: 'rewrite', label: 'Reorder and rewrite', variant: 'primary' },
    ],
  });
  if (c === 'cancel') return;
  const n = anim.value.sprites.length;
  const order = Array.from({ length: n }, (_, k) => k);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved!);
  ed.edit('reorder sprites', (a) => {
    a.sprites = order.map((k) => a.sprites[k]!);
    // order[new] = old; points need old → new.
    const inv = new Map(order.map((old, nu) => [old, nu]));
    a.hitCoords = a.hitCoords.map((h) => ({ ...h, spriteId: inv.get(h.spriteId) ?? h.spriteId }));
    if (c === 'rewrite') {
      a.extraStrings = a.extraStrings.map((s) =>
        encodeScript(remapSprites(decodeScript(s), order)),
      );
      a.baseString = encodeScript(remapSprites(decodeScript(a.baseString), order));
    }
  });
  select(to);
}

watch(
  () => sel.animId.value,
  () => select(0),
);

let off: (() => void)[] = [];
onMounted(() => {
  pb.play({ silent: true });
  off = [
    shortcuts.activate('sprites'),
    shortcuts.register('sprites', [
      {
        keys: 'KeyE',
        label: 'E',
        description: 'Edit the pixels of the selected sprite',
        run: () =>
          current.value !== null &&
          router.push({ name: 'anim-pixels', params: { id: sel.animId.value, n: current.value } }),
      },
      {
        keys: 'ArrowLeft',
        label: '←',
        description: 'Previous sprite',
        run: () => current.value !== null && select(Math.max(0, current.value - 1)),
      },
      {
        keys: 'ArrowRight',
        label: '→',
        description: 'Next sprite',
        run: () =>
          current.value !== null &&
          anim.value &&
          select(Math.min(anim.value.sprites.length - 1, current.value + 1)),
      },
    ]),
  ];
});
onBeforeUnmount(() => off.forEach((f) => f()));
</script>

<template>
  <div
    v-if="anim"
    class="view-pad d-flex gap-4 flex-wrap align-items-start"
    data-testid="view.sprites"
  >
    <div style="flex: 1 1 520px; min-width: 0">
      <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <h6 class="mb-0">Sprites ({{ anim.sprites.length }})</h6>
        <button
          class="btn btn-sm btn-outline-primary ms-auto"
          data-testid="sprites.add"
          @click="addSprite"
        >
          <Icon name="plus" /> Add
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          data-testid="sprites.import"
          @click="importNew"
        >
          <Icon name="upload" /> Import PNG…
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          data-testid="sprites.sheet"
          @click="sheetOpen = true"
        >
          Sheet…
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          data-testid="sprites.export"
          @click="exportOpen = true"
        >
          Export…
        </button>
      </div>
      <div class="d-flex flex-wrap gap-2" data-testid="sprites.grid">
        <div
          v-for="(s, i) in anim.sprites"
          :key="i"
          class="sprite-cell p-1"
          :class="{ active: current === i, unused: !usedLetters.has(i) }"
          draggable="true"
          :title="usedLetters.has(i) ? '' : 'No frame of the base string uses this sprite'"
          :data-testid="`sprites.cell.${i}`"
          @click="select(i)"
          @dblclick="router.push({ name: 'anim-pixels', params: { id: sel.animId.value, n: i } })"
          @dragstart="dragFrom = i"
          @dragover.prevent
          @drop="onDrop(i)"
        >
          <Thumb :decoded="shared.decoded(s)" :size="64" shift />
          <div class="mono">
            {{ spriteLetter(i) }}<span v-if="s.missing" title="Shared image">↪</span>
          </div>
          <div class="text-secondary">
            {{ s.width === 0 || s.height === 0 ? '∅' : `${s.width}×${s.height}` }}
          </div>
        </div>
      </div>
      <div class="mt-3">
        <h6 class="small text-secondary">Preview</h6>
        <SceneCanvas :animation="anim" testid="sprites.preview" />
      </div>
    </div>

    <div
      v-if="sprite && current !== null"
      class="card"
      style="flex: 0 0 300px"
      data-testid="sprites.detail"
    >
      <div class="card-body">
        <h6 class="card-title">Sprite {{ spriteLetter(current) }}</h6>
        <div class="mb-2"><Thumb v-if="decoded" :decoded="decoded" :size="160" shift /></div>
        <IntField
          :model-value="sprite.posX"
          :min="-32768"
          :max="32767"
          label="X offset"
          code="pos_x"
          testid="sprite.pos_x"
          @update:model-value="setField('posX', $event)"
        />
        <IntField
          :model-value="sprite.posY"
          :min="-32768"
          :max="32767"
          label="Y offset"
          code="pos_y"
          testid="sprite.pos_y"
          @update:model-value="setField('posY', $event)"
        />
        <div class="small mb-1" data-testid="sprite.size">
          {{ sprite.width }}×{{ sprite.height }}
        </div>
        <IntField
          :model-value="sprite.index"
          :min="0"
          :max="255"
          label="Image index"
          code="index"
          testid="sprite.index"
          @update:model-value="setField('index', $event)"
        />
        <label class="form-check small mb-1" title="missing">
          <input
            class="form-check-input"
            type="checkbox"
            :checked="sprite.missing"
            data-testid="sprite.missing"
            @change="setField('missing', ($event.target as HTMLInputElement).checked)"
          />
          Shared image <FieldCode name="missing" />
        </label>
        <div class="small text-secondary" data-testid="sprite.info">
          {{ sprite.missing ? 0 : sprite.image.length }} B
          <template v-if="range && range.used.length">
            · indices {{ range.start }}–{{ range.end }} ({{ range.used.length }})</template
          >
        </div>
        <div v-if="shareInfo" class="small text-secondary" data-testid="sprite.shared">
          {{ shareInfo }}
        </div>
        <div class="d-flex flex-wrap gap-1 mt-2">
          <RouterLink
            class="btn btn-sm btn-primary"
            :to="{ name: 'anim-pixels', params: { id: sel.animId.value, n: current } }"
            data-testid="sprite.edit"
          >
            <Icon name="pencil" /> Edit pixels
          </RouterLink>
          <button
            class="btn btn-sm btn-outline-secondary"
            data-testid="sprite.import"
            @click="imp.importInto(ref_(current))"
          >
            <Icon name="upload" /> Import PNG
          </button>
          <button
            class="btn btn-sm btn-outline-secondary"
            data-testid="sprite.export"
            @click="exportPng"
          >
            <Icon name="download" /> Export PNG
          </button>
          <button
            class="btn btn-sm btn-outline-secondary"
            data-testid="sprite.clear"
            @click="clearImage"
          >
            Clear
          </button>
          <button
            class="btn btn-sm btn-outline-danger"
            aria-label="Delete sprite"
            data-testid="sprite.delete"
            @click="deleteSprite"
          >
            <Icon name="trash" />
          </button>
        </div>
        <p class="small text-secondary mt-2 mb-0">
          In {{ animationLabel(docs.kind.value ?? 'af', sel.animId.value!) }},
          {{ animationsOf(docs.doc.value!).size }} animations in the file.
        </p>
      </div>
    </div>
    <SheetDialog v-if="sheetOpen" @close="sheetOpen = false" />
    <ExportDialog v-if="exportOpen" @close="exportOpen = false" />
  </div>
</template>
