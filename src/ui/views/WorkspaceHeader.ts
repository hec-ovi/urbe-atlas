import { el } from '../components/dom';

/** Brand link returns to the creation page. */
export class WorkspaceHeader {
  readonly root: HTMLElement;
  readonly message = el('p', { class: 'workspace-message', role: 'status', 'aria-live': 'polite' });

  constructor(onHome: () => void) {
    const home = el('a', { class: 'app-heading', href: window.location.pathname, 'aria-label': 'Atlas home' }, [
      el('span', { class: 'app-mark', 'aria-hidden': 'true', text: 'A' }),
      el('div', {}, [el('strong', { text: 'Atlas' }), el('span', { text: 'City blueprint generator' })]),
    ]);
    home.addEventListener('click', event => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onHome();
    });
    this.root = el('header', { class: 'workspace-header' }, [home, this.message]);
  }
}
