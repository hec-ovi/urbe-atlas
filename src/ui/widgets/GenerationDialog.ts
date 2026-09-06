import type { GenerationProgress } from '../../../schema/progress';
import { el } from '../components/dom';

/** Modal presentation of server stage counts; cancellation is supplied by the controller. */
export class GenerationDialog {
  readonly root = el('dialog', { class: 'generation-dialog', 'aria-labelledby': 'generation-title', 'aria-describedby': 'generation-phase' });
  private readonly phase = el('p', { id: 'generation-phase', role: 'status', text: 'Submitting city' });
  private readonly bar = el('progress', { max: '13', value: '0', 'aria-label': 'Completed generation stages' });
  private readonly count = el('span', { class: 'progress-count', text: '0 / 13 stages' });
  private readonly error = el('p', { class: 'form-error', role: 'alert' });
  private readonly cancelButton = el('button', { type: 'button', class: 'danger-button', text: 'Cancel' });
  private previousFocus: HTMLElement | null = null;

  constructor(onCancel: () => void) {
    this.root.append(el('h2', { id: 'generation-title', text: 'Generating city' }), this.phase, this.bar,
      el('div', { class: 'progress-footer' }, [this.count, this.cancelButton]), this.error);
    this.cancelButton.addEventListener('click', onCancel);
    this.root.addEventListener('cancel', event => { event.preventDefault(); if (!this.cancelButton.disabled) onCancel(); });
  }

  show(): void {
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.update({ completed: 0, total: 13, phase: 'Submitting city' });
    this.error.textContent = '';
    this.setCancelling(false);
    this.root.showModal();
    this.cancelButton.focus();
  }

  update(progress: GenerationProgress): void {
    this.bar.max = progress.total;
    this.bar.value = progress.completed;
    this.count.textContent = `${progress.completed} / ${progress.total} stages`;
    this.phase.textContent = progress.phase;
  }

  report(message: string): void { this.error.textContent = message; }

  setCancelling(value: boolean): void {
    this.cancelButton.disabled = value;
    this.cancelButton.textContent = value ? 'Stopping…' : 'Cancel';
  }

  close(): void {
    this.root.close();
    if (this.previousFocus?.isConnected && !this.previousFocus.closest('[hidden]')) this.previousFocus.focus();
  }
}
