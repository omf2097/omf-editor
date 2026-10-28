<script setup lang="ts">
import {
  AI_MOVE_TRIGGERS,
  ARENA_LAYOUT,
  EXTRA_STRING_SELECTORS,
  MOVE_CATEGORIES,
  MUSIC_MASK,
  POSITION_CONSTRAINTS,
  REMAP_SLOT_NOTES,
  msPerTick,
} from '@omf/formats';
import TagReference from '../components/reference/TagReference.vue';
import TriggerReference from '../components/reference/TriggerReference.vue';
import ShortcutReference from '../components/reference/ShortcutReference.vue';
import { FIELD_GROUPS, LIMIT_ROWS } from '../lib/fields';
import { hex2 } from '../lib/colorHex';

// In-app reference generated from the editor's own data (spec 21 §1). The
// sections that depend on the open document or on state live in components/reference.

const SECTIONS = [
  ['tags', 'Animation tags'],
  ['fields', 'Fields'],
  ['enums', 'Enums and flags'],
  ['palette', 'Palette layout'],
  ['limits', 'Limits'],
  ['triggers', 'Trigger notation'],
  ['timing', 'Timing'],
  ['shortcuts', 'Shortcuts'],
  ['about', 'About'],
] as const;

const flagGroups = [
  { title: 'AI triggers (ai_flags)', flags: AI_MOVE_TRIGGERS },
  { title: 'Constraints (pos_constraint)', flags: POSITION_CONSTRAINTS },
  { title: 'Music (music_mask)', flags: MUSIC_MASK },
];
</script>

<template>
  <div class="d-flex h-100" data-testid="view.reference">
    <nav class="border-end p-3 small flex-none" style="width: 200px">
      <a
        v-for="[id, label] in SECTIONS"
        :key="id"
        class="d-block mb-1"
        :href="`#/reference`"
        @click.prevent="$el.ownerDocument.getElementById(`ref-${id}`)?.scrollIntoView()"
        >{{ label }}</a
      >
    </nav>
    <div class="flex-grow-1 overflow-auto p-3" style="max-width: 1100px">
      <TagReference />

      <section id="ref-fields" class="mt-4">
        <h5>Fields</h5>
        <div v-for="g in FIELD_GROUPS" :key="g.title" class="mb-3">
          <h6>{{ g.title }}</h6>
          <table class="table table-sm small">
            <thead>
              <tr>
                <th>Field</th>
                <th>Label</th>
                <th>Type</th>
                <th>Range</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in g.fields" :key="f.code">
                <td>
                  <code>{{ f.code }}</code>
                </td>
                <td>{{ f.label }}</td>
                <td>{{ f.type }}</td>
                <td>{{ f.range }}</td>
                <td class="text-secondary">{{ f.note }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="ref-enums" class="mt-4">
        <h5>Enums and flags</h5>
        <div class="row">
          <div class="col-md-6">
            <h6>Move category</h6>
            <table class="table table-sm small">
              <tbody>
                <tr v-for="c in MOVE_CATEGORIES" :key="c.value">
                  <td>{{ c.value }}</td>
                  <td>
                    <code>{{ c.name }}</code>
                  </td>
                  <td>{{ c.desc }}</td>
                </tr>
              </tbody>
            </table>
            <h6>Extra string selector</h6>
            <table class="table table-sm small">
              <tbody>
                <tr v-for="c in EXTRA_STRING_SELECTORS" :key="c.value">
                  <td>{{ c.value }}</td>
                  <td>
                    <code>{{ c.name }}</code>
                  </td>
                  <td>{{ c.desc }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="col-md-6">
            <div v-for="g in flagGroups" :key="g.title">
              <h6>{{ g.title }}</h6>
              <table class="table table-sm small">
                <tbody>
                  <tr v-for="f in g.flags" :key="f.bit">
                    <td class="mono">0x{{ f.bit.toString(16).toUpperCase() }}</td>
                    <td>
                      <code>{{ f.name }}</code>
                    </td>
                    <td>{{ f.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section id="ref-palette" class="mt-4">
        <h5>Palette layout and remap slots</h5>
        <table class="table table-sm small">
          <tbody>
            <tr v-for="r in ARENA_LAYOUT" :key="r.id">
              <td class="mono">0x{{ hex2(r.start) }}–0x{{ hex2(r.end) }}</td>
              <td>{{ r.label }}</td>
              <td>{{ r.desc }}</td>
            </tr>
          </tbody>
        </table>
        <table class="table table-sm small">
          <thead>
            <tr>
              <th>Slot</th>
              <th>Cards site</th>
              <th>Use</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(note, slot) in REMAP_SLOT_NOTES" :key="slot">
              <td>{{ slot }}</td>
              <td>{{ Number(slot) + 1 }}</td>
              <td>{{ note }}</td>
            </tr>
            <tr>
              <td>6–18</td>
              <td>7–19</td>
              <td>Not used by openomf; preserved</td>
            </tr>
          </tbody>
        </table>
      </section>

      <TriggerReference />

      <section id="ref-limits" class="mt-4">
        <h5>Limits</h5>
        <table class="table table-sm small" data-testid="ref.limits">
          <thead>
            <tr>
              <th>What</th>
              <th>Limit</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="[what, limit, src] in LIMIT_ROWS" :key="what">
              <td>{{ what }}</td>
              <td>{{ limit }}</td>
              <td class="text-secondary">{{ src }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="ref-timing" class="mt-4">
        <h5>Timing</h5>
        <p class="small">
          One script tick is one game tick. Arenas: 48 − 4 × speed ms (game speed setting 0–10,
          default 5 = 28 ms); other scenes: 10 ms.
        </p>
        <table class="table table-sm small w-auto">
          <tbody>
            <tr v-for="s in 11" :key="s">
              <td>speed {{ s - 1 }}</td>
              <td>{{ msPerTick('arena', s - 1) }} ms</td>
            </tr>
          </tbody>
        </table>
      </section>

      <ShortcutReference />

      <section id="ref-about" class="mt-4 mb-5 small">
        <h5>About</h5>
        <p>
          OMF 2097 file editor. MIT licence. Runs entirely in your browser; files are never
          uploaded.
        </p>
        <p>
          Original game data: katajakasa.fi/projects/openomf/cards. Format references: pyomftools
          and openomf. (Links are not followed from here; the app makes no network requests.)
        </p>
      </section>
    </div>
  </div>
</template>
