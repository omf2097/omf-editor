// The opponent an AF move's enemy string is played on (spec 15 §6.1), and the
// preview settings around it. The enemy string replaces the script of the
// OPPONENT's move 9 (ANIM_DAMAGE; har.c har_take_damage, player.c `ua`), so
// its frame letters are the opponent's move 9 sprites. The opponent is this
// document (a mirror match) unless another AF is loaded; that choice is kept
// for the session, across documents.
//
// Module state with no dependency on usePlayback, which reads planFor().

import { computed, ref, shallowRef } from 'vue';
import {
  decodeScript,
  readAF,
  resolveSharedImages,
  type AFFile,
  type AFMove,
  type DecodedSprite,
  type Script,
  type Sprite,
} from '@omf/formats';
import { useDocument } from './useDocument';
import { useSharedImages } from './useSharedImages';
import { useWorkingScript } from './useWorkingScript';
import { errorMessage, useToasts } from './useToasts';
import { useSceneOrigin } from './useSceneOrigin';
import { useViewport } from './useViewport';
import { Simulator, type SimState } from '../lib/simulate';
import type { Point } from '../lib/scene';
import { decodedOf } from '../canvas/render';
import { isAF } from '../lib/doc';
import { pickFile } from '../lib/files';
import {
  STANDING,
  effectiveEnemyString,
  launchFrames,
  type EffectiveEnemyString,
  type EnemyVariant,
} from '../lib/enemyString';
import {
  DEFAULT_PAIR_DISTANCE,
  attackerOffset,
  pairOrigins,
  pairTiming,
  uaFrame,
  type PairTiming,
} from '../lib/enemyPair';

/** openomf ANIM_DAMAGE: the opponent animation the enemy string plays in. */
export const DAMAGE_MOVE = 9;
/** ANIM_IDLE: what the opponent shows in the paired preview before it is hit. */
export const IDLE_MOVE = 11;

export interface OpponentFile {
  name: string;
  af: AFFile;
  /** Shared-image owners of its sprites (spec 04). */
  owners: Map<Sprite, Sprite>;
}

const { doc } = useDocument();
const { textFor } = useWorkingScript();
const shared = useSharedImages();
const scene = useSceneOrigin();
const { toggles } = useViewport();

/** Another fighter loaded as the opponent; null plays the document against itself. */
const loaded = shallowRef<OpponentFile | null>(null);
/** The opponent's state when hit (Standing / Airborne, stun or KO, launch). */
const variant = ref<EnemyVariant>({ ...STANDING });
/** Play the attacker's base string alongside ("with the move"). */
const paired = ref(false);
/** Origin-to-origin distance in the paired preview. */
const distance = ref(DEFAULT_PAIR_DISTANCE);
/** The attacker frame a hit lands on, chosen for one move; null picks the default. */
const hitFrame = ref<{ animId: number; frame: number } | null>(null);

const opponentAf = computed<AFFile | null>(() => {
  if (loaded.value) return loaded.value.af;
  const d = doc.value;
  return d && isAF(d) ? d : null;
});
const damage = computed<AFMove | null>(() => opponentAf.value?.moves.get(DAMAGE_MOVE) ?? null);
const idle = computed<AFMove | null>(() => opponentAf.value?.moves.get(IDLE_MOVE) ?? null);

/** A sprite of the opponent, its shared image resolved in its own file. */
function decode(s: Sprite): DecodedSprite {
  const f = loaded.value;
  return f ? decodedOf(s, f.owners.get(s)) : shared.decoded(s);
}

function loadBytes(name: string, bytes: Uint8Array): boolean {
  try {
    const af = readAF(bytes);
    loaded.value = { name, af, owners: resolveSharedImages(af.moves.values()) };
    return true;
  } catch (e) {
    useToasts().error(`${name} is not a usable AF: ${errorMessage(e)}`);
    return false;
  }
}

async function load(): Promise<boolean> {
  const p = await pickFile([
    { description: 'OMF fighter', accept: { 'application/octet-stream': ['.af', '.AF'] } },
  ]);
  return p ? loadBytes(p.name, p.bytes) : false;
}

export interface EnemyPlan {
  /** What openomf plays on the opponent for the chosen variant. */
  effective: EffectiveEnemyString;
  /** The variant used: forced to Standing when the move throws. */
  variant: EnemyVariant;
  /**
   * Why variants do not apply: `ua` (the attacker forces the string, player.c)
   * or `throw` (throw_duration > 0: har_take_damage adds nothing); else null.
   */
  plain: 'ua' | 'throw' | null;
  /** Attacker frames with `ai` (would launch); empty for projectiles. */
  launch: number[];
  /** Paired preview timing; null when the opponent plays alone. */
  timing: PairTiming | null;
  /** The paired preview's attacker; null when the opponent plays alone. */
  pair: {
    move: AFMove;
    base: Script;
    /** Its state at each reader tick (Simulator.statesByTick). */
    states: SimState[];
    origins: { attacker: Point; opponent: Point };
  } | null;
  /** Simulator start, lead and `e` target (SimOptions). */
  start: number;
  lead: number;
  enemyAt: ((t: number) => Point | null) | null;
}

/** Stands in for an opponent without a move 9 when placing the pair. */
const NOTHING = { startX: 0, startY: 0, sprites: [] };

/** The enemy-string preview of move `animId` as the current settings make it. */
function planFor(animId: number | null): EnemyPlan | null {
  const d = doc.value;
  if (!d || !isAF(d) || animId === null) return null;
  const m = d.moves.get(animId);
  if (!m) return null;
  const base = decodeScript(textFor(animId, 'base'));
  const plain: EnemyPlan['plain'] =
    uaFrame(base) >= 0 ? 'ua' : m.throwDuration > 0 ? 'throw' : null;
  const launch = launchFrames(base, m.category);
  let v: EnemyVariant = plain ? STANDING : variant.value;
  if (v.position === 'launch' && launch.length === 0) v = { ...v, position: 'standing' };
  const effective = effectiveEnemyString(textFor(animId, 'enemy'), v);
  const alone = { effective, variant: v, plain, launch };
  if (!paired.value)
    return { ...alone, timing: null, pair: null, start: 0, lead: 0, enemyAt: null };
  const chosen = hitFrame.value?.animId === animId ? hitFrame.value.frame : null;
  const timing = pairTiming(base, m.hitCoords, chosen);
  const states = new Simulator(base, {
    direction: toggles.flip ? -1 : 1,
    loop: false,
    hold: null,
  }).statesByTick();
  const origins = pairOrigins(m, damage.value ?? NOTHING, {
    distance: distance.value,
    facingLeft: toggles.flip,
    centred: !scene.showsBackground.value,
  });
  // The opponent waits while the attacker plays up to the start frame.
  return {
    ...alone,
    timing,
    pair: { move: m, base, states, origins },
    start: timing.enemyStart,
    lead: timing.attackerStart,
    enemyAt: attackerOffset(states, timing, origins),
  };
}

export function useOpponent() {
  return {
    loaded,
    opponentAf,
    damage,
    idle,
    variant,
    paired,
    distance,
    hitFrame,
    decode,
    load,
    loadBytes,
    /** Back to the document itself. */
    reset: () => (loaded.value = null),
    planFor,
  };
}
