// pyomftools-compatible JSON (serialize()/unserialize() of af.py and bk.py),
// spec 09. Field names are the file's snake_case names. Import validates every
// value and throws JsonPathError naming the offending path.

import { OmfFormatError } from './errors';
import { cp437Length } from './binary';
import { resolveSharedImagesInFile, type Animation, type HitCoord } from './animation';
import {
  AF_MAX_MOVES,
  AF_MOVE_STRING_BYTES,
  SOUND_TABLE_SIZE,
  sortedMap,
  type AFFile,
  type AFMove,
} from './af';
import { BK_MAX_ANIMATIONS, type BKAnimation, type BKFile } from './bk';
import { pyomftoolsTo8, REMAP_COUNT, vgaFrom8, type PaletteMapping, type VGA } from './palette';
import type { Sprite } from './sprite';

export interface SpriteJson {
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  index: number;
  missing: boolean;
  image: number[];
}

export interface HitCoordJson {
  x: number;
  y: number;
  null: number;
  frame_id: number;
}

export interface AnimationJson {
  start_x: number;
  start_y: number;
  hit_coords: HitCoordJson[];
  sprites: SpriteJson[];
  base_string: string;
  extra_strings: string[];
  /** Not in pyomftools: the animation header u32, written only when it is not 0. */
  header_zero?: number;
}

export interface AFMoveJson extends AnimationJson {
  ai_flags: number;
  pos_constraint: number;
  unknown_4: number;
  unknown_5: number;
  unknown_6: number;
  unknown_7: number;
  unknown_8: number;
  unknown_9: number;
  unknown_10: number;
  unknown_11: number;
  next_animation_id: number;
  category: number;
  block_damage: number;
  block_stun_and_scrap: number;
  successor_id: number;
  damage_amount: number;
  throw_duration: number;
  extra_string_selector: number;
  points: number;
  move_string: string;
  enemy_string: string;
}

export interface AFJson {
  fighter_id: number;
  exec_window: number;
  endurance: number;
  upwards_jump_frame_limit: number;
  health: number;
  forward_speed: number;
  reverse_speed: number;
  jump_speed: number;
  fall_speed: number;
  version_1: number;
  ai_projectile_y_threshold: number;
  moves: Record<string, AFMoveJson>;
  sound_table: number[];
}

export interface BKAnimationJson extends AnimationJson {
  null: number;
  chain_hit: number;
  chain_no_hit: number;
  repeat: number;
  probability: number;
  hazard_damage: number;
  footer_string: string;
}

export interface PaletteMappingJson {
  colors: { data: [number, number, number][] };
  remaps: number[][];
}

export interface BKJson {
  music_mask: number;
  unknown_a: number;
  background_width: number;
  background_height: number;
  background_image: number[];
  animations: Record<string, BKAnimationJson>;
  palettes: PaletteMappingJson[];
  sound_table: number[];
}

export class JsonPathError extends OmfFormatError {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'JsonPathError';
    this.path = path;
  }
}

/** Values that are valid in the file but rejected by pyomftools' validators. */
export interface JsonWarning {
  path: string;
  message: string;
}

// ---------------------------------------------------------------- export

function spriteToJson(s: Sprite, owners: Map<Sprite, Sprite>): SpriteJson {
  // pyomftools resolves sharers by reference, so their image holds the owner's bytes.
  const image = s.missing ? (owners.get(s)?.image ?? s.image) : s.image;
  return {
    pos_x: s.posX,
    pos_y: s.posY,
    width: s.width,
    height: s.height,
    index: s.index,
    missing: s.missing,
    image: Array.from(image),
  };
}

function animationToJson(a: Animation, owners: Map<Sprite, Sprite>): AnimationJson {
  return {
    start_x: a.startX,
    start_y: a.startY,
    hit_coords: a.hitCoords.map((c) => ({ x: c.x, null: c.null, y: c.y, frame_id: c.spriteId })),
    sprites: a.sprites.map((s) => spriteToJson(s, owners)),
    base_string: a.baseString,
    extra_strings: [...a.extraStrings],
    ...(a.headerZero ? { header_zero: a.headerZero } : {}),
  };
}

function moveToJson(m: AFMove, owners: Map<Sprite, Sprite>): AFMoveJson {
  return {
    ...animationToJson(m, owners),
    ai_flags: m.aiFlags,
    pos_constraint: m.posConstraint,
    unknown_4: m.unknown4,
    unknown_5: m.unknown5,
    unknown_6: m.unknown6,
    unknown_7: m.unknown7,
    unknown_8: m.unknown8,
    unknown_9: m.unknown9,
    unknown_10: m.unknown10,
    unknown_11: m.unknown11,
    next_animation_id: m.nextAnimationId,
    category: m.category,
    block_damage: m.blockDamage,
    block_stun_and_scrap: m.blockStunAndScrap,
    successor_id: m.successorId,
    damage_amount: m.damageAmount,
    throw_duration: m.throwDuration,
    extra_string_selector: m.extraStringSelector,
    points: m.points,
    move_string: m.moveString,
    enemy_string: m.enemyString,
  };
}

