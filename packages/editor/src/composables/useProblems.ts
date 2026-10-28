// Everything the Problems view lists: document diagnostics from @omf/formats
// and, for fighters, the move-trigger analysis (spec 18 §3).

import { computed } from 'vue';
import { analyzeTriggers, documentDiagnostics, type Diagnostic } from '@omf/formats';
import { useDocument } from './useDocument';
import { isAF } from '../lib/doc';

export interface Problem extends Diagnostic {
  source: 'document' | 'trigger';
}

const { doc } = useDocument();

const problems = computed<Problem[]>(() => {
  const d = doc.value;
  if (!d) return [];
  const out: Problem[] = documentDiagnostics(d).map((p) => ({ ...p, source: 'document' }));
  if (isAF(d)) {
    for (const t of analyzeTriggers(d)) {
      out.push({
        source: 'trigger',
        severity: t.severity,
        animation: t.moveId,
        field: 'move',
        message: `trigger: ${t.message}`,
      });
    }
  }
  return out;
});

const rank = { error: 0, warning: 1, info: 2 } as const;

export function useProblems() {
  return {
    problems,
    /** Errors and warnings; info is listed in the Problems view only. */
    count: computed(() => problems.value.filter((p) => p.severity !== 'info').length),
    sorted: computed(() => [...problems.value].sort((a, b) => rank[a.severity] - rank[b.severity])),
    forAnimation: (id: number) => problems.value.filter((p) => p.animation === id),
    worstFor(id: number): Problem['severity'] | null {
      let worst: Problem['severity'] | null = null;
      for (const p of problems.value) {
        if (p.animation !== id) continue;
        if (worst === null || rank[p.severity] < rank[worst]) worst = p.severity;
      }
      return worst;
    },
  };
}
