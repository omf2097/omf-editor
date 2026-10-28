import { ref } from 'vue';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
  /** Errors stay until dismissed. */
  sticky: boolean;
}

const toasts = ref<Toast[]>([]);
let nextId = 1;

function push(kind: Toast['kind'], message: string, sticky = kind === 'error'): number {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, kind, message, sticky }];
  if (!sticky) setTimeout(() => dismiss(id), 4000);
  return id;
}

function dismiss(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export function useToasts() {
  return {
    toasts,
    info: (m: string) => push('info', m),
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    dismiss,
  };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
