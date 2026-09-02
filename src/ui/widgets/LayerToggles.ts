/** Every visualization switch, grouped, each group with its own all-on/all-off row. */
import { FILTER_GROUPS, defaultFilters, filterLabel, type FilterKey, type Filters } from '../views/filters';
import { el } from '../components/dom';

export class LayerToggles {
  readonly root: HTMLElement;
  private readonly filters: Filters = defaultFilters();
  private readonly inputs = new Map<FilterKey, HTMLInputElement>();

  constructor(onChange: (filters: Filters) => void) {
    this.root = el('div', { class: 'layer-toggles' });
    for (const group of FILTER_GROUPS) {
      const master = el('input', { type: 'checkbox', id: `layer-group-${group.title}` });
      master.checked = group.keys.every((k) => this.filters[k]);
      master.addEventListener('change', () => {
        for (const key of group.keys) {
          this.filters[key] = master.checked;
          this.inputs.get(key)!.checked = master.checked;
        }
        onChange({ ...this.filters });
      });
      const rows = el('div', { class: 'layer-group-rows' });
      for (const key of group.keys) {
        const input = el('input', { type: 'checkbox', id: `layer-${key}` });
        input.checked = this.filters[key];
        input.addEventListener('change', () => {
          this.filters[key] = input.checked;
          master.checked = group.keys.every((k) => this.filters[k]);
          onChange({ ...this.filters });
        });
        this.inputs.set(key, input);
        rows.append(el('label', { for: `layer-${key}` }, [input, filterLabel(key)]));
      }
      const single = group.keys.length === 1;
      this.root.append(
        el('div', { class: 'layer-group' }, [
          el('label', { class: 'layer-group-title', for: `layer-group-${group.title}` }, [master, group.title]),
          ...(single ? [] : [rows]),
        ]),
      );
      if (single) this.inputs.get(group.keys[0]!)!.remove();
      if (single) {
        // one switch groups are their own master
        master.addEventListener('change', () => { this.filters[group.keys[0]!] = master.checked; });
      }
    }
  }
}
