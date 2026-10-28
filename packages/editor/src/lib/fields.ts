// Static tables of the Reference view (spec 21): file fields (name, type,
// range, label) and the format limits.

export interface FieldInfo {
  code: string;
  label: string;
  type: string;
  range: string;
  note?: string;
}

const u8 = { type: 'u8', range: '0–255' };
const u16 = { type: 'u16', range: '0–65535' };
const i16 = { type: 'i16', range: '−32768–32767' };
const fixed = { type: 'i32 /256', range: 'fixed point' };

export const FIELD_GROUPS: { title: string; fields: FieldInfo[] }[] = [
  {
    title: 'AF header',
    fields: [
      { code: 'fighter_id', label: 'HAR', ...u16 },
      { code: 'exec_window', label: 'Exec window', ...u16 },
      { code: 'endurance', label: 'Endurance', type: 'u32 /256', range: 'fixed point' },
      { code: 'upwards_jump_frame_limit', label: 'Upwards jump frame limit', ...u8 },
      { code: 'health', label: 'Health', ...u16 },
      { code: 'forward_speed', label: 'Forward speed', ...fixed },
      { code: 'reverse_speed', label: 'Reverse speed', ...fixed },
      { code: 'jump_speed', label: 'Jump speed', ...fixed },
      { code: 'fall_speed', label: 'Fall speed', ...fixed },
      { code: 'version_1', label: 'Version', ...u8 },
      { code: 'ai_projectile_y_threshold', label: 'AI projectile Y threshold', ...u8 },
      { code: 'sound_table', label: 'Sound table', type: '30 × u8', range: 'sound bank ids' },
    ],
  },
  {
    title: 'AF move',
    fields: [
      { code: 'ai_flags', label: 'AI triggers', type: 'u16 flags', range: '' },
      { code: 'pos_constraint', label: 'Constraints', type: 'u16 flags', range: '' },
      { code: 'unknown_4 … unknown_11', label: 'Unknown', ...u8, note: 'preserved' },
      { code: 'next_animation_id', label: 'Next animation', ...u8 },
      { code: 'category', label: 'Category', ...u8 },
      { code: 'block_damage', label: 'Block damage', ...u8 },
      { code: 'block_stun_and_scrap', label: 'Block stun / scrap', ...u8 },
      { code: 'successor_id', label: 'Successor', ...u8 },
      { code: 'damage_amount', label: 'Damage', ...u8 },
      { code: 'throw_duration', label: 'Throw duration', ...u8 },
      { code: 'extra_string_selector', label: 'Extra string selector', ...u8 },
      { code: 'points', label: 'Points', ...u8 },
      { code: 'move_string', label: 'Trigger', type: '21 bytes', range: 'NUL padded' },
      { code: 'enemy_string', label: 'Enemy string', type: 'string', range: '≤ 510 bytes' },
    ],
  },
  {
    title: 'BK header',
    fields: [
      { code: 'music_mask', label: 'Music', type: 'u32 flags', range: '' },
      { code: 'unknown_a', label: 'Unknown', ...u8 },
      {
        code: 'background_width / height',
        label: 'Background size',
        ...u16,
        note: '320×200 in shipped data',
      },
      {
        code: 'palettes',
        label: 'Palettes',
        type: 'u8 count',
        range: '256 colours + 19 remaps each',
      },
    ],
  },
  {
    title: 'BK animation',
    fields: [
      { code: 'null', label: 'Unknown', ...u8 },
      { code: 'chain_hit', label: 'Chain on hit', ...u8 },
      { code: 'chain_no_hit', label: 'Chain on no hit', ...u8 },
      { code: 'repeat', label: 'Repeat', ...u8 },
      { code: 'probability', label: 'Probability', ...u16 },
      { code: 'hazard_damage', label: 'Hazard damage', ...u8 },
      { code: 'footer_string', label: 'Footer string', type: 'string', range: '≤ 510 bytes' },
    ],
  },
  {
    title: 'Animation',
    fields: [
      { code: 'start_x / start_y', label: 'Start', ...i16 },
      { code: 'base_string', label: 'Script', type: 'string', range: '≤ 1023 bytes' },
      {
        code: 'extra_strings',
        label: 'Extra strings',
        type: 'strings',
        range: '≤ 10, each ≤ 511 bytes',
      },
      { code: 'sprites', label: 'Sprites', type: 'u8 count', range: '≤ 255' },
      {
        code: 'hit_coords',
        label: 'Collision points',
        type: 'u16 count',
        range: 'openomf refuses > 256',
      },
    ],
  },
  {
    title: 'Sprite',
    fields: [
      { code: 'pos_x / pos_y', label: 'Offset', ...i16 },
      { code: 'width / height', label: 'Size', ...u16 },
      { code: 'index', label: 'Image index', ...u8 },
      { code: 'missing', label: 'Shared image', type: 'bool', range: '' },
      { code: 'image', label: 'RLE image', type: 'bytes', range: '≤ 65535' },
    ],
  },
  {
    title: 'Collision point',
    fields: [
      { code: 'x / y', label: 'Position', type: 'signed 10-bit', range: '−512–511' },
      {
        code: 'frame_id',
        label: 'Sprite',
        type: '6-bit',
        range: '0–63',
        note: 'a sprite index, not a frame',
      },
      { code: 'null', label: 'Unknown', type: '6-bit', range: '0 in shipped data' },
    ],
  },
];

/** Limits of specs 04–07 and 17, as openomf enforces them: what, limit, where it comes from. */
export const LIMIT_ROWS: [string, string, string][] = [
  ['Animation string (base)', '≤ 1023 bytes', 'SD_ANIMATION_STRING_MAX 1024 incl. NUL'],
  [
    'Extra strings',
    '≤ 10 per animation, each ≤ 511 bytes',
    'SD_EXTRASTR_COUNT_MAX, SD_EXTRA_STRING_MAX',
  ],
  ['AF enemy string, BK footer string', '≤ 510 bytes', 'openomf string buffers'],
  ['Move trigger (move_string)', '21 bytes, NUL padded', 'AF move record'],
  ['Sprites per animation', '≤ 255; frames show A–Z (the first 26)', 'u8 count; is_frame_id'],
  ['Collision points per animation', '≤ 256', 'SD_COLCOORD_COUNT_MAX'],
  ['Collision point x / y', '−512 – 511', 'signed 10-bit'],
  ['Sprite size and position in the image', '< 16384', '14-bit RLE fields'],
  ['BK palettes', '≤ 8', 'MAX_BK_PALETTES'],
  ['Remap tables per palette', '19', 'BK palette record'],
  ['Sound table', '30 slots, values 0–255 (SOUNDS.DAT entry + 1; 0 silent)', 'u8 per slot'],
  ['Animations', 'AF ids 0–69, BK ids 0–49', 'MAX_AF_MOVES, MAX_BK_ANIMS'],
];
