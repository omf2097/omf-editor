// Enums, bit flags and name tables ported from pyomftools (afmove.py, bk.py, bkanim.py).

export interface FlagInfo {
  bit: number;
  name: string;
  desc: string;
}

export interface EnumInfo {
  value: number;
  name: string;
  desc: string;
}

export const AI_MOVE_TRIGGERS: readonly FlagInfo[] = [
  { bit: 0x0001, name: 'VS_AIR_STATE_1', desc: 'Opponent airborne, range bucket 1' },
  { bit: 0x0002, name: 'VS_HIGH_OR_IDLE', desc: 'Opponent attacking high, or idle' },
  { bit: 0x0004, name: 'VS_LOW_OR_CROUCH', desc: 'Opponent attacking low, or crouching' },
  { bit: 0x0008, name: 'VS_MEDIUM', desc: 'Opponent attacking mid' },
  {
    bit: 0x0010,
    name: 'VS_PROJECTILE_HIGH',
    desc: 'Projectile at or above the AI projectile Y threshold',
  },
  { bit: 0x0020, name: 'VS_AIR_STATE_2', desc: 'Opponent airborne, range bucket 2' },
  { bit: 0x0040, name: 'VS_AIR_STATE_3', desc: 'Opponent airborne, range bucket 3' },
  { bit: 0x0080, name: 'VS_AIR_STATE_0', desc: 'Opponent airborne, range bucket 0' },
  { bit: 0x0100, name: 'VS_GND_STATE_0', desc: 'Opponent grounded, range bucket 0' },
  { bit: 0x0200, name: 'VS_GND_STATE_1', desc: 'Opponent grounded, range bucket 1' },
  { bit: 0x0400, name: 'VS_GND_STATE_2', desc: 'Opponent grounded, range bucket 2' },
  { bit: 0x0800, name: 'VS_GND_STATE_3', desc: 'Opponent grounded, range bucket 3' },
  { bit: 0x1000, name: 'FLAG_1000', desc: 'Unknown (3 uses in shipped data, Jaguar leap/charge)' },
  {
    bit: 0x2000,
    name: 'VS_PROJECTILE_LOW',
    desc: 'Projectile below the AI projectile Y threshold (evade)',
  },
  { bit: 0x4000, name: 'FLAG_4000', desc: 'Reserved' },
  { bit: 0x8000, name: 'FLAG_8000', desc: 'Reserved' },
];

export const POSITION_CONSTRAINTS: readonly FlagInfo[] = [
  { bit: 0x0001, name: 'WALL', desc: 'HAR must be near a wall' },
  {
    bit: 0x0002,
    name: 'NO_DIST_CHECK',
    desc: 'Bypass distance and position checks (chained moves)',
  },
  {
    bit: 0x0004,
    name: 'JUMP_WALL_BOUNCE',
    desc: 'On the target jump animation: wall bounce on aerial hit',
  },
  { bit: 0x0008, name: 'IN_ARENA_0', desc: 'Only in arena 0 (unused in shipped data)' },
  { bit: 0x0010, name: 'IN_ARENA_1', desc: 'Only in arena 1 (unused)' },
  { bit: 0x0020, name: 'IN_ARENA_2', desc: 'Only in arena 2 (unused)' },
  { bit: 0x0040, name: 'IN_ARENA_3', desc: 'Only in arena 3 (Fire Pit)' },
  { bit: 0x0080, name: 'IN_ARENA_4', desc: 'Only in arena 4 (unused)' },
  { bit: 0x0100, name: 'FLAG_100', desc: 'Reserved' },
  { bit: 0x0200, name: 'FLAG_200', desc: 'Reserved' },
  { bit: 0x0400, name: 'FLAG_400', desc: 'Reserved' },
  { bit: 0x0800, name: 'FLAG_800', desc: 'Reserved' },
  { bit: 0x1000, name: 'FLAG_1000', desc: 'Signal on target animation; never set in shipped data' },
  { bit: 0x2000, name: 'FIRE_ICE_ALLOWED', desc: 'Requires Fire/Ice moves to be allowed' },
  {
    bit: 0x4000,
    name: 'OPP_FIRE_ICE_DESTRUCT',
    desc: "Requires the opponent's Fire/Ice destruction flag",
  },
  { bit: 0x8000, name: 'FLAG_8000', desc: 'Reserved' },
];

