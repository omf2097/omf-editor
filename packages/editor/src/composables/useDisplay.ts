// Display preferences kept in this browser (localStorage), like the theme:
// the text size, which scales the whole UI (everything is sized in rem), and
// whether labels show the file field name next to the readable name.

import { ref, watch } from 'vue';

export type TextSize = 'compact' | 'default' | 'large';

/** Root font size per setting; Bootstrap and the app size everything in rem. */
export const TEXT_SIZE_PX: Record<TextSize, number> = { compact: 15, default: 16, large: 18 };

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    // storage blocked
  }
  return fallback;
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked
  }
}

const textSize = ref<TextSize>(read('omf-text-size', ['compact', 'default', 'large'], 'default'));
const showFieldCodes = ref(read('omf-field-codes', ['on', 'off'], 'off') === 'on');

watch(
  textSize,
  (t) => {
    document.documentElement.style.fontSize = `${TEXT_SIZE_PX[t]}px`;
    persist('omf-text-size', t);
  },
  { immediate: true },
);
watch(showFieldCodes, (v) => persist('omf-field-codes', v ? 'on' : 'off'));

export function useDisplay() {
  return { textSize, showFieldCodes };
}
