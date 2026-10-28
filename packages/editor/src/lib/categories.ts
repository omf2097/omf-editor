import { MOVE_CATEGORIES } from '@omf/formats';

// Fixed hue per MoveCategory for the sidebar dots (spec 12 §12).
const HUES = [0, 30, 200, 60, 120, 160, 260, 290, 330, 210, 15, 45, 350, 10];
export const categoryColor = (c: number): string =>
  c === 0 ? 'var(--bs-secondary-color)' : `hsl(${HUES[c % HUES.length]} 65% 50%)`;

/** Tooltip and accessible name of a category dot: "Category: High attack (HIGH)". */
export function categoryLabel(c: number): string {
  const info = MOVE_CATEGORIES.find((m) => m.value === c);
  return info ? `Category: ${info.desc} (${info.name})` : `Category ${c}`;
}
