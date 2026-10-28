import { shallowRef } from 'vue';

export interface ConfirmChoice {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline-secondary';
}

export interface ConfirmRequest {
  title: string;
  message: string;
  /** Optional detail lines, e.g. references that will break. */
  details?: string[];
  choices: ConfirmChoice[];
  resolve: (choice: string) => void;
}

const current = shallowRef<ConfirmRequest | null>(null);

/** A request still open when another one arrives is answered 'cancel'. */
function ask(opts: Omit<ConfirmRequest, 'resolve'>): Promise<string> {
  current.value?.resolve('cancel');
  return new Promise((resolve) => {
    current.value = {
      ...opts,
      resolve: (c) => {
        current.value = null;
        resolve(c);
      },
    };
  });
}

/** OK/Cancel shorthand; resolves true for OK. */
async function confirm(
  title: string,
  message: string,
  ok = 'OK',
  details?: string[],
): Promise<boolean> {
  const choice = await ask({
    title,
    message,
    details,
    choices: [
      { id: 'cancel', label: 'Cancel', variant: 'outline-secondary' },
      { id: 'ok', label: ok, variant: 'primary' },
    ],
  });
  return choice === 'ok';
}

export function useConfirm() {
  return { current, ask, confirm };
}
