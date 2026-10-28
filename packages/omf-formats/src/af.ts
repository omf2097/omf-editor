// AF files: one fighter (HAR), its moves and its sound table (spec 06, openomf
// formats/af.c). Also the sound-table and id-order helpers BK files share.

import { BinaryReader, BinaryWriter, decodeNullPadded } from './binary';
import { OmfFormatError, OmfRangeError } from './errors';
import {
  readAnimation,
  resolveSharedImagesInFile,
  writeAnimation,
  type Animation,
} from './animation';
import type { Sprite } from './sprite';

/** Move ids are 0..69; a byte ≥ 70 where an id is expected ends the move list. */
export const AF_MAX_MOVES = 70;
/** What openomf writes to end the move list. */
const AF_END_OF_MOVES = 250;
export const AF_MOVE_STRING_BYTES = 21;
/** Bytes; openomf rejects a stored length (bytes + NUL) ≥ SD_MOVE_FOOTER_STRING_MAX (512). */
export const AF_ENEMY_STRING_MAX = 510;
export const SOUND_TABLE_SIZE = 30;

export interface AFMove extends Animation {
  aiFlags: number;
  posConstraint: number;
  unknown4: number;
  unknown5: number;
  unknown6: number;
  unknown7: number;
  unknown8: number;
  unknown9: number;
  unknown10: number;
  unknown11: number;
  nextAnimationId: number;
  category: number;
  blockDamage: number;
  blockStunAndScrap: number;
  successorId: number;
  damageAmount: number;
  throwDuration: number;
  extraStringSelector: number;
  points: number;
  moveString: string;
  /**
   * The 21 raw bytes as read. Shipped files have leftover bytes after the
   * NUL; they are written back as long as `moveString` is unchanged.
   */
  moveStringRaw?: Uint8Array;
  enemyString: string;
}

export interface AFFile {
  fighterId: number;
  execWindow: number;
  /** Fixed point /256. */
  endurance: number;
  upwardsJumpFrameLimit: number;
  health: number;
  /** Fixed point /256, as are the other speeds (see toReal). */
  forwardSpeed: number;
  reverseSpeed: number;
  jumpSpeed: number;
  fallSpeed: number;
  version1: number;
  aiProjectileYThreshold: number;
  /** Key 0..69. Write order is ascending key. */
  moves: Map<number, AFMove>;
  /** 30 slots of 1-based SOUNDS.DAT numbers, 0 = silent (see soundForSlot). */
  soundTable: number[];
}

export function readAF(data: Uint8Array | ArrayBuffer): AFFile {
  const r = new BinaryReader(data);
  const fighterId = r.u16();
  const execWindow = r.u16();
  const endurance = r.u32();
  const upwardsJumpFrameLimit = r.u8();
  const health = r.u16();
  const forwardSpeed = r.i32();
  const reverseSpeed = r.i32();
  const jumpSpeed = r.i32();
  const fallSpeed = r.i32();
  const version1 = r.u8();
  const aiProjectileYThreshold = r.u8();

  const moves = new Map<number, AFMove>();
  for (;;) {
    const at = r.pos;
    const id = r.u8();
    if (id >= AF_MAX_MOVES) break;
    if (moves.has(id)) throw new OmfFormatError(`duplicate move id ${id}`, at);
    const anim = readAnimation(r);
    moves.set(id, {
      ...anim,
      aiFlags: r.u16(),
      posConstraint: r.u16(),
      unknown4: r.u8(),
      unknown5: r.u8(),
      unknown6: r.u8(),
      unknown7: r.u8(),
      unknown8: r.u8(),
      unknown9: r.u8(),
      unknown10: r.u8(),
      unknown11: r.u8(),
      nextAnimationId: r.u8(),
      category: r.u8(),
      blockDamage: r.u8(),
      blockStunAndScrap: r.u8(),
      successorId: r.u8(),
      damageAmount: r.u8(),
      throwDuration: r.u8(),
      extraStringSelector: r.u8(),
      points: r.u8(),
      ...readMoveString(r),
      enemyString: r.varStr(true),
    });
  }
  const soundTable = readSoundTable(r);
  if (r.remaining() !== 0)
    throw new OmfFormatError(`${r.remaining()} trailing bytes after AF data`, r.pos);

  return {
    fighterId,
    execWindow,
    endurance,
    upwardsJumpFrameLimit,
    health,
    forwardSpeed,
    reverseSpeed,
    jumpSpeed,
    fallSpeed,
    version1,
    aiProjectileYThreshold,
    moves: sortedMap(moves),
    soundTable,
  };
}

function readMoveString(r: BinaryReader): { moveString: string; moveStringRaw: Uint8Array } {
  const raw = r.bytes(AF_MOVE_STRING_BYTES);
  return { moveString: decodeNullPadded(raw), moveStringRaw: raw };
}

