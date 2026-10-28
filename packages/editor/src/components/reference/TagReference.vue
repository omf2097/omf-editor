<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { TAGS } from '@omf/formats';
import { CATEGORIES, TAG_META, tagInfo } from '../../lib/tagMeta';
import { forEachScriptTag, scriptQuery, type TagSite } from '../../lib/scriptTags';
import { useDocument } from '../../composables/useDocument';

// Reference view: every animation tag, filterable, with its uses in the open
// document; the count links to the first use (spec 21 §1).

const router = useRouter();
const docs = useDocument();
const q = ref('');
const cat = ref('');

/** Uses of each tag in the open document: [animId, frame index]. */
const usage = computed(() => {
  const m = new Map<string, TagSite[]>();
  const d = docs.doc.value;
  if (!d) return m;
  forEachScriptTag(d, (site) => {
    const list = m.get(site.tag.key) ?? [];
    list.push(site);
    m.set(site.tag.key, list);
  });
  return m;
});

const tags = computed(() => {
  const f = q.value.trim().toLowerCase();
  return Object.keys(TAGS)
    .sort()
    .map((k) => ({ key: k, meta: TAG_META[k]!, info: tagInfo(k) }))
    .filter(
      (t) =>
        (!cat.value || t.meta.category === cat.value) &&
        (!f ||
          t.key.includes(f) ||
          t.meta.label.toLowerCase().includes(f) ||
          t.info.desc.toLowerCase().includes(f)),
    );
});

function goTo(site: TagSite): void {
  void router.push({
    name: 'anim-script',
    params: { id: site.animId },
    query: scriptQuery(site.string, site.frame),
  });
}
</script>

<template>
  <section id="ref-tags">
    <h5>Animation tags</h5>
    <div class="d-flex gap-2 mb-2">
      <input
        v-model="q"
        class="form-control form-control-sm"
        style="max-width: 20rem"
        placeholder="Search tags"
        aria-label="Search tags"
        data-testid="ref.tags.search"
      />
      <select
        v-model="cat"
        class="form-select form-select-sm w-auto"
        aria-label="Tag category"
        data-testid="ref.tags.category"
      >
        <option value="">all categories</option>
        <option v-for="c in CATEGORIES" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <span class="small text-secondary align-self-center">{{ tags.length }} tags</span>
    </div>
    <table class="table table-sm small" data-testid="ref.tags">
      <thead>
        <tr>
          <th>Tag</th>
          <th>Label</th>
          <th>Category</th>
          <th>Argument</th>
          <th>Description</th>
          <th>Uses</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in tags" :key="t.key" :data-testid="`ref.tag.${t.key}`">
          <td>
            <code>{{ t.key }}</code>
          </td>
          <td>
            {{ t.meta.label }}
            <span v-if="t.info.previewed" class="badge text-bg-success">previewed</span>
          </td>
          <td>{{ t.meta.category }}</td>
          <td>
            {{
              t.meta.arg
                ? `${t.meta.arg.kind}${t.meta.arg.min !== undefined ? ` ${t.meta.arg.min}…${t.meta.arg.max ?? ''}` : ''}`
                : '—'
            }}
          </td>
          <td>{{ t.info.desc }}</td>
          <td>
            <template v-if="usage.get(t.key)?.length">
              <a
                href="#"
                :data-testid="`ref.tag.${t.key}.uses`"
                @click.prevent="goTo(usage.get(t.key)![0]!)"
                >{{ usage.get(t.key)!.length }}</a
              >
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