export const MOVE_CATEGORIES: readonly EnumInfo[] = [
  { value: 0, name: 'MISCELLANEOUS', desc: 'Miscellaneous' },
  { value: 1, name: 'UNKNOWN_1', desc: 'Unknown' },
  { value: 2, name: 'CLOSE', desc: 'Close range' },
  { value: 3, name: 'UNKNOWN_3', desc: 'Unknown' },
  { value: 4, name: 'LOW', desc: 'Low attack' },
  { value: 5, name: 'MEDIUM', desc: 'Medium attack' },
  { value: 6, name: 'HIGH', desc: 'High attack' },
  { value: 7, name: 'JUMPING', desc: 'Jumping attack' },
  { value: 8, name: 'PROJECTILE', desc: 'Projectile' },
  { value: 9, name: 'BASIC', desc: 'Basic movement' },
  { value: 10, name: 'BK_HAZARD', desc: 'Arena hazard' },
  { value: 11, name: 'VICTORY', desc: 'Victory / loss' },
  { value: 12, name: 'SCRAP', desc: 'Scrap' },
  { value: 13, name: 'DESTRUCTION', desc: 'Destruction' },
];

export const EXTRA_STRING_SELECTORS: readonly EnumInfo[] = [
  { value: 0, name: 'NONE', desc: 'No extra string' },
  { value: 1, name: 'ARM_SPEED', desc: 'Selected by arm speed' },
  { value: 2, name: 'LEG_SPEED', desc: 'Selected by leg speed' },
  { value: 3, name: 'SPECIAL_ARM', desc: 'By enhancement level; damage uses arm power' },
  { value: 4, name: 'SPECIAL_LEG', desc: 'By enhancement level; damage uses leg power' },
  { value: 5, name: 'SPECIAL', desc: 'Special' },
];

export const MUSIC_MASK: readonly FlagInfo[] = [
  { bit: 0x01, name: 'BIT_1', desc: 'Unused' },
  { bit: 0x02, name: 'END', desc: 'END.PSM' },
  { bit: 0x04, name: 'MENU', desc: 'MENU.PSM' },
  { bit: 0x08, name: 'ARENA0', desc: 'ARENA0.PSM' },
  { bit: 0x10, name: 'ARENA1', desc: 'ARENA1.PSM' },
  { bit: 0x20, name: 'ARENA2', desc: 'ARENA2.PSM' },
  { bit: 0x40, name: 'ARENA3', desc: 'ARENA3.PSM' },
  { bit: 0x80, name: 'ARENA4', desc: 'ARENA4.PSM' },
];

export const AF_MOVE_NAMES: Readonly<Record<number, string>> = {
  1: 'Jumping',
  2: 'Getting up',
  3: 'Stunned',
  4: 'Crouching',
  5: 'Standing block',
  6: 'Crouching block',
  7: 'Burning oil',
  8: 'Blocking scrape',
  9: 'Damage',
  10: 'Walking',
  11: 'Idle',
  12: 'Scrap',
  13: 'Bolt',
  14: 'Screw',
  48: 'Victory',
  49: 'Loss',
};

export const BK_ANIMATION_NAMES: Readonly<Record<number, string>> = {
  6: 'Round',
  7: 'Number',
  8: 'You lose',
  9: 'You win',
  10: 'Fight',
  11: 'Ready',
  20: 'Left wall hit',
  21: 'Right wall hit',
  24: 'Dust 1',
  25: 'Dust 2',
  26: 'Dust 3',
  27: 'Match marker',
};

export const HAR_NAMES: readonly string[] = [
  'Jaguar',
  'Shadow',
  'Thorn',
  'Pyros',
  'Electra',
  'Katana',
  'Shredder',
  'Flail',
  'Gargoyle',
  'Chronos',
  'Nova',
];
