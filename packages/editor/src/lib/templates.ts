// New-file templates (spec 19 §1).

import {
  TRANSPARENT,
  encodeSprite,
  identityRemap,
  type AFFile,
  type AFMove,
  type BKAnimation,
  type BKFile,
  type Sprite,
  type VGA,
} from '@omf/formats';

/** A 1×1 fully transparent sprite. */
export function emptySpriteImage(): Uint8Array {
  return encodeSprite({ width: 1, height: 1, pixels: Uint16Array.from([TRANSPARENT]) });
}

/**
 * A blank 1×1 sprite owning image `index`. Templates never use index 0, which
 * openomf does not register as a shared-image owner.
 */
export function templateSprite(index = 1): Sprite {
  return {
    posX: 0,
    posY: 0,
    width: 1,
    height: 1,
    index,
    missing: false,
    image: emptySpriteImage(),
  };
}

export function newMove(over: Partial<AFMove> = {}, imageIndex = 1): AFMove {
  return {
    startX: 0,
    startY: 0,
    hitCoords: [],
    baseString: 'A10',
    extraStrings: [],
    sprites: [templateSprite(imageIndex)],
    aiFlags: 0,
    posConstraint: 0,
    unknown4: 0,
    unknown5: 0,
    unknown6: 0,
    unknown7: 0,
    unknown8: 0,
    unknown9: 0,
    unknown10: 0,
    unknown11: 0,
    nextAnimationId: 0,
    category: 0,
    blockDamage: 0,
    blockStunAndScrap: 0,
    successorId: 0,
    damageAmount: 0,
    throwDuration: 0,
    extraStringSelector: 0,
    points: 0,
    moveString: '!',
    enemyString: '',
    ...over,
  };
}

/** Jaguar's sound table (FIGHTR0.AF). */
export const JAGUAR_SOUND_TABLE = [
  0, 1, 2, 3, 6, 5, 4, 0, 0, 19, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 63, 4, 40, 41, 0, 70, 71, 72, 69, 68,
];

export interface FighterHeader {
  fighterId: number;
  execWindow: number;
  endurance: number;
  upwardsJumpFrameLimit: number;
  health: number;
  forwardSpeed: number;
  reverseSpeed: number;
  jumpSpeed: number;
  fallSpeed: number;
  version1: number;
  aiProjectileYThreshold: number;
}

/** Header values of Jaguar (FIGHTR0.AF), raw fixed-point integers. */
export const JAGUAR_HEADER: FighterHeader = {
  fighterId: 0,
  execWindow: 10,
  endurance: 14080,
  upwardsJumpFrameLimit: 2,
  health: 200,
  forwardSpeed: 1280,
  reverseSpeed: 1024,
  jumpSpeed: -3712,
  fallSpeed: 294,
  version1: 50,
  aiProjectileYThreshold: 20,
};

export const BASE_MOVE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 48, 49];

function baseMoveFields(id: number): Partial<AFMove> {
  if (id === 9) return { category: 0, moveString: '0' };
  if (id >= 12 && id <= 14) return { category: 0, moveString: '"!"' };
  if (id === 48 || id === 49) return { category: 11, moveString: 'n' };
  return { category: 9, moveString: '0' };
}

export function newFighter(header: FighterHeader = JAGUAR_HEADER): AFFile {
  return {
    ...header,
    moves: new Map(BASE_MOVE_IDS.map((id, k) => [id, newMove(baseMoveFields(id), k + 1)])),
    soundTable: [...JAGUAR_SOUND_TABLE],
  };
}

export function newSceneAnimation(imageIndex = 1): BKAnimation {
  return {
    startX: 160,
    startY: 100,
    hitCoords: [],
    baseString: 'A10',
    extraStrings: [],
    sprites: [templateSprite(imageIndex)],
    null: 0,
    chainHit: 0,
    chainNoHit: 0,
    repeat: 0,
    probability: 0,
    hazardDamage: 0,
    footerString: '',
  };
}

export function newScene(): BKFile {
  const colors: VGA[] = Array.from({ length: 256 }, () => [0, 0, 0]);
  for (let i = 0; i < 64; i++) colors[0x60 + i] = [i, i, i];
  return {
    musicMask: 0,
    unknownA: 0,
    backgroundWidth: 320,
    backgroundHeight: 200,
    animations: new Map(),
    background: new Uint8Array(320 * 200),
    palettes: [{ colors: { colors }, remaps: Array.from({ length: 19 }, identityRemap) }],
    soundTable: new Array<number>(30).fill(0),
  };
}
