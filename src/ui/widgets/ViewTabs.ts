/** Two conventional sidebar tabs: creation and visualization. */
import { el } from '../components/dom';

export type TabName = 'creation' | 'visualization';

export class ViewTabs {
  readonly root: HTMLElement;
  private readonly panes: Record<TabName, HTMLElement>;
  private readonly buttons: Record<TabName, HTMLButtonElement>;
  private active: TabName = 'creation';

  constructor(creation: HTMLElement[], visualization: HTMLElement[], private readonly onChange?: (active: TabName | null) => void) {
    this.panes = {
      creation: el('div', { class: 'tab-pane' }, creation),
      visualization: el('div', { class: 'tab-pane' }, visualization),
    };
    this.buttons = {
      creation: el('button', { class: 'tab-button', type: 'button' }, ['Creation']) as HTMLButtonElement,
      visualization: el('button', { class: 'tab-button', type: 'button' }, ['Visualization']) as HTMLButtonElement,
    };
    for (const name of ['creation', 'visualization'] as TabName[]) {
      this.buttons[name].addEventListener('click', () => this.show(name));
    }
    this.root = el('div', { class: 'view-tabs' }, [
      el('div', { class: 'tab-bar' }, [this.buttons.creation, this.buttons.visualization]),
      this.panes.creation,
      this.panes.visualization,
    ]);
    this.show('creation');
  }

  /** Shows one tab and keeps the control surface present. */
  show(name: TabName): void {
    this.active = name;
    for (const key of ['creation', 'visualization'] as TabName[]) {
      this.panes[key].hidden = key !== name;
      this.buttons[key].classList.toggle('active', key === name);
      this.buttons[key].setAttribute('aria-pressed', String(key === name));
    }
    this.onChange?.(name);
  }

  get current(): TabName | null {
    return this.active;
  }
}
