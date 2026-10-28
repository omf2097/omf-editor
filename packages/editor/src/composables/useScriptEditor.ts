import { computed, effectScope, ref, shallowRef, watch } from 'vue';
import {
  AF_ENEMY_STRING_MAX,
  LIMITS,
  cp437Length,
  encodeScript,
  lintScriptString,
  decodeScript,
  type DecodedSprite,
  type Script,
  type Sprite,
  type Tag,
} from '@omf/formats';
import { useWorkingScript } from './useWorkingScript';
import { useSelection } from './useSelection';
import { usePlayback } from './usePlayback';
import { useDocument } from './useDocument';
import { useSharedImages } from './useSharedImages';
import { useOpponent } from './useOpponent';
import { usePalette } from './usePalette';

const selectedFrame = ref(0);
const effectsClipboard = shallowRef<Tag[] | null>(null);
/** Frame whose add-effect picker is open (one at a time). */
const pickerFrame = ref<number | null>(null);
let watching = false;

/** The Script view's model: the string being edited, parsed, with edit actions. */
export function useScriptEditor() {
  const working = useWorkingScript();
  const sel = useSelection();
  const pb = usePlayback();
  const shared = useSharedImages();
  const opponent = useOpponent();
  const palette = usePalette();

  // Another document: its frames have nothing to do with the old selection.
  if (!watching) {
    watching = true;
    const docs = useDocument();
    effectScope(true).run(() =>
      watch(docs.generation, () => {
        selectedFrame.value = 0;
        pickerFrame.value = null;
      }),
    );
  }

  /** The string being edited is the one playback plays: 'base', an extra string index or 'enemy'. */
  const target = computed(() => pb.source.value);
  /** The working text (an uncommitted edit, see useWorkingScript) or the stored string. */
  const text = computed(() =>
    sel.animId.value === null ? '' : working.textFor(sel.animId.value, target.value),
  );
  // Every string parses (openomf skips what it cannot read; spec 08).
  const script = computed<Script>(() => decodeScript(text.value));
  const enemy = computed(() => target.value === 'enemy');
  /**
   * The sprites the frame letters show: the animation's own, or for the enemy
   * string the opponent's move 9 (its script is replaced by the enemy string).
   */
  const sprites = computed<readonly Sprite[]>(() =>
    enemy.value ? (opponent.damage.value?.sprites ?? []) : (sel.animation.value?.sprites ?? []),
  );
  const spriteCount = computed(() => sprites.value.length);
  /** Decodes one of `sprites`, its shared image resolved in its own file. */
  const decode = (s: Sprite): DecodedSprite =>
    enemy.value ? opponent.decode(s) : shared.decoded(s);
  /** Palette player offset of those sprites: the opponent is the other player. */
  const playerOffset = computed(() =>
    enemy.value ? 48 - palette.playerOffset.value : palette.playerOffset.value,
  );
  const diagnostics = computed(() => lintScriptString(text.value, spriteCount.value));
  /** Bytes in the string and openomf's limit for it (more blocks saving, spec 05/06). */
  const bytes = computed(() => ({
    used: cp437Length(text.value),
    max: enemy.value
      ? AF_ENEMY_STRING_MAX
      : target.value === 'base'
        ? LIMITS.baseString
        : LIMITS.extraString,
  }));

  function setText(t: string, label?: string): void {
    if (sel.animId.value === null) return;
    working.set(sel.animId.value, target.value, t, label);
  }
  /**
   * Encodes `s`; frames without `raw` (the ones scriptOps touched) are written
   * canonically, the others as they were. With a label the edit is a discrete
   * operation (own undo step, committed now); without, it is debounced.
   */
  function apply(s: Script, label?: string): void {
    setText(encodeScript(s), label);
  }
  function selectFrame(i: number, seek = true): void {
    selectedFrame.value = i;
    if (seek) pb.seekFrame(i);
  }

  return {
    target,
    text,
    script,
    sprites,
    spriteCount,
    decode,
    playerOffset,
    diagnostics,
    bytes,
    selectedFrame,
    effectsClipboard,
    pickerFrame,
    setText,
    apply,
    selectFrame,
    flush: working.flush,
  };
}