/** Record keyed by the decimal id, in ascending id order. */
function idRecord<A extends Animation, J>(
  anims: Map<number, A>,
  toJson: (a: A, owners: Map<Sprite, Sprite>) => J,
): Record<string, J> {
  const sorted = sortedMap(anims);
  // Sharing follows file order, so resolve over the sorted animations.
  const owners = resolveSharedImagesInFile(sorted.values());
  const out: Record<string, J> = {};
  for (const [id, a] of sorted) out[String(id)] = toJson(a, owners);
  return out;
}

export function afToJSON(af: AFFile): AFJson {
  const moves = idRecord(af.moves, moveToJson);
  return {
    fighter_id: af.fighterId,
    exec_window: af.execWindow,
    endurance: af.endurance,
    upwards_jump_frame_limit: af.upwardsJumpFrameLimit,
    health: af.health,
    forward_speed: af.forwardSpeed,
    reverse_speed: af.reverseSpeed,
    jump_speed: af.jumpSpeed,
    fall_speed: af.fallSpeed,
    version_1: af.version1,
    ai_projectile_y_threshold: af.aiProjectileYThreshold,
    moves,
    sound_table: [...af.soundTable],
  };
}

function paletteToJson(p: PaletteMapping): PaletteMappingJson {
  return {
    colors: {
      data: p.colors.colors.map((c) => [
        pyomftoolsTo8(c[0]),
        pyomftoolsTo8(c[1]),
        pyomftoolsTo8(c[2]),
      ]),
    },
    remaps: p.remaps.map((r) => Array.from(r)),
  };
}

function bkAnimationToJson(a: BKAnimation, owners: Map<Sprite, Sprite>): BKAnimationJson {
  return {
    ...animationToJson(a, owners),
    null: a.null,
    chain_hit: a.chainHit,
    chain_no_hit: a.chainNoHit,
    repeat: a.repeat,
    probability: a.probability,
    hazard_damage: a.hazardDamage,
    footer_string: a.footerString,
  };
}

export function bkToJSON(bk: BKFile): BKJson {
  const animations = idRecord(bk.animations, bkAnimationToJson);
  return {
    music_mask: bk.musicMask,
    unknown_a: bk.unknownA,
    background_width: bk.backgroundWidth,
    background_height: bk.backgroundHeight,
    background_image: Array.from(bk.background),
    animations,
    palettes: bk.palettes.map(paletteToJson),
    sound_table: [...bk.soundTable],
  };
}

/** Values pyomftools' af_compile/bk_compile would reject. */
export function jsonWarnings(doc: AFFile | BKFile): JsonWarning[] {
  const out: JsonWarning[] = [];
  const anims = 'moves' in doc ? doc.moves : doc.animations;
  const key = 'moves' in doc ? 'moves' : 'animations';
  for (const [id, a] of anims) {
    a.hitCoords.forEach((c, i) => {
      const path = `${key}.${id}.hit_coords[${i}]`;
      if (c.x === -512 || c.y === -512)
        out.push({ path, message: 'pyomftools accepts only -511..511' });
      if (c.null !== 0) out.push({ path, message: 'pyomftools requires null = 0' });
    });
  }
  return out;
}

// ---------------------------------------------------------------- import

type Obj = Record<string, unknown>;

// Validators: the `…At` forms check a value found at path `p`; the short forms
// (int, str, bool) read key `k` of an object found at `path`.

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new JsonPathError(path, 'expected an object');
  return v as Obj;
}

function arr(v: unknown, path: string, len?: number): unknown[] {
  if (!Array.isArray(v)) throw new JsonPathError(path, 'expected an array');
  if (len !== undefined && v.length !== len)
    throw new JsonPathError(path, `expected ${len} entries, got ${v.length}`);
  return v;
}

function intAt(v: unknown, p: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v))
    throw new JsonPathError(p, 'expected an integer');
  if (v < min || v > max) throw new JsonPathError(p, `${v} is outside ${min}..${max}`);
  return v;
}

function int(o: Obj, k: string, path: string, min: number, max: number): number {
  return intAt(o[k], path ? `${path}.${k}` : k, min, max);
}

