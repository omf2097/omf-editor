<script setup lang="ts">
import { computed } from 'vue';
import { MOVE_CATEGORIES, analyzeTriggers, parseTrigger, triggerNotation } from '@omf/formats';
import { useDocument } from '../../composables/useDocument';
import { animationLabel, isAF } from '../../lib/doc';

// Reference view: move_string notation (spec 18 §1) and, for an open AF, the
// trigger of every move with its conflicts.

const docs = useDocument();

const triggerTable = computed(() => {
  const d = docs.doc.value;
  if (!d || !isAF(d)) return [];
  const issues = analyzeTriggers(d);
  return [...d.moves.entries()].map(([id, m]) => ({
    id,
    name: animationLabel('af', id),
    raw: m.moveString,
    notation:
      parseTrigger(m.moveString).kind === 'sequence'
        ? triggerNotation(parseTrigger(m.moveString))
        : '',
    category: MOVE_CATEGORIES.find((c) => c.value === m.category)?.name ?? String(m.category),
    issues: issues.filter((i) => i.moveId === id),
  }));
});
</script>

<template>
  <section id="ref-triggers" class="mt-4">
    <h5>Trigger notation</h5>
    <p class="small">
      <code>move_string</code> starts with the button (<code>P</code> punch, <code>K</code> kick),
      followed by numpad directions <strong>most recent first</strong>, facing right (6 is toward
      the opponent). <code>P632</code> is the quarter circle forward punch, “236P”. Repeated inputs
      collapse, at most 9 ticks may pass between inputs, and moves 15–69 are matched in id order, so
      a lower id with a prefix of the same directions wins.
    </p>
    <table v-if="triggerTable.length" class="table table-sm small" data-testid="ref.trigger-table">
      <thead>
        <tr>
          <th>Id</th>
          <th>Name</th>
          <th>Raw</th>
          <th>Notation</th>
          <th>Category</th>
          <th>Conflicts</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in triggerTable" :key="t.id">
          <td>{{ t.id }}</td>
          <td>{{ t.name }}</td>
          <td>
            <code>{{ t.raw }}</code>
          </td>
          <td>{{ t.notation }}</td>
          <td>{{ t.category }}</td>
          <td>
            <span
              v-for="(i, k) in t.issues"
              :key="k"
              class="d-block"
              :class="i.severity === 'warning' ? 'text-warning' : 'text-secondary'"
              >{{ i.message }}</span
            >
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
