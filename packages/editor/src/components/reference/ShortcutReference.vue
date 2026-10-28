<script setup lang="ts">
import { computed } from 'vue';
import { useShortcuts } from '../../composables/useShortcuts';

// Reference view: the shortcut registry as a table (spec 21 §1). A view's
// shortcuts appear once the view has been opened, because views register
// their shortcuts when they mount.

const shortcuts = useShortcuts();

/** Display names of the shortcut scopes, in table order. */
const SCOPE_NAMES: Record<string, string> = {
  global: 'Everywhere',
  animations: 'Animations',
  scene: 'Canvas and playback',
  script: 'Script',
  sprites: 'Sprites',
  pixels: 'Pixel editor',
  collisions: 'Collisions',
  palettes: 'Palettes',
};
/** Every shortcut registered this session; keys with the same action share a row. */
const allShortcuts = computed(() => {
  const rows = new Map<string, { scope: string; labels: string[]; description: string }>();
  for (const s of shortcuts.known()) {
    const k = `${s.scope}\u0000${s.description}`;
    const row = rows.get(k) ?? { scope: s.scope, labels: [], description: s.description };
    if (!row.labels.includes(s.label)) row.labels.push(s.label);
    rows.set(k, row);
  }
  const order = Object.keys(SCOPE_NAMES);
  const rank = (x: string): number => (order.includes(x) ? order.indexOf(x) : order.length);
  return [...rows.values()]
    .sort((a, b) => rank(a.scope) - rank(b.scope) || a.scope.localeCompare(b.scope))
    .map((r) => ({ ...r, where: SCOPE_NAMES[r.scope] ?? r.scope }));
});
</script>

<template>
  <section id="ref-shortcuts" class="mt-4">
    <h5>Shortcuts</h5>
    <table class="table table-sm small" data-testid="ref.shortcuts">
      <thead>
        <tr>
          <th>Where</th>
          <th>Keys</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(s, i) in allShortcuts" :key="i">
          <td>{{ s.where }}</td>
          <td>
            <template v-for="(l, k) in s.labels" :key="l"
              ><template v-if="k"> / </template><kbd>{{ l }}</kbd></template
            >
          </td>
          <td>{{ s.description }}</td>
        </tr>
      </tbody>
    </table>
    <p class="small text-secondary">
      Generated from the shortcut registry: a view's shortcuts are listed once that view has been
      opened in this session. In text fields only Ctrl+S, Ctrl+Shift+S, Ctrl+O, Ctrl+M, Ctrl+Alt+1–6
      and Esc work.
    </p>
  </section>
</template>
