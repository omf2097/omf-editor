<script setup lang="ts">
import { ref, watch } from 'vue';
import { InputBuffer, msPerTick, type AFFile, type TriggerButton } from '@omf/formats';
import { useDocument } from '../composables/useDocument';
import { animationLabel, isAF } from '../lib/doc';

// "Try it" of the trigger editor (spec 18 §4): keys typed here feed the
// game's input buffer, timed in arena ticks of real time, and a P or K press
// reports the move the game would start.

const props = defineProps<{ moveId: number }>();
const docs = useDocument();

let tryBuffer = new InputBuffer();
const tryResult = ref<{ id: number | null; buffer: string } | null>(null);
const tryStart = performance.now();
const tick = (): number => Math.floor((performance.now() - tryStart) / msPerTick('arena'));

// The component is reused across moves: nothing of the previous move may leak.
watch(
  () => props.moveId,
  () => {
    tryBuffer = new InputBuffer();
    tryResult.value = null;
  },
);

function onTryKey(e: KeyboardEvent): void {
  const d = docs.doc.value;
  if (!d || !isAF(d)) return;
  const k = e.key;
  if (/^[1-9]$/.test(k)) {
    e.preventDefault();
    tryBuffer.push(k, tick());
    tryResult.value = { id: null, buffer: tryBuffer.buffer };
  } else if (/^[pkPK]$/.test(k)) {
    e.preventDefault();
    const before = tryBuffer.buffer;
    const id = tryBuffer.press(d as AFFile, k.toUpperCase() as TriggerButton, tick());
    tryResult.value = { id, buffer: before };
  }
}
</script>

<template>
  <details class="small mt-1">
    <summary>Try it</summary>
    <p class="text-secondary mb-1">
      Type numpad digits and P or K here; the game's rules pick a move (repeats collapse, at most 9
      ticks between inputs). Chain rules are not simulated.
    </p>
    <input
      class="form-control form-control-sm mono"
      placeholder="e.g. 2 3 6 p"
      aria-label="Try the trigger"
      data-testid="trigger.try"
      @keydown="onTryKey"
    />
    <div v-if="tryResult" class="mt-1" data-testid="trigger.try.result">
      buffer <code>{{ tryResult.buffer || '–' }}</code>
      <template v-if="tryResult.id !== null">
        → move <strong>{{ tryResult.id }}</strong> {{ animationLabel('af', tryResult.id) }}
        <span v-if="tryResult.id === moveId" class="text-success">(this move)</span>
      </template>
    </div>
  </details>
</template>
