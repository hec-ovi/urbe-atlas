/** A range input and an exact numeric input that always carry the same value. */
import { el } from './dom';

export interface RangeFieldOptions {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  exactMin?: number;
  exactMax?: number;
  unit?: string;
  description?: string;
  integer?: boolean;
  onInput?: () => void;
}

export class RangeField {
  readonly root: HTMLElement;
  readonly range: HTMLInputElement;
  readonly number: HTMLInputElement;

  constructor(options: RangeFieldOptions) {
    this.range = el('input', {
      type: 'range',
      min: String(options.min),
      max: String(options.max),
      step: String(options.step),
      value: String(options.value),
      'aria-label': `${options.label} slider`,
    });
    const numberAttrs: Record<string, string> = {
      id: options.id,
      type: 'number',
      min: String(options.exactMin ?? options.min),
      step: String(options.step),
      value: String(options.value),
      inputmode: options.integer ? 'numeric' : 'decimal',
    };
    if (options.exactMax !== undefined) numberAttrs.max = String(options.exactMax);
    this.number = el('input', numberAttrs);
    const sync = (source: HTMLInputElement, target: HTMLInputElement) => {
      target.value = source.value;
      options.onInput?.();
    };
    this.range.addEventListener('input', () => sync(this.range, this.number));
    this.number.addEventListener('input', () => sync(this.number, this.range));

    const exact = el('div', { class: 'range-exact' }, [this.number]);
    if (options.unit) exact.append(el('span', { class: 'unit', text: options.unit }));
    const heading = el('div', { class: 'control-heading' }, [
      el('label', { for: options.id, text: options.label }),
      exact,
    ]);
    this.root = el('div', { class: 'range-field' }, [heading, this.range]);
    if (options.description) this.root.append(el('p', { class: 'control-help', text: options.description }));
  }

  get value(): number {
    return Number(this.number.value);
  }

  set value(value: number) {
    this.number.value = String(value);
    this.range.value = String(value);
  }
}
