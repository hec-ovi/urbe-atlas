/** Stack of dismissible messages over the map: failures, and what a click did. */
import { el } from '../components/dom';

/** Oldest messages drop off once the stack is this deep. */
const KEEP = 5;

export class Notifications {
  readonly root: HTMLElement;

  constructor() {
    this.root = el('div', { class: 'notifications', role: 'log', 'aria-live': 'polite' });
  }

  error(message: string): void {
    this.add('error', message);
  }

  info(message: string, link?: { href: string; label: string }): void {
    this.add('info', message, link);
  }

  private add(kind: 'error' | 'info', message: string, link?: { href: string; label: string }): void {
    const item = el('div', { class: `notification notification-${kind}` }, [
      el('span', { class: 'notification-text', text: message }),
    ]);
    if (link) {
      item.append(el('a', { class: 'notification-link', href: link.href, target: '_blank', rel: 'noopener', text: link.label }));
    }
    const dismiss = el('button', { type: 'button', class: 'notification-dismiss', 'aria-label': 'Dismiss', text: '×' });
    dismiss.addEventListener('click', () => {
      item.classList.add('dismissing');
      setTimeout(() => item.remove(), 150);
    });
    item.append(dismiss);
    this.root.prepend(item);
    while (this.root.children.length > KEEP) this.root.lastElementChild?.remove();
  }
}
