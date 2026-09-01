/**
 * Generation parameters form. Emits the full AtlasParams set on Generate and
 * on Export; Import hands back the chosen file. Fields the form does not show
 * (district count, per-district floor caps, tier weights) ride along from an
 * imported file untouched.
 */
import type { AtlasParams, FeatureToggles } from '../../../schema/params';
import { el } from '../components/dom';

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

export class ParamsPanel {
  readonly root: HTMLElement;
  private readonly form: HTMLFieldSetElement;
  private readonly status: HTMLElement;
  private readonly seed: HTMLInputElement;
  private readonly width: HTMLInputElement;
  private readonly depth: HTMLInputElement;
  private readonly irregularity: HTMLInputElement;
  private readonly maxFloors: HTMLInputElement;
  private readonly features = {} as Record<keyof FeatureToggles, HTMLInputElement>;
  /** Imported fields with no form control of their own. */
  private carried: Partial<AtlasParams> = {};

  constructor(events: ParamsPanelEvents) {
    this.seed = el('input', { type: 'text', value: 'urbe', id: 'seed' });
    this.width = el('input', { type: 'number', value: '3000', min: '300', step: '100', id: 'width' });
    this.depth = el('input', { type: 'number', value: '3000', min: '300', step: '100', id: 'depth' });
    this.irregularity = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '0.6', id: 'irregularity' });
    this.maxFloors = el('input', { type: 'number', value: '40', min: '1', id: 'maxFloors' });

    const featureFields: HTMLElement[] = [];
    for (const key of Object.keys(FEATURE_LABELS) as (keyof FeatureToggles)[]) {
      const input = el('input', { type: 'checkbox', id: key });
      input.checked = true;
      this.features[key] = input;
      featureFields.push(field(FEATURE_LABELS[key], input));
    }

    const generate = el('button', { type: 'button', class: 'primary', text: 'Generate', id: 'generate' });
    generate.addEventListener('click', () => events.onGenerate(this.read()));
    const exportButton = el('button', { type: 'button', text: 'Export params' });
    exportButton.addEventListener('click', () => events.onExport(this.read()));
    const importButton = el('button', { type: 'button', text: 'Import params' });
    const file = el('input', { type: 'file', accept: 'application/json,.json', id: 'import-params', class: 'file-input' });
    importButton.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      file.value = '';
      if (chosen) events.onImport(chosen);
    });

    this.status = el('p', { class: 'status', text: '' });
    this.form = el('fieldset', { class: 'params-form' }, [
      field('Seed', this.seed),
      field('Width (m)', this.width),
      field('Depth (m)', this.depth),
      field('Irregularity', this.irregularity),
      field('Max floors', this.maxFloors),
      ...featureFields,
      generate,
      el('div', { class: 'button-row' }, [exportButton, importButton]),
      el('label', { class: 'visually-hidden', for: 'import-params' }, ['Parameter file', file]),
    ]);
    this.root = el('div', { class: 'params-panel' }, [el('h3', { text: 'atlas' }), this.form, this.status]);
  }

  /** The full parameter set the form describes. */
  read(): AtlasParams {
    const features: FeatureToggles = {};
    for (const key of Object.keys(FEATURE_LABELS) as (keyof FeatureToggles)[]) {
      features[key] = this.features[key].checked;
    }
    return {
      ...this.carried,
      seed: this.seed.value || 'urbe',
      size: { width: Number(this.width.value), depth: Number(this.depth.value) },
      irregularity: Number(this.irregularity.value),
      maxFloors: Number(this.maxFloors.value),
      features,
    };
  }

  /** Fills the form from an imported parameter set. */
  setParams(params: AtlasParams): void {
    this.seed.value = String(params.seed);
    if (params.size) {
      this.width.value = String(params.size.width);
      this.depth.value = String(params.size.depth);
    }
    if (params.irregularity !== undefined) this.irregularity.value = String(params.irregularity);
    if (params.maxFloors !== undefined) this.maxFloors.value = String(params.maxFloors);
    for (const key of Object.keys(FEATURE_LABELS) as (keyof FeatureToggles)[]) {
      this.features[key].checked = params.features?.[key] ?? true;
    }
    this.carried = {
      ...(params.districtCount !== undefined ? { districtCount: params.districtCount } : {}),
      ...(params.maxFloorsByDistrict !== undefined ? { maxFloorsByDistrict: params.maxFloorsByDistrict } : {}),
      ...(params.tierWeights !== undefined ? { tierWeights: params.tierWeights } : {}),
    };
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  /** Locks the form while a city generates. */
  setBusy(busy: boolean): void {
    this.form.disabled = busy;
  }
}

function field(label: string, input: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, [label, input]);
}
