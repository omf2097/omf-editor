// Small helpers shared across the editor.

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/** `value` of the input, select or textarea an event came from (for template handlers). */
export const inputValue = (e: Event): string =>
  (e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;

/** `checked` of the checkbox or radio an event came from. */
export const inputChecked = (e: Event): boolean => (e.target as HTMLInputElement).checked;
