/** Flat map or the city in three dimensions: one of two radio buttons. */
import { el } from '../components/dom';

export type ViewMode = '2d' | '3d';

export class ViewModeSwitch {
  readonly root: HTMLElement;
  private readonly inputs = new Map<ViewMode, HTMLInputElement>();

  constructor(onChange: (mode: ViewMode) => void, initial: ViewMode = '2d') {
    this.root = el('div', { class: 'view-mode' });
    for (const [mode, label] of [['2d', 'Flat map'], ['3d', 'City in 3D']] as [ViewMode, string][]) {
      const input = el('input', { type: 'radio', name: 'view-mode', id: `view-${mode}`, value: mode });
      input.checked = mode === initial;
      input.addEventListener('change', () => { if (input.checked) onChange(mode); });
      this.inputs.set(mode, input);
      this.root.append(el('label', { for: `view-${mode}` }, [input, label]));
    }
  }

  setMode(mode: ViewMode): void {
    for (const [key, input] of this.inputs) input.checked = key === mode;
  }
}
