/** Generation parameters form; emits AtlasParams on Generate. */
import type { AtlasParams } from '../../../schema/params';
import { el } from '../components/dom';

export class ParamsPanel {
  readonly root: HTMLElement;
  private readonly status: HTMLElement;

  constructor(onGenerate: (params: AtlasParams) => void) {
    const seed = el('input', { type: 'text', value: 'urbe', id: 'seed' });
    const size = el('input', { type: 'number', value: '3000', min: '600', step: '100', id: 'size' });
    const irregularity = el('input', { type: 'range', value: '0.6', min: '0', max: '1', step: '0.05', id: 'irregularity' });
    const maxFloors = el('input', { type: 'number', value: '40', min: '1', id: 'maxFloors' });
    const highways = el('input', { type: 'checkbox', id: 'highways' });
    const trains = el('input', { type: 'checkbox', id: 'trains' });
    const subways = el('input', { type: 'checkbox', id: 'subways' });
    highways.checked = trains.checked = subways.checked = true;

    const generate = el('button', { text: 'Generate', id: 'generate' });
    this.status = el('p', { class: 'status', text: '' });

    generate.addEventListener('click', () => {
      onGenerate({
        seed: seed.value || 'urbe',
        size: { width: Number(size.value), depth: Number(size.value) },
        irregularity: Number(irregularity.value),
        maxFloors: Number(maxFloors.value),
        features: { highways: highways.checked, trains: trains.checked, subways: subways.checked },
      });
    });

    this.root = el('div', { class: 'params-panel' }, [
      el('h3', { text: 'atlas' }),
      field('Seed', seed),
      field('Size (m)', size),
      field('Irregularity', irregularity),
      field('Max floors', maxFloors),
      field('Highways', highways),
      field('Trains', trains),
      field('Subways', subways),
      generate,
      this.status,
    ]);
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }
}

function field(label: string, input: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, [label, input]);
}
