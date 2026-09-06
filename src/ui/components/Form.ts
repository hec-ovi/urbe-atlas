/** Iterates a workspace form document. Widget types are listed in the UI contract. */
import type { FormPreset, FormWidget, LayerGroup, WorkspaceForm } from '../../cities/forms/schema';
import { Slider } from '../ui/Slider';
import { LayerToggles } from '../widgets/LayerToggles';
import { el } from './dom';
import { deletePath, getPath, setPath } from './paths';

export interface FormEvents {
  onAction: (id: string, values: Record<string, unknown>) => void;
  onFile?: (id: string, file: File) => void;
  onChange?: (values: Record<string, unknown>) => void;
}

interface BoundSlider { widget: FormWidget; slider: Slider }
interface BoundOptional { widget: FormWidget; enabled: HTMLInputElement; value: HTMLInputElement }
interface BoundChoice { widget: FormWidget; inputs: Map<string, HTMLInputElement> }

export class Form {
  readonly root: HTMLElement;
  private values: Record<string, unknown>;
  private readonly error: HTMLElement;
  private readonly status: HTMLElement;
  private readonly generate: HTMLButtonElement | null = null;
  private readonly sliders: BoundSlider[] = [];
  private readonly optionals: BoundOptional[] = [];
  private readonly texts = new Map<string, HTMLInputElement>();
  private readonly selects = new Map<string, HTMLSelectElement>();
  private readonly toggles = new Map<string, HTMLInputElement>();
  private readonly choices: BoundChoice[] = [];
  private readonly files = new Map<string, HTMLInputElement>();
  private layers: LayerToggles | null = null;
  private layersPath = 'filters';
  private busy = false;

  constructor(private readonly schema: WorkspaceForm, private readonly events: FormEvents) {
    this.values = structuredClone(schema.values);
    const body = el('div', { class: 'form-body' });
    for (const widget of schema.form) body.append(this.render(widget));
    this.error = el('p', { class: 'form-error', role: 'alert', 'aria-live': 'polite' });
    this.status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
    this.root = el('div', { class: 'schema-form' }, [body, this.error, this.status]);
    this.generate = this.root.querySelector('#generate, [data-action="generate"]') as HTMLButtonElement | null;
    this.sync();
  }

  read(): Record<string, unknown> {
    return structuredClone(this.values);
  }

  setValues(values: Record<string, unknown>): void {
    this.values = structuredClone(this.schema.values);
    this.merge(values);
    for (const key of ['pavingDesign', 'streetDesign', 'hydrology', 'maxFloorsByDistrict']) {
      if (!(key in values)) delete this.values[key];
    }
    this.sync();
  }

  set(path: string, value: unknown): void {
    setPath(this.values, path, value);
    this.sync();
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.validate();
  }

  setInteriorCount(count: number | null): void {
    this.layers?.setInteriorCount(count);
  }

