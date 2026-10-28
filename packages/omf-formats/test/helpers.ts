import {
  encodeSprite,
  identityRemap,
  grayscalePalette,
  type AFFile,
  type AFMove,
  type BKAnimation,
  type BKFile,
  type Sprite,
} from '../src';

export function sprite(over: Partial<Sprite> = {}): Sprite {
  const image = encodeSprite({ width: 2, height: 2, pixels: Uint16Array.from([1, 2, 3, 256]) });
  return { posX: -1, posY: -2, width: 2, height: 2, index: 0, missing: false, image, ...over };
}

export function move(over: Partial<AFMove> = {}): AFMove {
  return {
    startX: 0,
    startY: 0,
    hitCoords: [],
    baseString: 'A10',
    extraStrings: [],
    sprites: [sprite()],
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

export function af(moves: [number, AFMove][] = [[11, move()]]): AFFile {
  return {
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
    moves: new Map(moves),
    soundTable: Array.from({ length: 30 }, (_, i) => i),
  };
}

export function bkAnim(over: Partial<BKAnimation> = {}): BKAnimation {
  return {
    startX: 160,
    startY: 100,
    hitCoords: [],
    baseString: 'A10',
    extraStrings: [],
    sprites: [sprite()],
    null: 0,
    chainHit: 0,
    chainNoHit: 0,
    repeat: 0,
    probability: 0,
    hazardDamage: 0,
    footerString: '',
    ...over,
  };
}

export function bk(anims: [number, BKAnimation][] = [], w = 4, h = 2): BKFile {
  return {
    musicMask: 0,
    unknownA: 0,
    backgroundWidth: w,
    backgroundHeight: h,
    animations: new Map(anims),
    background: Uint8Array.from({ length: w * h }, (_, i) => i),
    palettes: [{ colors: grayscalePalette(), remaps: Array.from({ length: 19 }, identityRemap) }],
    soundTable: new Array<number>(30).fill(0),
  };
}
