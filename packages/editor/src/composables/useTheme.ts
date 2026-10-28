import { ref, watch } from 'vue';

type Theme = 'light' | 'dark';

function initial(): Theme {
  try {
    const t = localStorage.getItem('omf-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    // storage blocked
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const theme = ref<Theme>(initial());
watch(
  theme,
  (t) => {
    document.documentElement.dataset.bsTheme = t;
    try {
      localStorage.setItem('omf-theme', t);
    } catch {
      // storage blocked
    }
  },
  { immediate: true },
);

export function useTheme() {
  return { theme, toggle: () => (theme.value = theme.value === 'dark' ? 'light' : 'dark') };
}