function bytesAt(v: unknown, p: string, len?: number): Uint8Array {
  const a = arr(v, p, len);
  const out = new Uint8Array(a.length);
  a.forEach((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x > 255) {
      throw new JsonPathError(`${p}[${i}]`, 'expected a byte');
    }
    out[i] = x;
  });
  return out;
}

function strAt(v: unknown, p: string, maxBytes?: number): string {
  if (typeof v !== 'string') throw new JsonPathError(p, 'expected a string');
  const n = cp437Length(v);
  if (n < 0) throw new JsonPathError(p, 'contains characters outside cp437');
  // openomf reads strings as C strings: a NUL would silently cut it short.
  if (v.includes('\0')) throw new JsonPathError(p, 'contains a NUL character');
  if (maxBytes !== undefined && n > maxBytes)
    throw new JsonPathError(p, `longer than ${maxBytes} bytes`);
  return v;
}

function str(o: Obj, k: string, path: string, maxBytes?: number): string {
  return strAt(o[k], `${path}.${k}`, maxBytes);
}

function bool(o: Obj, k: string, path: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new JsonPathError(`${path}.${k}`, 'expected a boolean');
  return v;
}

function spriteFromJson(v: unknown, p: string): Sprite {
  const o = obj(v, p);
  const missing = bool(o, 'missing', p);
  const image = bytesAt(o.image, `${p}.image`);
  if (image.length > 0xffff) throw new JsonPathError(`${p}.image`, 'longer than 65535 bytes');
  return {
    posX: int(o, 'pos_x', p, -0x8000, 0x7fff),
    posY: int(o, 'pos_y', p, -0x8000, 0x7fff),
    width: int(o, 'width', p, 0, 0xffff),
    height: int(o, 'height', p, 0, 0xffff),
    index: int(o, 'index', p, 0, 0xff),
    missing,
    // A sharer's bytes are a copy of its owner's; the model keeps none.
    image: missing ? new Uint8Array(0) : image,
  };
}

function hitCoordFromJson(v: unknown, p: string): HitCoord {
  const o = obj(v, p);
  return {
    x: int(o, 'x', p, -512, 511),
    y: int(o, 'y', p, -512, 511),
    null: int(o, 'null', p, 0, 63),
    spriteId: int(o, 'frame_id', p, 0, 63),
  };
}

function animationFromJson(o: Obj, p: string): Animation {
  const sprites = arr(o.sprites, `${p}.sprites`).map((s, i) =>
    spriteFromJson(s, `${p}.sprites[${i}]`),
  );
  if (sprites.length > 255) throw new JsonPathError(`${p}.sprites`, 'more than 255 sprites');
  return {
    startX: int(o, 'start_x', p, -0x8000, 0x7fff),
    startY: int(o, 'start_y', p, -0x8000, 0x7fff),
    hitCoords: arr(o.hit_coords, `${p}.hit_coords`).map((c, i) =>
      hitCoordFromJson(c, `${p}.hit_coords[${i}]`),
    ),
    baseString: str(o, 'base_string', p),
    extraStrings: arr(o.extra_strings, `${p}.extra_strings`).map((s, i) =>
      strAt(s, `${p}.extra_strings[${i}]`),
    ),
    sprites,
    ...(o.header_zero === undefined ? {} : { headerZero: int(o, 'header_zero', p, 0, 0xffffffff) }),
  };
}

/** A JSON object keyed by decimal ids below `max`, as a map in ascending id order. */
function idMap<T>(v: unknown, p: string, max: number, f: (o: Obj, p: string) => T): Map<number, T> {
  const o = obj(v, p);
  const m = new Map<number, T>();
  for (const [k, val] of Object.entries(o)) {
    const id = Number(k);
    if (!/^\d+$/.test(k) || id >= max)
      throw new JsonPathError(`${p}.${k}`, `id must be 0..${max - 1}`);
    // "011" and "11" would both be id 11.
    if (String(id) !== k)
      throw new JsonPathError(`${p}.${k}`, `id must be written without leading zeros`);
    m.set(id, f(obj(val, `${p}.${k}`), `${p}.${k}`));
  }
  return sortedMap(m);
}

function soundTable(v: unknown, p: string): number[] {
  return arr(v, p, SOUND_TABLE_SIZE).map((x, i) => intAt(x, `${p}[${i}]`, 0, 255));
}

