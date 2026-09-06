/** Switches the two full workspace views. */
import { el } from '../components/dom';

export type WorkspaceName = 'creation' | 'visualization';

export class WorkspaceNav {
  readonly root: HTMLElement;
  private readonly buttons: Record<WorkspaceName, HTMLButtonElement>;
  private active: WorkspaceName = 'creation';

  constructor(private readonly onChange: (name: WorkspaceName) => void) {
    this.buttons = {
      creation: el('button', { type: 'button', class: 'workspace-nav-button active', text: 'Create' }) as HTMLButtonElement,
      visualization: el('button', { type: 'button', class: 'workspace-nav-button', text: 'View' }) as HTMLButtonElement,
    };
    this.buttons.creation.setAttribute('aria-pressed', 'true');
    this.buttons.visualization.setAttribute('aria-pressed', 'false');
    this.buttons.creation.addEventListener('click', () => this.show('creation'));
    this.buttons.visualization.addEventListener('click', () => this.show('visualization'));
    this.root = el('nav', { class: 'workspace-nav', 'aria-label': 'Workspace' }, [
      el('div', { class: 'app-heading' }, [
        el('span', { class: 'app-mark', 'aria-hidden': 'true', text: 'A' }),
        el('div', {}, [el('strong', { text: 'Atlas' }), el('span', { text: 'City blueprint generator' })]),
      ]),
      el('div', { class: 'workspace-nav-tabs' }, [this.buttons.creation, this.buttons.visualization]),
    ]);
  }

  show(name: WorkspaceName): void {
    if (this.active === name) {
      this.onChange(name);
      return;
    }
    this.active = name;
    for (const key of ['creation', 'visualization'] as WorkspaceName[]) {
      this.buttons[key].classList.toggle('active', key === name);
      this.buttons[key].setAttribute('aria-pressed', String(key === name));
    }
    this.onChange(name);
  }

  get current(): WorkspaceName {
    return this.active;
  }
}
