import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { useShortcuts } from './useShortcuts';

// Shared behaviour of modal dialogs and popups (spec 12 §11, §13).

/** Open modals, innermost last; only the innermost one handles keys. */
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.tabIndex >= 0 && el.getClientRects().length > 0,
  );
}

/** Tab and Shift+Tab wrap around inside `panel`; focus outside it is brought back in. */
function trapTab(e: KeyboardEvent, panel: HTMLElement): void {
  const list = focusables(panel);
  if (!list.length) {
    e.preventDefault();
    panel.focus();
    return;
  }
  const first = list[0]!;
  const last = list[list.length - 1]!;
  const active = document.activeElement;
  const inside = active instanceof Node && panel.contains(active);
  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

export interface ModalOptions {
  /** Whether the dialog is shown. */
  open: () => boolean;
  /** The dialog panel (role="dialog"); focus is kept inside it. */
  panel: Ref<HTMLElement | null>;
  /** Called on Esc. */
  close: () => void;
  /** Element to focus first; default the first focusable control. */
  initialFocus?: () => HTMLElement | null | undefined;
}

/**
 * Modal dialog: suspends shortcuts, focuses the first control, traps Tab,
 * closes on Esc (window level, wherever focus is) and restores focus on close.
 */
export function useModal(o: ModalOptions): void {
  const id = Symbol('modal');
  const shortcuts = useShortcuts();
  let restore: Element | null = null;
  let resume: (() => void) | null = null;
  /** Listens for keys only while this modal is open. */
  const listening = ref(false);
  useEventListener(() => (listening.value ? window : null), 'keydown', onKey, { capture: true });

  function onKey(e: KeyboardEvent): void {
    if (stack[stack.length - 1] !== id) return;
    const panel = o.panel.value;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      o.close();
    } else if (e.key === 'Tab' && panel) {
      trapTab(e, panel);
    }
  }

  async function activate(): Promise<void> {
    if (resume) return;
    restore = document.activeElement;
    stack.push(id);
    resume = shortcuts.suspend();
    listening.value = true;
    await nextTick();
    const panel = o.panel.value;
    if (!panel) return;
    const el = o.initialFocus?.() ?? focusables(panel)[0] ?? panel;
    el.focus();
  }

  function deactivate(): void {
    if (!resume) return;
    resume();
    resume = null;
    const i = stack.indexOf(id);
    if (i >= 0) stack.splice(i, 1);
    listening.value = false;
    const r = restore;
    restore = null;
    if (r instanceof HTMLElement && r.isConnected) r.focus();
  }

  watch(o.open, (v) => (v ? void activate() : deactivate()), { immediate: true });
  onBeforeUnmount(deactivate);
}

/**
 * Popup menu or picker: closes on Esc and on a pointer press outside `root`
 * (which should contain the toggle button too).
 */
export function useDismiss(open: () => boolean, root: Ref<HTMLElement | null>, close: () => void) {
  function onKey(e: KeyboardEvent): void {
    // A modal opened above the popup handles its own keys.
    if (e.key !== 'Escape' || stack.length) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }
  function onDown(e: PointerEvent): void {
    const r = root.value;
    if (r && e.target instanceof Node && r.contains(e.target)) return;
    close();
  }
  // Both listeners exist only while the popup is open.
  const target = () => (open() ? window : null);
  useEventListener(target, 'keydown', onKey, { capture: true });
  useEventListener(target, 'pointerdown', onDown, { capture: true });
}
