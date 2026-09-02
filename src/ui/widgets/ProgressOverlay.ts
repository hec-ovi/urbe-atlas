/** Blocking, staged progress feedback while the main thread builds a city. */
import { el } from '../components/dom';

export type GenerationStage = 'preparing' | 'generating' | 'rendering' | 'ready' | 'error';

const STAGES: { key: Exclude<GenerationStage, 'error'>; label: string }[] = [
  { key: 'preparing', label: 'Preparing' },
  { key: 'generating', label: 'Generating' },
  { key: 'rendering', label: 'Rendering' },
  { key: 'ready', label: 'Ready' },
];

export class ProgressOverlay {
  readonly root: HTMLElement;
  private readonly label: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly steps = new Map<string, HTMLElement>();

  constructor() {
    this.label = el('p', { class: 'progress-label', text: '' });
    this.detail = el('p', { class: 'progress-detail', text: '' });
    const list = el('ol', { class: 'progress-steps', 'aria-label': 'Generation progress' });
    for (const stage of STAGES) {
      const item = el('li', { 'data-stage': stage.key, text: stage.label });
      this.steps.set(stage.key, item);
      list.append(item);
    }
    this.root = el('div', { class: 'progress-overlay', role: 'status', 'aria-live': 'polite' }, [
      el('div', { class: 'progress-box' }, [
        el('div', { class: 'progress-spinner', 'aria-hidden': 'true' }),
        this.label,
        this.detail,
        list,
        el('div', { class: 'progress-bar' }),
      ]),
    ]);
    this.root.hidden = true;
  }

  show(stage: GenerationStage, detail = ''): void {
    this.root.hidden = false;
    this.update(stage, detail);
  }

  update(stage: GenerationStage, detail = ''): void {
    this.root.dataset.stage = stage;
    this.label.textContent = stage === 'error' ? 'Generation failed' : STAGES.find((item) => item.key === stage)?.label ?? stage;
    this.detail.textContent = detail;
    const activeIndex = STAGES.findIndex((item) => item.key === stage);
    for (let index = 0; index < STAGES.length; index++) {
      const item = this.steps.get(STAGES[index]!.key)!;
      item.classList.toggle('active', index === activeIndex);
      item.classList.toggle('complete', stage === 'ready' || (activeIndex >= 0 && index < activeIndex));
    }
  }

  hide(): void {
    this.root.hidden = true;
  }
}