function moveFromJson(m: Obj, p: string): AFMove {
  return {
    ...animationFromJson(m, p),
    aiFlags: int(m, 'ai_flags', p, 0, 0xffff),
    posConstraint: int(m, 'pos_constraint', p, 0, 0xffff),
    unknown4: int(m, 'unknown_4', p, 0, 255),
    unknown5: int(m, 'unknown_5', p, 0, 255),
    unknown6: int(m, 'unknown_6', p, 0, 255),
    unknown7: int(m, 'unknown_7', p, 0, 255),
    unknown8: int(m, 'unknown_8', p, 0, 255),
    unknown9: int(m, 'unknown_9', p, 0, 255),
    unknown10: int(m, 'unknown_10', p, 0, 255),
    unknown11: int(m, 'unknown_11', p, 0, 255),
    nextAnimationId: int(m, 'next_animation_id', p, 0, 255),
    category: int(m, 'category', p, 0, 255),
    blockDamage: int(m, 'block_damage', p, 0, 255),
    blockStunAndScrap: int(m, 'block_stun_and_scrap', p, 0, 255),
    successorId: int(m, 'successor_id', p, 0, 255),
    damageAmount: int(m, 'damage_amount', p, 0, 255),
    throwDuration: int(m, 'throw_duration', p, 0, 255),
    extraStringSelector: int(m, 'extra_string_selector', p, 0, 255),
    points: int(m, 'points', p, 0, 255),
    moveString: str(m, 'move_string', p, AF_MOVE_STRING_BYTES),
    enemyString: str(m, 'enemy_string', p),
  };
}

export function afFromJSON(j: unknown): AFFile {
  const o = obj(j, '$');
  const moves = idMap(o.moves, 'moves', AF_MAX_MOVES, moveFromJson);
  return {
    fighterId: int(o, 'fighter_id', '', 0, 0xffff),
    execWindow: int(o, 'exec_window', '', 0, 0xffff),
    endurance: int(o, 'endurance', '', 0, 0xffffffff),
    upwardsJumpFrameLimit: int(o, 'upwards_jump_frame_limit', '', 0, 255),
    health: int(o, 'health', '', 0, 0xffff),
    forwardSpeed: int(o, 'forward_speed', '', -0x80000000, 0x7fffffff),
    reverseSpeed: int(o, 'reverse_speed', '', -0x80000000, 0x7fffffff),
    jumpSpeed: int(o, 'jump_speed', '', -0x80000000, 0x7fffffff),
    fallSpeed: int(o, 'fall_speed', '', -0x80000000, 0x7fffffff),
    version1: int(o, 'version_1', '', 0, 255),
    aiProjectileYThreshold: int(o, 'ai_projectile_y_threshold', '', 0, 255),
    moves,
    soundTable: soundTable(o.sound_table, 'sound_table'),
  };
}

function paletteFromJson(v: unknown, p: string): PaletteMapping {
  const o = obj(v, p);
  const data = arr(obj(o.colors, `${p}.colors`).data, `${p}.colors.data`, 256);
  const colors = data.map((c, i) => {
    const cp = `${p}.colors.data[${i}]`;
    return arr(c, cp, 3).map((x, k) => vgaFrom8(intAt(x, `${cp}[${k}]`, 0, 255))) as VGA;
  });
  const remaps = arr(o.remaps, `${p}.remaps`, REMAP_COUNT).map((r, i) =>
    bytesAt(r, `${p}.remaps[${i}]`, 256),
  );
  return { colors: { colors }, remaps };
}

function bkAnimationFromJson(a: Obj, p: string): BKAnimation {
  return {
    ...animationFromJson(a, p),
    null: int(a, 'null', p, 0, 255),
    chainHit: int(a, 'chain_hit', p, 0, 255),
    chainNoHit: int(a, 'chain_no_hit', p, 0, 255),
    repeat: int(a, 'repeat', p, 0, 255),
    probability: int(a, 'probability', p, 0, 0xffff),
    hazardDamage: int(a, 'hazard_damage', p, 0, 255),
    footerString: str(a, 'footer_string', p),
  };
}

export function bkFromJSON(j: unknown): BKFile {
  const o = obj(j, '$');
  const backgroundWidth = int(o, 'background_width', '', 0, 0xffff);
  const backgroundHeight = int(o, 'background_height', '', 0, 0xffff);
  const animations = idMap(o.animations, 'animations', BK_MAX_ANIMATIONS, bkAnimationFromJson);
  const palettes = arr(o.palettes, 'palettes').map((pm, i) =>
    paletteFromJson(pm, `palettes[${i}]`),
  );
  if (palettes.length > 255) throw new JsonPathError('palettes', 'more than 255 palettes');
  return {
    musicMask: int(o, 'music_mask', '', 0, 0xffffffff),
    unknownA: int(o, 'unknown_a', '', 0, 255),
    backgroundWidth,
    backgroundHeight,
    animations,
    background: bytesAt(o.background_image, 'background_image', backgroundWidth * backgroundHeight),
    palettes,
    soundTable: soundTable(o.sound_table, 'sound_table'),
  };
}