  private render(widget: FormWidget): HTMLElement {
    switch (widget.type) {
      case 'heading':
        return el('section', { class: 'creation-intro' }, [
          ...(widget.eyebrow ? [el('p', { class: 'eyebrow', text: widget.eyebrow })] : []),
          el('h2', { text: widget.text ?? '' }),
          ...(widget.description ? [el('p', { text: widget.description })] : []),
        ]);
      case 'note':
        return el('p', { class: 'section-note', text: widget.text ?? '' });
      case 'section': {
        const items = (widget.items as FormWidget[] ?? []).map((item) => this.render(item));
        const body = el('div', { class: widget.columns ? `form-grid form-grid-${widget.columns}` : 'form-stack' }, items);
        return el('section', { class: 'form-section' }, [el('h3', { text: widget.title ?? '' }), body]);
      }
      case 'grid': {
        const items = (widget.items as FormWidget[] ?? []).map((item) => this.render(item));
        return el('div', { class: `form-grid form-grid-${widget.columns ?? 2}` }, items);
      }
      case 'action-row': {
        const items = (widget.items as FormWidget[] ?? []).map((item) => this.render(item));
        return el('div', { class: 'seed-row' }, items);
      }
      case 'presets': {
        const row = el('div', { class: 'preset-row', role: 'group', 'aria-label': 'City presets' });
        for (const preset of widget.items as FormPreset[] ?? []) {
          const button = el('button', {
            type: 'button', class: preset.id === 'reset' ? 'preset-button reset-button' : 'preset-button',
            text: preset.label,
          });
          button.addEventListener('click', () => this.applyPreset(preset));
          row.append(button);
        }
        return row;
      }
      case 'text': {
        const input = el('input', {
          type: 'text', value: String(getPath(this.values, widget.path!) ?? ''),
          id: widget.id ?? widget.path!, autocomplete: 'off', spellcheck: 'false',
        });
        input.addEventListener('input', () => { setPath(this.values, widget.path!, input.value); this.changed(); });
        this.texts.set(widget.path!, input);
        return el('label', { class: 'seed-field', for: input.id }, [el('span', { text: widget.label ?? '' }), input]);
      }
      case 'slider': {
        const slider = new Slider({
          id: widget.id ?? widget.path!,
          label: widget.label ?? '',
          min: widget.min ?? 0, max: widget.max ?? 1, step: widget.step ?? 1,
          value: Number(getPath(this.values, widget.path!) ?? widget.min ?? 0),
          exactMin: widget.exactMin, exactMax: widget.exactMax, unit: widget.unit,
          description: widget.description, integer: widget.integer,
          onInput: () => { setPath(this.values, widget.path!, slider.value); this.changed(); },
        });
        this.sliders.push({ widget, slider });
        return slider.root;
      }
      case 'select': {
        const select = el('select', { id: widget.id ?? widget.path!, 'aria-label': widget.label ?? '' });
        for (const option of widget.options ?? []) select.append(el('option', { value: option.value, text: option.label }));
        select.value = this.selectValue(widget);
        select.addEventListener('change', () => { this.writeSelect(widget, select.value); this.changed(); });
        this.selects.set(widget.path!, select);
        return el('label', { for: select.id }, [el('span', { text: widget.label ?? '' }), select]);
      }
      case 'choice': {
        const group = el('div', { class: 'view-mode', role: 'group', 'aria-label': widget.label ?? '' });
        const inputs = new Map<string, HTMLInputElement>();
        const name = widget.path ?? 'choice';
        for (const option of widget.options ?? []) {
          const input = el('input', { type: 'radio', name, id: `${name}-${option.value}`, value: option.value });
          input.checked = String(getPath(this.values, widget.path!) ?? '') === option.value;
          input.addEventListener('change', () => {
            if (input.checked) { setPath(this.values, widget.path!, option.value); this.changed(); }
          });
          inputs.set(option.value, input);
          group.append(el('label', { for: input.id }, [input, option.label]));
        }
        this.choices.push({ widget, inputs });
        return group;
      }
      case 'toggle': {
        const input = el('input', { type: 'checkbox', id: widget.id ?? widget.path! });
        input.setAttribute('aria-label', widget.label ?? '');
        input.checked = Boolean(getPath(this.values, widget.path!));
        input.addEventListener('change', () => { setPath(this.values, widget.path!, input.checked); this.changed(); });
        this.toggles.set(widget.path!, input);
        return el('label', { class: 'toggle-card', for: input.id }, [
          input,
          el('span', { class: 'toggle-copy' }, [
            el('strong', { text: widget.label ?? '' }),
            ...(widget.description ? [el('small', { text: widget.description })] : []),
          ]),
        ]);
      }
      case 'optional-number': {
        const enabled = el('input', { type: 'checkbox', id: widget.id ?? widget.path! });
        const value = el('input', {
          type: 'number', min: String(widget.min ?? 1), step: String(widget.step ?? 1),
          id: `${widget.id ?? widget.path!}-value`, disabled: '',
        });
        value.setAttribute('aria-label', `${widget.label} floor cap`);
        const current = getPath(this.values, widget.path!);
        enabled.checked = current !== undefined;
        value.disabled = !enabled.checked;
        value.value = String(current ?? this.values.maxFloors ?? 1);
        const write = () => {
          if (enabled.checked) setPath(this.values, widget.path!, Number(value.value));
          else deletePath(this.values, widget.path!);
          this.changed();
        };
        enabled.addEventListener('change', () => { value.disabled = !enabled.checked; write(); });
        value.addEventListener('input', write);
        this.optionals.push({ widget, enabled, value });
        return el('div', { class: 'district-cap' }, [
          el('label', { for: enabled.id }, [enabled, widget.label ?? '']),
          value,
        ]);
      }
      case 'action': {
        const button = el('button', {
          type: 'button', text: widget.label ?? '',
          class: widget.style === 'primary' ? 'primary generate-button' : widget.style === 'danger' ? 'danger-button' : '',
          'data-action': widget.id ?? '',
        });
        if (widget.id === 'generate') button.id = 'generate';
        if (widget.id === 'random-seed') button.className = 'icon-button';
        button.setAttribute('aria-label', widget.label ?? '');
        button.addEventListener('click', () => {
          if (widget.id === 'generate' && !this.validate(true)) return;
          this.events.onAction(widget.id ?? '', this.read());
        });
        return button;
      }
      case 'file': {
        const input = el('input', {
          type: 'file', accept: widget.accept ?? 'application/json,.json',
          id: widget.id ?? 'file', class: 'file-input',
        });
        input.setAttribute('aria-label', widget.label ?? 'File');
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          input.value = '';
          if (file) this.events.onFile?.(widget.id ?? '', file);
        });
        this.files.set(widget.id ?? '', input);
        return el('label', { class: 'visually-hidden', for: input.id }, [widget.label ?? 'File', input]);
      }
      case 'layers': {
        this.layersPath = widget.path ?? 'filters';
        this.layers = new LayerToggles(
          (filters) => { setPath(this.values, this.layersPath, filters); this.events.onChange?.(this.read()); },
          widget.items as LayerGroup[],
          widget.constraint,
        );
        return this.layers.root;
      }
      default:
        return el('p', { class: 'section-note', text: `Unsupported control: ${widget.type}` });
    }
  }

  private applyPreset(preset: FormPreset): void {
    const kept = new Map<string, unknown>();
    for (const path of preset.keep ?? []) kept.set(path, getPath(this.values, path));
    this.values = structuredClone(this.schema.values);
    this.merge(preset.values);
    for (const [path, value] of kept) if (value !== undefined) setPath(this.values, path, value);
    this.sync();
  }

  private merge(values: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        delete this.values[key];
        continue;
      }
      const existing = this.values[key];
      if (plain(existing) && plain(value)) this.values[key] = { ...existing, ...structuredClone(value) };
      else this.values[key] = structuredClone(value);
    }
  }

  private selectValue(widget: FormWidget): string {
    const value = getPath(this.values, widget.path!);
    if (value === undefined || value === null || value === '') return widget.empty ?? '';
    return String(value);
  }

  private writeSelect(widget: FormWidget, value: string): void {
    if (widget.empty !== undefined && value === widget.empty) deletePath(this.values, widget.path!);
    else setPath(this.values, widget.path!, value);
  }

  private sync(): void {
    for (const [path, input] of this.texts) input.value = String(getPath(this.values, path) ?? '');
    for (const { widget, slider } of this.sliders) slider.value = Number(getPath(this.values, widget.path!) ?? 0);
    for (const [path, select] of this.selects) {
      const widget = this.schemaWidget(path);
      select.value = widget ? this.selectValue(widget) : String(getPath(this.values, path) ?? '');
    }
    for (const [path, input] of this.toggles) input.checked = Boolean(getPath(this.values, path));
    for (const { widget, enabled, value } of this.optionals) {
      const current = getPath(this.values, widget.path!);
      enabled.checked = current !== undefined;
      value.disabled = !enabled.checked;
      value.value = String(current ?? getPath(this.values, 'maxFloors') ?? 1);
    }
    for (const { widget, inputs } of this.choices) {
      const current = String(getPath(this.values, widget.path!) ?? '');
      for (const [value, input] of inputs) input.checked = value === current;
    }
    this.validate();
    this.events.onChange?.(this.read());
  }

  private schemaWidget(path: string): FormWidget | undefined {
    const visit = (items: FormWidget[]): FormWidget | undefined => {
      for (const item of items) {
        if (item.path === path) return item;
        if (Array.isArray(item.items) && item.items[0] && typeof item.items[0] === 'object' && 'type' in item.items[0]) {
          const found = visit(item.items as FormWidget[]);
          if (found) return found;
        }
      }
      return undefined;
    };
    return visit(this.schema.form);
  }

  private changed(): void {
    this.validate();
    this.events.onChange?.(this.read());
  }

  private validate(focus = false): boolean {
    const issue = this.firstIssue();
    this.error.textContent = issue?.message ?? '';
    this.root.classList.toggle('has-error', issue !== null);
    if (this.generate) this.generate.disabled = this.busy || issue !== null;
    if (focus && issue) issue.element.focus();
    return issue === null;
  }

  private firstIssue(): { element: HTMLElement; message: string } | null {
    for (const [path, input] of this.texts) {
      const widget = this.schemaWidget(path);
      if (widget?.required && !input.value.trim()) return { element: input, message: `Enter a ${widget.label?.toLowerCase() ?? 'value'}.` };
    }
    for (const { widget, slider } of this.sliders) {
      const value = slider.value;
      const min = widget.exactMin ?? widget.min ?? -Infinity;
      const max = widget.exactMax ?? widget.max ?? Infinity;
      if (!Number.isFinite(value)) return { element: slider.number, message: `${widget.label} must be a number.` };
      if (value < min) return { element: slider.number, message: `${widget.label} must be greater than zero.` };
      if (value > max) return { element: slider.number, message: `${widget.label} must be at most ${max}.` };
      if (widget.integer && !Number.isInteger(value)) return { element: slider.number, message: `${widget.label} must be a whole number.` };
    }
    const minDistricts = Number(getPath(this.values, 'districtCount.0'));
    const maxDistricts = Number(getPath(this.values, 'districtCount.1'));
    if (Number.isFinite(minDistricts) && Number.isFinite(maxDistricts) && minDistricts > maxDistricts) {
      const slider = this.sliders.find((item) => item.widget.path === 'districtCount.1');
      return { element: slider?.slider.number ?? this.root, message: 'Maximum districts must be at least the minimum.' };
    }
    const width = Number(getPath(this.values, 'size.width'));
    const depth = Number(getPath(this.values, 'size.depth'));
    if (Number.isFinite(width) && Number.isFinite(depth) && Number.isFinite(minDistricts) && width * depth < minDistricts * 90_000) {
      const slider = this.sliders.find((item) => item.widget.path === 'districtCount.0');
      return { element: slider?.slider.number ?? this.root, message: 'The city is too small for the requested minimum district count.' };
    }
    for (const { widget, enabled, value } of this.optionals) {
      const number = Number(value.value);
      if (enabled.checked && (!Number.isInteger(number) || number < (widget.min ?? 1))) {
        return { element: value, message: `${widget.label} floor cap must be an integer of at least 1.` };
      }
    }
    const weights = this.sliders.filter((item) => item.widget.path?.startsWith('tierWeights.'));
    if (weights.length > 0) {
      if (weights.some((item) => !Number.isFinite(item.slider.value) || item.slider.value < 0)) {
        return { element: weights[0]!.slider.number, message: 'Wealth weights must be zero or greater.' };
      }
      if (weights.reduce((sum, item) => sum + item.slider.value, 0) <= 0) {
        return { element: weights[0]!.slider.number, message: 'At least one wealth weight must be above zero.' };
      }
    }
    return null;
  }

  openFile(id: string): void {
    this.files.get(id)?.click();
  }
}

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
