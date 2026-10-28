import { describe, expect, it } from 'vitest';
import { clamp, inputChecked, inputValue } from './util';

describe('util', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it('reads event targets', () => {
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.value = 'x';
    i.checked = true;
    const e = new Event('change');
    i.dispatchEvent(e);
    expect(inputValue(e)).toBe('x');
    expect(inputChecked(e)).toBe(true);
  });
});
