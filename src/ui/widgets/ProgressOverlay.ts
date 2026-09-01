/** Blocking cover over the map while a city generates. */
import { el } from '../components/dom';

export class ProgressOverlay {
  readonly root: HTMLElement;
  private readonly label: HTMLElement;

  constructor() {
    this.label = el('p', { class: 'progress-label', text: '' });
    this.root = el('div', { class: 'progress-overlay', role: 'status', 'aria-live': 'polite' }, [
      el('div', { class: 'progress-box' }, [this.label, el('div', { class: 'progress-bar' })]),
    ]);
    this.root.hidden = true;
  }

  show(text: string): void {
    this.label.textContent = text;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
