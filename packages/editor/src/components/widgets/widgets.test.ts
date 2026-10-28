import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useDisplay } from '../../composables/useDisplay';
import IntField from './IntField.vue';
import FixedField from './FixedField.vue';
import FlagGroup from './FlagGroup.vue';
import ByteString from './ByteString.vue';

const emitted = (w: ReturnType<typeof mount>) =>
  (w.emitted('update:modelValue') ?? []).map((e) => e[0]);

describe('IntField', () => {
  const field = (modelValue = 5, extra = {}) =>
    mount(IntField, { props: { modelValue, min: -10, max: 300, testid: 'f', ...extra } });

  it('commits on Enter and blur, within the bounds only', async () => {
    const w = field();
    const input = w.find('input');
    await input.setValue('300');
    await input.trigger('keydown', { key: 'Enter' });
    await input.setValue('301');
    expect(input.classes()).toContain('is-invalid');
    expect(input.attributes('aria-invalid')).toBe('true');
    await input.trigger('blur');
    await input.setValue('-10');
    await input.trigger('blur');
    await input.setValue('-11');
    await input.trigger('blur');
    await input.setValue('2.5');
    await input.trigger('blur');
    expect(emitted(w)).toEqual([300, -10]);
  });

  it('takes hex and +sign; Escape restores the value', async () => {
    const w = field();
    const input = w.find('input');
    await input.setValue('0x1F');
    await input.trigger('keydown', { key: 'Enter' });
    await input.setValue('+7');
    await input.trigger('keydown', { key: 'Enter' });
    await input.setValue('abc');
    await input.trigger('keydown', { key: 'Escape' });
    expect((input.element as HTMLInputElement).value).toBe('5');
    expect(emitted(w)).toEqual([31, 7]);
  });

  it('arrow keys step by 1 and Shift by 10, clamped', async () => {
    const w = field(295);
    const input = w.find('input');
    await input.trigger('keydown', { key: 'ArrowUp' });
    await input.trigger('keydown', { key: 'ArrowUp', shiftKey: true });
    await input.trigger('keydown', { key: 'ArrowDown' });
    expect(emitted(w)).toEqual([296, 300, 299]);
  });

  it('hex fields show negatives as -0x', () => {
    const w = field(-10, { hex: true });
    expect((w.find('input').element as HTMLInputElement).value).toBe('-0xA');
  });
});

describe('FixedField', () => {
  const field = (modelValue: number) =>
    mount(FixedField, { props: { modelValue, min: -0x80000000, max: 0x7fffffff } });

  it('shows raw / 256 and commits value × 256, rounded', async () => {
    const w = field(1408);
    const input = w.find('input');
    expect((input.element as HTMLInputElement).value).toBe('5.5');
    await input.setValue('−14.5');
    await input.trigger('keydown', { key: 'Enter' });
    await input.setValue('1,148');
    await input.trigger('keydown', { key: 'Enter' });
    expect(emitted(w)).toEqual([-3712, 294]);
  });

  it('every shown value commits back to the same raw value', async () => {
    for (let raw = -2000; raw <= 2000; raw += 7) {
      const w = field(raw);
      const input = w.find('input');
      await input.trigger('keydown', { key: 'Enter' });
      expect(emitted(w), String(raw)).toEqual([]);
      w.unmount();
    }
  });

  it('refuses text that is not a number or out of range', async () => {
    const w = mount(FixedField, { props: { modelValue: 0, min: 0, max: 512 } });
    const input = w.find('input');
    for (const t of ['x', '2.01', '-0.1', '1e2']) {
      await input.setValue(t);
      await input.trigger('keydown', { key: 'Enter' });
    }
    expect(input.classes()).toContain('is-invalid');
    expect(emitted(w)).toEqual([]);
  });
});

describe('display: field names and widths', () => {
  const { showFieldCodes } = useDisplay();
  afterEach(() => {
    showFieldCodes.value = false;
  });

  it('labels show the field name only when the setting is on; the tooltip always has it', async () => {
    const w = mount(IntField, {
      props: { modelValue: 1, min: 0, max: 255, label: 'Points', code: 'points' },
    });
    expect(w.find('.field-code').exists()).toBe(false);
    expect(w.text()).toBe('Points');
    expect(w.find('label').attributes('title')).toContain('points');
    showFieldCodes.value = true;
    await nextTick();
    expect(w.find('.field-code').text()).toBe('points');
  });

  it('inputs are as wide as the longest value of their range', () => {
    const width = (min: number, max: number, extra = {}) =>
      (
        mount(IntField, { props: { modelValue: 0, min, max, ...extra } }).find('input')
          .element as HTMLInputElement
      ).style.width;
    expect(width(0, 255)).toBe('calc(4ch + 1rem + 2px)');
    expect(width(-32768, 32767)).toBe('calc(7ch + 1rem + 2px)');
    // An explicit width still sizes the whole field.
    expect(width(0, 255, { width: '7rem' })).toBe('');
  });

  it('a fixed-point field shows the raw value as a suffix of the input', () => {
    const w = mount(FixedField, {
      props: { modelValue: 1408, min: -0x80000000, max: 0x7fffffff, testid: 'f' },
    });
    const raw = w.find('[data-testid="f.raw"]');
    expect(raw.text()).toBe('1408');
    expect(raw.classes()).toContain('input-group-text');
    expect(raw.element.parentElement!.classList).toContain('input-group');
  });
});

describe('FlagGroup', () => {
  const flags = [
    { bit: 1, name: 'A', desc: 'a' },
    { bit: 4, name: 'C', desc: 'c' },
  ];

  it('toggles bits, shows hex and lists unknown set bits with a clear button', async () => {
    const w = mount(FlagGroup, {
      props: { modelValue: 0x8001, flags, title: 'Flags', collapsible: false, testid: 'g' },
    });
    expect(w.find('[data-testid="g.hex"]').text()).toBe('(0x8001)');
    expect(w.find('[data-testid="g.A"]').element).toHaveProperty('checked', true);
    await w.find('[data-testid="g.C"]').trigger('change');
    await w.find('[data-testid="g.A"]').trigger('change');
    expect(w.find('[data-testid="g.unknown"]').text()).toContain('0x8000');
    await w.find('[aria-label="Clear unknown bit 0x8000"]').trigger('click');
    expect(emitted(w)).toEqual([0x8005, 0x8000, 0x0001]);
  });

  it('32-bit groups stay unsigned', async () => {
    const w = mount(FlagGroup, {
      props: { modelValue: 0x80000000, flags, title: 'F', collapsible: false, bits: 32 },
    });
    await w.findAll('input')[0]!.trigger('change');
    expect(emitted(w)).toEqual([0x80000001]);
  });
});

describe('ByteString', () => {
  it('commits cp437 text within the byte limit only', async () => {
    const w = mount(ByteString, { props: { modelValue: 'A1', maxBytes: 4, testid: 's' } });
    const input = w.find('[data-testid="s"]');
    for (const t of ['A1€', 'ABCDE', 'A\0', 'ÇB2']) {
      await input.setValue(t);
      await input.trigger('keydown', { key: 'Enter' });
    }
    expect(emitted(w)).toEqual(['ÇB2']);
    expect(w.text()).not.toContain('cp437 only');
    await input.setValue('A1€');
    expect(w.text()).toContain('cp437 only');
  });
});
