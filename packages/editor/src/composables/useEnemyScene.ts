// What the scene canvas draws while the enemy string plays (spec 15 §6.1):
// the opponent as the object (its move 9 sprites, facing the attacker, as the
// other player), and in the paired preview the attacker beside it running the
// base string in step with it (useOpponent's plan has the timing and places).

import { computed, type ComputedRef } from 'vue';
import {
  spriteIndexOfFrame,
  tagValue,
  type DecodedSprite,
  type Frame,
  type Sprite,
} from '@omf/formats';
import { playerShift, type DrawSprite } from '../canvas/render';
import { attackerStateAt } from '../lib/enemyPair';
import { spriteRect, type Point } from '../lib/scene';
import type { AnyAnimation } from '../lib/doc';
import { useOpponent } from './useOpponent';
import { usePalette } from './usePalette';
import { usePlayback } from './usePlayback';
import { useSharedImages } from './useSharedImages';
import { useViewport } from './useViewport';

/** Props for SceneCanvas / ScenePreview while the enemy string plays. */
export interface EnemySceneProps {
  animation: AnyAnimation;
  facingLeft: boolean;
  playerOffset: number;
  decode: (s: Sprite) => DecodedSprite;
  origin: Point | null;
  idle: DrawSprite | null;
  partner: { draw: DrawSprite; shakeX: number; shakeY: number } | null;
}

/** Stands in for an opponent without a move 9: nothing to draw, nothing to hit. */
const NO_DAMAGE = {
  startX: 0,
  startY: 0,
  hitCoords: [],
  baseString: '',
  extraStrings: [],
  sprites: [],
} as unknown as AnyAnimation;

/** A frame's ox/oy: a draw correction for that frame's sprite only. */
const correction = (f: Frame | undefined): Point => ({
  x: (f && tagValue(f, 'ox')) ?? 0,
  y: (f && tagValue(f, 'oy')) ?? 0,
});

/** The enemy-string scene, or null when another string plays. */
export function useEnemyScene(): ComputedRef<EnemySceneProps | null> {
  const pb = usePlayback();
  const opponent = useOpponent();
  const palette = usePalette();
  const viewport = useViewport();
  const shared = useSharedImages();

  return computed<EnemySceneProps | null>(() => {
    const e = pb.enemy.value;
    if (!e) return null;
    const facingLeft = pb.facingLeft.value;
    // The opponent is the other player: its HAR bands are shifted the other way.
    const offset = 48 - palette.playerOffset.value;
    const base: EnemySceneProps = {
      animation: (opponent.damage.value as AnyAnimation | null) ?? NO_DAMAGE,
      facingLeft,
      playerOffset: offset,
      decode: opponent.decode,
      origin: null,
      idle: null,
      partner: null,
    };
    const pair = e.pair;
    if (!pair || !e.timing) return base;
    const o = pair.origins;

    // Before it is hit the opponent stands: the first sprite of its idle move.
    const idleSprite = opponent.idle.value?.sprites[0];
    let idle: DrawSprite | null = null;
    if (idleSprite) {
      const dec = opponent.decode(idleSprite);
      const r = spriteRect(idleSprite, o.opponent, facingLeft, dec.width, dec.height);
      idle = { decoded: dec, x: r.x, y: r.y, flipX: r.flipX, shift: playerShift(offset) };
    }

    // The attacker on the tick that goes with the opponent's (enemyPair).
    let partner: EnemySceneProps['partner'] = null;
    const st = attackerStateAt(pair.states, pb.state.value.tick, e.timing);
    const f = st ? pair.base.frames[st.frameIndex] : undefined;
    const s = f ? pair.move.sprites[spriteIndexOfFrame(f)] : undefined;
    if (st && s) {
      const dec = shared.decoded(s);
      const c = correction(f);
      const pos = { x: o.attacker.x + st.x + c.x, y: o.attacker.y + st.y + c.y };
      const r = spriteRect(s, pos, viewport.toggles.flip, dec.width, dec.height);
      partner = {
        draw: {
          decoded: dec,
          x: r.x,
          y: r.y,
          flipX: r.flipX !== st.flipX,
          flipY: st.flipY,
          shift: playerShift(palette.playerOffset.value),
        },
        shakeX: st.shakeX,
        shakeY: st.shakeY,
      };
    }
    return { ...base, origin: o.opponent, idle, partner };
  });
}
