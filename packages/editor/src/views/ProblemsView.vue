<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import { useProblems, type Problem } from '../composables/useProblems';
import { useDocument } from '../composables/useDocument';
import { usePlayback } from '../composables/usePlayback';
import { animationLabel } from '../lib/doc';
import { spriteLetter } from '@omf/formats';

const router = useRouter();
const docs = useDocument();
const pb = usePlayback();
const problems = useProblems();
const show = ref({ error: true, warning: true, info: false });

const rows = computed(() => problems.sorted.value.filter((p) => show.value[p.severity]));
const counts = computed(() => ({
  error: problems.problems.value.filter((p) => p.severity === 'error').length,
  warning: problems.problems.value.filter((p) => p.severity === 'warning').length,
  info: problems.problems.value.filter((p) => p.severity === 'info').length,
}));

function where(p: Problem): string {
  if (p.animation === undefined) return 'file';
  const parts = [`${p.animation} ${animationLabel(docs.kind.value ?? 'af', p.animation)}`];
  if (p.field && p.field !== 'move') parts.push(p.field.replace('extra:', 'extra '));
  if (p.frame !== undefined) parts.push(`frame ${p.frame + 1}`);
  if (p.sprite !== undefined) parts.push(`sprite ${spriteLetter(p.sprite)}`);
  if (p.hitCoord !== undefined) parts.push(`point ${p.hitCoord}`);
  return parts.join(' · ');
}

async function go(p: Problem): Promise<void> {
  if (p.animation === undefined) return void router.push({ name: 'file' });
  const id = p.animation;
  if (p.hitCoord !== undefined) {
    await router.push({
      name: 'anim-collisions',
      params: { id },
      query: { point: String(p.hitCoord) },
    });
  } else if (p.sprite !== undefined) {
    await router.push({
      name: 'anim-sprites',
      params: { id },
      query: { sprite: String(p.sprite) },
    });
  } else if (p.field === 'base' || p.field === 'enemy' || p.field?.startsWith('extra:')) {
    await router.push({ name: 'anim-script', params: { id } });
    pb.source.value =
      p.field === 'base' || p.field === 'enemy' ? p.field : Number(p.field.split(':')[1]);
    if (p.frame !== undefined) pb.seekFrame(p.frame);
  } else {
    await router.push({ name: 'anim-overview', params: { id } });
  }
}
</script>

<template>
  <div class="view-pad mx-auto" style="max-width: 1100px" data-testid="view.problems">
    <div class="d-flex align-items-center gap-3 mb-2">
      <h5 class="mb-0">Problems</h5>
      <label
        v-for="s in ['error', 'warning', 'info'] as const"
        :key="s"
        class="form-check mb-0 small"
      >
        <input
          v-model="show[s]"
          type="checkbox"
          class="form-check-input"
          :data-testid="`problems.filter.${s}`"
        />
        {{ s }} ({{ counts[s] }})
      </label>
    </div>
    <table class="table table-sm small" data-testid="problems.table">
      <thead>
        <tr>
          <th style="width: 2rem" />
          <th>Where</th>
          <th>Message</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, i) in rows" :key="i" :data-testid="`problems.row.${i}`">
          <td>
            <span v-if="p.severity === 'error'" class="text-danger" title="error"
              ><Icon name="error"
            /></span>
            <span v-else-if="p.severity === 'warning'" class="text-warning" title="warning"
              ><Icon name="warning"
            /></span>
            <span v-else class="text-secondary" title="info"><Icon name="info" /></span>
          </td>
          <td class="text-nowrap">{{ where(p) }}</td>
          <td>{{ p.message }}</td>
          <td>
            <button
              class="btn btn-sm btn-link p-0"
              :data-testid="`problems.row.${i}.go`"
              @click="go(p)"
            >
              Go <Icon name="goto" />
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="4" class="text-secondary">Nothing to show.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
