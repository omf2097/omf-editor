// Keyboard shortcut registry (spec 12 §11). Matched on KeyboardEvent.code so
// layouts other than US work; the Reference view lists this registry.

import { useEventListener } from '@vueuse/core';

export interface Shortcut {
  /** e.g. "Ctrl+S", "Ctrl+Alt+Digit1", "KeyF", "Space", "Shift+KeyG". */
  keys: string;
  /** Human form for display, e.g. "Ctrl+S". */
  label: string;
  description: string;
  /** View scope; 'global' is active everywhere. More specific scopes win. */
  scope: string;
  run: (e: KeyboardEvent) => void;
  /** Also fires while typing in a text field (spec 12 §11 lists which). */
  inInputs?: boolean;
}

const registry = new Map<string, Shortcut[]>();
const activeScopes: string[] = ['global'];
/** Every shortcut registered so far, by scope and keys, for the Reference view. */
const catalogue = new Map<string, Omit<Shortcut, 'run'>>();
/** Open modal dialogs suspend every shortcut. */
let suspended = 0;

/** The event in `Shortcut.keys` form; Cmd counts as Ctrl. */
function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.code);
  return parts.join('+');
}

const NON_TEXT_INPUTS = [
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'color',
  'file',
];

/** Focus is in a field that takes typed text (or a select, which takes letters and arrows). */
export function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLInputElement) return !NON_TEXT_INPUTS.includes(t.type);
  return false;
}

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/** Keys a focused control handles itself: slider and radio arrows, Space/Enter on buttons. */
function ownsKey(t: EventTarget | null, e: KeyboardEvent): boolean {
  if (!(t instanceof HTMLElement) || e.ctrlKey || e.metaKey || e.altKey) return false;
  const activate = e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter';
  if (t instanceof HTMLInputElement) {
    if (t.type === 'range')
      return ARROWS.includes(e.code) || ['Home', 'End', 'PageUp', 'PageDown'].includes(e.code);
    if (t.type === 'radio') return ARROWS.includes(e.code) || e.code === 'Space';
    if (t.type === 'checkbox') return e.code === 'Space';
    return ['button', 'submit', 'reset', 'color', 'file'].includes(t.type) && activate;
  }
  if (t instanceof HTMLButtonElement || t.tagName === 'SUMMARY') return activate;
  if (t instanceof HTMLAnchorElement && t.hasAttribute('href')) return e.code === 'Enter';
  const role = t.getAttribute('role');
  if (role === 'button' || role === 'option' || role === 'tab') return activate;
  return false;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing || suspended > 0) return;
  const combo = comboOf(e);
  const typing = isTyping(e.target);
  // Most specific scope first. The first scope that binds the combo decides,
  // also when it does not fire: a view's key never falls through to 'global'.
  for (let i = activeScopes.length - 1; i >= 0; i--) {
    const list = registry.get(activeScopes[i]!) ?? [];
    const s = list.find((x) => x.keys === combo);
    if (!s) continue;
    // In text fields only the shortcuts marked inInputs fire (and Esc), so
    // Ctrl+A/C/V/Z keep their text meaning.
    if (typing && !s.inInputs && e.code !== 'Escape') return;
    if (ownsKey(e.target, e)) return;
    e.preventDefault();
    s.run(e);
    return;
  }
}

let installed = false;

export function useShortcuts() {
  return {
    install() {
      if (installed) return;
      installed = true;
      useEventListener(window, 'keydown', onKeydown);
    },
    /** Registers shortcuts for a scope; returns an unregister function. */
    register(scope: string, list: Omit<Shortcut, 'scope'>[]): () => void {
      const items = list.map((s) => ({ ...s, scope }));
      registry.set(scope, [...(registry.get(scope) ?? []), ...items]);
      for (const s of items)
        catalogue.set(`${scope} ${s.keys}`, {
          keys: s.keys,
          label: s.label,
          description: s.description,
          scope,
          inInputs: s.inInputs,
        });
      return () => {
        registry.set(
          scope,
          (registry.get(scope) ?? []).filter((s) => !items.includes(s)),
        );
      };
    },
    /** Activates a view scope while a view is mounted; returns a deactivate function. */
    activate(scope: string): () => void {
      activeScopes.push(scope);
      return () => {
        const i = activeScopes.lastIndexOf(scope);
        if (i >= 0) activeScopes.splice(i, 1);
      };
    },
    /** Suspends every shortcut (while a modal dialog is open); returns a resume function. */
    suspend(): () => void {
      suspended++;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        suspended--;
      };
    },
    /** Shortcuts registered right now. */
    all(): Shortcut[] {
      return [...registry.values()].flat();
    },
    /** Every shortcut registered since the page loaded, including views not open now. */
    known(): Omit<Shortcut, 'run'>[] {
      return [...catalogue.values()];
    },
  };
}
