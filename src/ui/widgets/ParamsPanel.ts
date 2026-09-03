/** Complete, validated city creation form for every AtlasParams input. */
import type { AtlasParams, DistrictKind, FeatureToggles, HydrologyType, WealthTier } from '../../../schema/params';
import { el } from '../components/dom';
import { RangeField } from '../components/rangeField';

export interface ParamsPanelEvents {
  onGenerate: (params: AtlasParams) => void;
  onExport: (params: AtlasParams) => void;
  onImport: (file: File) => void;
}

const FEATURE_LABELS: Record<keyof FeatureToggles, string> = {
  highways: 'Highways',
  trains: 'Trains',
  subways: 'Subways',
  alleys: 'Alleys',
  airTunnels: 'Air tunnels',
  undergroundTunnels: 'Underground tunnels',
};

const FEATURE_HELP: Record<keyof FeatureToggles, string> = {
  highways: 'Elevated through-routes with ramps and supports',
  trains: 'Grade rail corridors, platforms and stations',
  subways: 'Underground lines, platforms and street entrances',
  alleys: 'Pedestrian cuts through long and dense blocks',
  airTunnels: 'Allow downstream bridges and overhead links',
  undergroundTunnels: 'Allow downstream underground links',
};

const DISTRICTS: DistrictKind[] = ['downtown', 'commercial', 'residential', 'industrial', 'mixed'];
const TIERS: WealthTier[] = ['poor', 'mid', 'rich', 'high_rich'];
const DEFAULT_PARAMS: AtlasParams = {
  seed: 'urbe',
  size: { width: 1000, depth: 1000 },
  irregularity: 0.35,
  districtCount: [1, 3],
  maxFloors: 40,
  maxFloorsByDistrict: {},
  tierWeights: { poor: 0.3, mid: 0.45, rich: 0.2, high_rich: 0.05 },
  features: { highways: true, trains: true, subways: true, alleys: true, airTunnels: true, undergroundTunnels: true },
};

const PRESETS: Record<string, Omit<AtlasParams, 'seed'>> = {
  compact: {
    size: { width: 600, depth: 600 }, irregularity: 0.2, districtCount: [1, 2], maxFloors: 8,
    tierWeights: DEFAULT_PARAMS.tierWeights,
    features: { highways: false, trains: false, subways: false, alleys: true, airTunnels: true, undergroundTunnels: true },
  },
  city: {
    size: { width: 1000, depth: 1000 }, irregularity: 0.35, districtCount: [1, 3], maxFloors: 40,
    tierWeights: DEFAULT_PARAMS.tierWeights, features: DEFAULT_PARAMS.features,
  },
  metro: {
    size: { width: 3000, depth: 3000 }, irregularity: 0.35, districtCount: [4, 8], maxFloors: 60,
    tierWeights: DEFAULT_PARAMS.tierWeights, features: DEFAULT_PARAMS.features,
  },
};

const MIN_DISTRICT_AREA = 90_000;

export class ParamsPanel {
  readonly root: HTMLElement;
  private readonly form: HTMLFieldSetElement;
  private readonly status: HTMLElement;
  private readonly error: HTMLElement;
  private readonly generateButton: HTMLButtonElement;
  private readonly seed: HTMLInputElement;
  private readonly width: RangeField;
  private readonly depth: RangeField;
  private readonly irregularity: RangeField;
  private readonly districtMin: RangeField;
  private readonly districtMax: RangeField;
  private readonly maxFloors: RangeField;
  private readonly hydrology: HTMLSelectElement;
  private readonly districtCaps = new Map<DistrictKind, { enabled: HTMLInputElement; value: HTMLInputElement }>();
  private readonly tierWeights = new Map<WealthTier, RangeField>();
  private readonly features = {} as Record<keyof FeatureToggles, HTMLInputElement>;