/** The bytes as read while the string is unedited, so leftovers after the NUL survive. */
function writeMoveString(w: BinaryWriter, m: AFMove, field: string): void {
  if (m.moveStringRaw && decodeNullPadded(m.moveStringRaw) === m.moveString) {
    w.bytes(m.moveStringRaw);
  } else {
    w.nullPaddedStr(m.moveString, AF_MOVE_STRING_BYTES, field);
  }
}

/** A copy iterating in ascending key order, the order files are written in. */
export function sortedMap<T>(m: Map<number, T>): Map<number, T> {
  return new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
}

/** Moves in write order (ascending id). */
export function afMovesInOrder(af: AFFile): [number, AFMove][] {
  return [...af.moves.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * For writeAnimation: the image length a missing sprite stores, which is its
 * file-format owner's (spec 04 §Shared images). Pass animations in file order.
 */
export function sharedLengthLookup(animations: Animation[]): (s: Sprite) => number {
  const owners = resolveSharedImagesInFile(animations);
  return (s) => owners.get(s)?.image.length ?? 0;
}

export function writeAF(af: AFFile): Uint8Array {
  const w = new BinaryWriter(256 * 1024);
  w.u16(af.fighterId, 'fighter_id');
  w.u16(af.execWindow, 'exec_window');
  w.u32(af.endurance, 'endurance');
  w.u8(af.upwardsJumpFrameLimit, 'upwards_jump_frame_limit');
  w.u16(af.health, 'health');
  w.i32(af.forwardSpeed, 'forward_speed');
  w.i32(af.reverseSpeed, 'reverse_speed');
  w.i32(af.jumpSpeed, 'jump_speed');
  w.i32(af.fallSpeed, 'fall_speed');
  w.u8(af.version1, 'version_1');
  w.u8(af.aiProjectileYThreshold, 'ai_projectile_y_threshold');

  const moves = afMovesInOrder(af);
  const sharedLen = sharedLengthLookup(moves.map(([, m]) => m));
  for (const [id, m] of moves) {
    if (id < 0 || id >= AF_MAX_MOVES) throw new OmfRangeError(id, 0, AF_MAX_MOVES - 1, 'moves.id');
    const f = `moves.${id}`;
    w.u8(id);
    writeAnimation(w, m, sharedLen);
    w.u16(m.aiFlags, `${f}.ai_flags`);
    w.u16(m.posConstraint, `${f}.pos_constraint`);
    w.u8(m.unknown4, `${f}.unknown_4`);
    w.u8(m.unknown5, `${f}.unknown_5`);
    w.u8(m.unknown6, `${f}.unknown_6`);
    w.u8(m.unknown7, `${f}.unknown_7`);
    w.u8(m.unknown8, `${f}.unknown_8`);
    w.u8(m.unknown9, `${f}.unknown_9`);
    w.u8(m.unknown10, `${f}.unknown_10`);
    w.u8(m.unknown11, `${f}.unknown_11`);
    w.u8(m.nextAnimationId, `${f}.next_animation_id`);
    w.u8(m.category, `${f}.category`);
    w.u8(m.blockDamage, `${f}.block_damage`);
    w.u8(m.blockStunAndScrap, `${f}.block_stun_and_scrap`);
    w.u8(m.successorId, `${f}.successor_id`);
    w.u8(m.damageAmount, `${f}.damage_amount`);
    w.u8(m.throwDuration, `${f}.throw_duration`);
    w.u8(m.extraStringSelector, `${f}.extra_string_selector`);
    w.u8(m.points, `${f}.points`);
    writeMoveString(w, m, `${f}.move_string`);
    w.varStr(m.enemyString, true, `${f}.enemy_string`);
  }
  w.u8(AF_END_OF_MOVES);
  writeSoundTable(w, af.soundTable);
  return w.toUint8Array();
}

export function readSoundTable(r: BinaryReader): number[] {
  const t: number[] = [];
  for (let i = 0; i < SOUND_TABLE_SIZE; i++) t.push(r.u8());
  return t;
}

export function writeSoundTable(w: BinaryWriter, t: number[]): void {
  if (t.length !== SOUND_TABLE_SIZE) {
    throw new OmfRangeError(t.length, SOUND_TABLE_SIZE, SOUND_TABLE_SIZE, 'sound_table.length');
  }
  t.forEach((v, i) => w.u8(v, `sound_table[${i}]`));
}

/** Fixed point /256 (endurance, speeds) to a number and back. */
export const toReal = (v: number): number => v / 256;
export const fromReal = (x: number): number => Math.trunc(x * 256);

/** Spellings shipped files use for "this move has no trigger". */
const NO_TRIGGER = new Set(['!', '"!"', '0']);
export const hasMoveString = (m: AFMove): boolean =>
  m.moveString !== '' && !NO_TRIGGER.has(m.moveString);