  constructor(events: ParamsPanelEvents) {
    const validate = () => this.validate();
    this.seed = el('input', { type: 'text', value: 'urbe', id: 'seed', autocomplete: 'off', spellcheck: 'false' });
    this.seed.addEventListener('input', validate);
    this.width = new RangeField({ id: 'width', label: 'Width (m)', min: 300, max: 5000, exactMin: 1, step: 100, value: 1000, unit: 'm', onInput: validate });
    this.depth = new RangeField({ id: 'depth', label: 'Depth (m)', min: 300, max: 5000, exactMin: 1, step: 100, value: 1000, unit: 'm', onInput: validate });
    this.irregularity = new RangeField({
      id: 'irregularity', label: 'Irregularity', min: 0, max: 1, exactMax: 1, step: 0.05, value: 0.35, onInput: validate,
      description: '0 keeps the street grid strict. 0.4 and above permits a radial downtown.',
    });
    this.districtMin = new RangeField({ id: 'district-min', label: 'Minimum districts', min: 1, max: 24, step: 1, value: 1, integer: true, onInput: validate });
    this.districtMax = new RangeField({ id: 'district-max', label: 'Maximum districts', min: 1, max: 24, step: 1, value: 3, integer: true, onInput: validate });
    this.maxFloors = new RangeField({ id: 'maxFloors', label: 'Global floor cap', min: 1, max: 120, step: 1, value: 40, integer: true, onInput: validate });
    this.hydrology = el('select', { id: 'hydrology', 'aria-label': 'Waterfront' }, [
      el('option', { value: 'none', text: 'None' }),
      el('option', { value: 'lagoon', text: 'Lagoon' }),
      el('option', { value: 'river', text: 'River' }),
      el('option', { value: 'sea-coast', text: 'Sea coast' }),
    ]);
    this.hydrology.addEventListener('change', validate);

    const featureFields = el('div', { class: 'feature-grid' });
    for (const key of Object.keys(FEATURE_LABELS) as (keyof FeatureToggles)[]) {
      const input = el('input', { type: 'checkbox', id: key });
      input.setAttribute('aria-label', FEATURE_LABELS[key]);
      input.checked = true;
      input.addEventListener('change', validate);
      this.features[key] = input;
      featureFields.append(toggleCard(FEATURE_LABELS[key], FEATURE_HELP[key], input));
    }

    const districtCaps = el('div', { class: 'district-cap-grid' });
    for (const kind of DISTRICTS) {
      const enabled = el('input', { type: 'checkbox', id: `cap-${kind}` });
      const value = el('input', { type: 'number', min: '1', step: '1', value: '40', id: `cap-${kind}-value`, disabled: '' });
      enabled.addEventListener('change', () => { value.disabled = !enabled.checked; validate(); });
      value.addEventListener('input', validate);
      this.districtCaps.set(kind, { enabled, value });
      districtCaps.append(el('div', { class: 'district-cap' }, [
        el('label', { for: `cap-${kind}` }, [enabled, kind]),
        el('label', { class: 'visually-hidden', for: `cap-${kind}-value`, text: `${kind} floor cap` }),
        value,
      ]));
    }

    const tierControls = el('div', { class: 'tier-grid' });
    for (const tier of TIERS) {
      const control = new RangeField({
        id: `tier-${tier}`, label: `${humanize(tier)} weight`, min: 0, max: 1, step: 0.05,
        value: DEFAULT_PARAMS.tierWeights?.[tier] ?? 0, onInput: validate,
      });
      this.tierWeights.set(tier, control);
      tierControls.append(control.root);
    }

    this.generateButton = el('button', { type: 'button', class: 'primary generate-button', text: 'Generate city', id: 'generate' });
    this.generateButton.addEventListener('click', () => { if (this.validate(true)) events.onGenerate(this.read()); });
    const random = el('button', { type: 'button', class: 'icon-button', text: 'Random seed', 'aria-label': 'Random seed' });
    random.addEventListener('click', () => { this.seed.value = makeSeed(); validate(); this.seed.focus(); });

    const exportButton = el('button', { type: 'button', text: 'Save parameters' });
    exportButton.addEventListener('click', () => events.onExport(this.read()));
    const importButton = el('button', { type: 'button', text: 'Open parameters' });
    const file = el('input', { type: 'file', accept: 'application/json,.json', id: 'import-params', class: 'file-input' });
    importButton.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      file.value = '';
      if (chosen) events.onImport(chosen);
    });

    const presets = el('div', { class: 'preset-row', role: 'group', 'aria-label': 'City presets' });
    for (const [key, preset] of Object.entries(PRESETS)) {
      const button = el('button', { type: 'button', class: 'preset-button', text: humanize(key) });
      button.addEventListener('click', () => this.setParams({ ...preset, seed: this.seed.value || 'urbe' }));
      presets.append(button);
    }
    const reset = el('button', { type: 'button', class: 'preset-button reset-button', text: 'Reset' });
    reset.addEventListener('click', () => this.setParams(DEFAULT_PARAMS));
    presets.append(reset);

    this.error = el('p', { class: 'form-error', role: 'alert', 'aria-live': 'polite' });
    this.status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
    this.form = el('fieldset', { class: 'params-form' }, [
      el('section', { class: 'creation-intro' }, [
        el('p', { class: 'eyebrow', text: 'Deterministic blueprint' }),
        el('h2', { text: 'Create a city' }),
        el('p', { text: 'Choose a preset or set exact dimensions. The same seed and settings reproduce the same city.' }),
      ]),
      presets,
      section('Identity', [
        el('div', { class: 'seed-row' }, [
          el('label', { class: 'seed-field', for: 'seed' }, [el('span', { text: 'Seed' }), this.seed]),
          random,
        ]),
      ], true),
      section('City shape', [
        this.width.root,
        this.depth.root,
        this.irregularity.root,
        el('label', { for: 'hydrology' }, [el('span', { text: 'Waterfront' }), this.hydrology]),
      ], true),
      section('Districts', [
        this.districtMin.root,
        this.districtMax.root,
        el('p', { class: 'section-note', text: 'Each district needs at least 90,000 m².' }),
      ], true),
      section('Building height', [
        this.maxFloors.root,
        el('p', { class: 'section-note', text: 'Optional district caps override the global limit.' }),
        districtCaps,
      ]),
      section('Wealth distribution', [
        el('p', { class: 'section-note', text: 'Relative weights are normalized during generation.' }),
        tierControls,
      ]),
      section('Networks and connections', [featureFields], true),
      this.error,
      this.generateButton,
      section('Parameter files', [
        el('p', { class: 'section-note', text: 'Save this complete setup or load a JSON parameter file.' }),
        el('div', { class: 'button-row' }, [exportButton, importButton]),
      ]),
      el('label', { class: 'visually-hidden', for: 'import-params' }, ['Parameter file', file]),
    ]);
    this.root = el('div', { class: 'params-panel' }, [this.form, this.status]);
    this.validate();
  }

  /** The full parameter set the form describes. */
  read(): AtlasParams {
    const features: FeatureToggles = {};
    for (const key of Object.keys(FEATURE_LABELS) as (keyof FeatureToggles)[]) {
      features[key] = this.features[key].checked;
    }
    const maxFloorsByDistrict: Partial<Record<DistrictKind, number>> = {};
    for (const [kind, control] of this.districtCaps) {
      if (control.enabled.checked) maxFloorsByDistrict[kind] = Number(control.value.value);
    }
    const tierWeights: Partial<Record<WealthTier, number>> = {};
    for (const [tier, control] of this.tierWeights) tierWeights[tier] = control.value;
    return {
      seed: this.seed.value.trim(),
      size: { width: this.width.value, depth: this.depth.value },
      irregularity: this.irregularity.value,
      districtCount: [this.districtMin.value, this.districtMax.value],
      maxFloors: this.maxFloors.value,
      ...(Object.keys(maxFloorsByDistrict).length > 0 ? { maxFloorsByDistrict } : {}),
      tierWeights,
      features,
      ...(this.hydrology.value === 'none' ? {} : { hydrology: { type: this.hydrology.value as HydrologyType } }),
    };
  }

  /** Fills the form from an imported parameter set. */
  setParams(params: AtlasParams): void {
    const seed = params.seed ?? DEFAULT_PARAMS.seed;
    const size = params.size ?? DEFAULT_PARAMS.size!;
    const districtCount = params.districtCount ?? DEFAULT_PARAMS.districtCount!;
    const weights = { ...DEFAULT_PARAMS.tierWeights, ...params.tierWeights };
    const features = { ...DEFAULT_PARAMS.features, ...params.features };
    this.seed.value = String(seed);
    this.width.value = size.width;
    this.depth.value = size.depth;
    this.irregularity.value = params.irregularity ?? DEFAULT_PARAMS.irregularity!;
    this.districtMin.value = districtCount[0];
    this.districtMax.value = districtCount[1];
    this.maxFloors.value = params.maxFloors ?? DEFAULT_PARAMS.maxFloors!;
    this.hydrology.value = params.hydrology?.type ?? 'none';
    for (const [kind, control] of this.districtCaps) {
      const cap = params.maxFloorsByDistrict?.[kind];
      control.enabled.checked = cap !== undefined;
      control.value.disabled = cap === undefined;
      control.value.value = String(cap ?? this.maxFloors.value);
    }
    for (const [tier, control] of this.tierWeights) control.value = weights[tier] ?? 0;
    for (const key of Object.keys(FEATURE_LABELS) as (keyof FeatureToggles)[]) {
      this.features[key].checked = features[key] ?? true;
    }
    this.validate();
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  /** Locks the form while a city generates. */
  setBusy(busy: boolean): void {
    this.form.disabled = busy;
  }

  private validate(focus = false): boolean {
    const issue = this.firstIssue();
    this.error.textContent = issue?.message ?? '';
    this.generateButton.disabled = issue !== null;
    this.root.classList.toggle('has-error', issue !== null);
    if (focus && issue) issue.element.focus();
    return issue === null;
  }

  private firstIssue(): { element: HTMLElement; message: string } | null {
    if (!this.seed.value.trim()) return { element: this.seed, message: 'Enter a seed.' };
    if (!Number.isFinite(this.width.value) || this.width.value <= 0) return { element: this.width.number, message: 'Width must be greater than zero.' };
    if (!Number.isFinite(this.depth.value) || this.depth.value <= 0) return { element: this.depth.number, message: 'Depth must be greater than zero.' };
    if (!Number.isFinite(this.irregularity.value) || this.irregularity.value < 0 || this.irregularity.value > 1) {
      return { element: this.irregularity.number, message: 'Irregularity must be between 0 and 1.' };
    }
    if (!Number.isFinite(this.maxFloors.value) || this.maxFloors.value < 1) return { element: this.maxFloors.number, message: 'Global floor cap must be at least 1.' };
    if (!Number.isFinite(this.districtMin.value) || this.districtMin.value < 1) return { element: this.districtMin.number, message: 'Minimum districts must be at least 1.' };
    if (!Number.isFinite(this.districtMax.value) || this.districtMax.value < 1) return { element: this.districtMax.number, message: 'Maximum districts must be at least 1.' };
    if (!Number.isInteger(this.maxFloors.value) || !Number.isInteger(this.districtMin.value) || !Number.isInteger(this.districtMax.value)) {
      return { element: this.districtMin.number, message: 'Floor and district counts must be whole numbers.' };
    }
    if (this.districtMin.value > this.districtMax.value) {
      return { element: this.districtMax.number, message: 'Maximum districts must be at least the minimum.' };
    }
    if (this.width.value * this.depth.value < this.districtMin.value * MIN_DISTRICT_AREA) {
      return { element: this.districtMin.number, message: 'The city is too small for the requested minimum district count.' };
    }
    for (const [kind, control] of this.districtCaps) {
      const value = Number(control.value.value);
      if (control.enabled.checked && (!Number.isInteger(value) || value < 1)) {
        return { element: control.value, message: `${humanize(kind)} floor cap must be an integer of at least 1.` };
      }
    }
    const weightSum = [...this.tierWeights.values()].reduce((sum, field) => sum + field.value, 0);
    if ([...this.tierWeights.values()].some((field) => !Number.isFinite(field.value) || field.value < 0)) {
      return { element: this.tierWeights.get('poor')!.number, message: 'Wealth weights must be zero or greater.' };
    }
    if (weightSum <= 0) return { element: this.tierWeights.get('poor')!.number, message: 'At least one wealth weight must be above zero.' };
    return null;
  }
}

function section(title: string, children: HTMLElement[], open = false): HTMLElement {
  const details = el('details', { class: 'config-section' }, [
    el('summary', {}, [el('span', { text: title }), el('span', { class: 'section-marker', 'aria-hidden': 'true', text: '+' })]),
    el('div', { class: 'section-body' }, children),
  ]);
  details.open = open;
  return details;
}

function toggleCard(label: string, description: string, input: HTMLInputElement): HTMLElement {
  return el('label', { class: 'toggle-card', for: input.id }, [
    input,
    el('span', { class: 'toggle-copy' }, [
      el('strong', { text: label }),
      el('small', { text: description }),
    ]),
  ]);
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function makeSeed(): string {
  const values = new Uint32Array(2);
  globalThis.crypto.getRandomValues(values);
  return `city-${values[0]!.toString(36)}${values[1]!.toString(36)}`;
}
