/** Every visualization switch, grouped, each group with its own all-on/all-off row. */
import type { LayerGroup } from '../../cities/forms/schema';
import { FILTER_GROUPS, defaultFilters, filterLabel, type FilterKey, type Filters } from '../views/filters';
import { DIAGNOSTIC_COLORS, DISTRICT_OUTLINE, FURNITURE_COLORS, GROUND_COLORS, HYDROLOGY_COLORS, TRANSIT_COLORS, parcelColor, streetColor } from '../components/colors';
import { el } from '../components/dom';

interface GroupView {
  id: string;
  title: string;
  description: string;
  open?: boolean;
  keys: FilterKey[];
  label: (key: FilterKey) => string;
  color: (key: FilterKey) => string;
}

export class LayerToggles {
  readonly root: HTMLElement;
  private readonly filters: Filters;
  private readonly groups: GroupView[];
  private readonly inputs = new Map<FilterKey, HTMLInputElement>();
  private readonly masters = new Map<string, HTMLInputElement>();
  private readonly interiorsOnly: HTMLInputElement;
  private readonly interiorStatus: HTMLElement;

  constructor(
    onChange: (filters: Filters) => void,
    schemaGroups?: LayerGroup[],
    constraint?: { path: string; label: string },
  ) {
    this.groups = schemaGroups?.map(schemaGroup) ?? FILTER_GROUPS.map(legacyGroup);
    this.filters = schemaGroups ? schemaFilters(schemaGroups) : defaultFilters();
    this.root = el('div', { class: 'layer-toggles' });
    const notify = () => { this.syncMasters(); onChange({ ...this.filters }); };
    const resetConstraint = () => {
      this.filters.interiorsOnly = false;
      this.interiorsOnly.checked = false;
    };
    const actions = el('div', { class: 'layer-actions' }, [
      action('Show all', () => { for (const key of this.inputs.keys()) this.setKey(key, true); resetConstraint(); notify(); }),
      action('Hide all', () => { for (const key of this.inputs.keys()) this.setKey(key, false); resetConstraint(); notify(); }),
      action('Defaults', () => {
        const defaults = schemaGroups ? schemaFilters(schemaGroups) : defaultFilters();
        for (const key of this.inputs.keys()) this.setKey(key, defaults[key]);
        resetConstraint();
        notify();
      }),
    ]);
    this.interiorsOnly = el('input', { type: 'checkbox', id: 'layer-interiors-only' });
    this.interiorsOnly.setAttribute('aria-label', constraint?.label ?? 'Only buildings with interiors');
    this.interiorsOnly.checked = false;
    this.interiorsOnly.addEventListener('change', () => {
      this.filters.interiorsOnly = this.interiorsOnly.checked;
      notify();
    });
    this.interiorStatus = el('small', { text: 'Assembled interior list unavailable' });
    const interiorFilter = el('section', { class: 'layer-constraint' }, [
      el('label', { for: 'layer-interiors-only' }, [
        this.interiorsOnly,
        el('span', {}, [el('strong', { text: constraint?.label ?? 'Only buildings with interiors' }), this.interiorStatus]),
      ]),
    ]);
    this.root.append(actions, interiorFilter);
    for (const group of this.groups) {
      const master = el('input', { type: 'checkbox', id: `layer-group-${group.id}`, 'aria-label': group.title });
      master.checked = group.keys.every((k) => this.filters[k]);
      master.addEventListener('change', () => {
        for (const key of group.keys) this.setKey(key, master.checked);
        notify();
      });
      this.masters.set(group.id, master);
      const rows = el('div', { class: 'layer-group-rows' });
      for (const key of group.keys) {
        const input = el('input', { type: 'checkbox', id: `layer-${key}` });
        input.setAttribute('aria-label', group.label(key));
        input.checked = this.filters[key];
        input.addEventListener('change', () => {
          this.filters[key] = input.checked;
          notify();
        });
        this.inputs.set(key, input);
        const isolate = action(`Only ${group.label(key)}`, () => {
          for (const candidate of this.inputs.keys()) this.setKey(candidate, candidate === key);
          resetConstraint();
          notify();
        });
        isolate.className = 'layer-item-only';
        rows.append(el('div', { class: 'layer-row' }, [
          el('label', { for: `layer-${key}` }, [
            input,
            el('span', { class: 'layer-swatch', style: `background:${group.color(key)}`, 'aria-hidden': 'true' }),
            el('span', { text: group.label(key) }),
          ]),
          isolate,
        ]));
      }
      const collapse = action(group.open ? 'Collapse' : 'Expand', () => {
        const hidden = rows.hidden;
        rows.hidden = !hidden;
        collapse.textContent = hidden ? 'Collapse' : 'Expand';
        collapse.setAttribute('aria-expanded', String(hidden));
      });
      collapse.className = 'layer-collapse';
      collapse.setAttribute('aria-expanded', String(Boolean(group.open)));
      rows.hidden = !group.open;
      const only = action('Only', () => {
        for (const key of this.inputs.keys()) this.setKey(key, group.keys.includes(key));
        resetConstraint();
        notify();
      });
      only.className = 'layer-only';
      this.root.append(
        el('section', { class: 'layer-group' }, [
          el('div', { class: 'layer-group-header' }, [
            el('label', { class: 'layer-group-title', for: `layer-group-${group.id}` }, [
              master,
              el('span', {}, [el('strong', { text: group.title }), el('small', { text: group.description })]),
            ]),
            only,
            collapse,
          ]),
          rows,
        ]),
      );
    }
    this.syncMasters();
  }

  /** Reports the exact interior count loaded from the assembled world manifest. */
  setInteriorCount(count: number | null): void {
    this.interiorStatus.textContent = count === null
      ? 'Assembled interior list unavailable'
      : `${count} ${count === 1 ? 'building has' : 'buildings have'} interiors`;
  }

  private setKey(key: FilterKey, visible: boolean): void {
    this.filters[key] = visible;
    this.inputs.get(key)!.checked = visible;
  }

  private syncMasters(): void {
    for (const group of this.groups) {
      const master = this.masters.get(group.id)!;
      master.checked = group.keys.every((key) => this.filters[key]);
      master.indeterminate = !master.checked && group.keys.some((key) => this.filters[key]);
    }
  }
}

function schemaGroup(group: LayerGroup): GroupView {
  const labels = new Map(group.items.map((item) => [item.key, item.label]));
  const colors = new Map(group.items.map((item) => [item.key, item.swatch]));
  return {
    id: group.id, title: group.title, description: group.description, open: group.open,
    keys: group.items.map((item) => item.key as FilterKey),
    label: (key) => labels.get(key) ?? filterLabel(key),
    color: (key) => colors.get(key) ?? filterColor(key),
  };
}

function legacyGroup(group: (typeof FILTER_GROUPS)[number]): GroupView {
  return { ...group, label: filterLabel, color: filterColor };
}

function schemaFilters(groups: LayerGroup[]): Filters {
  const out = {} as Filters;
  for (const group of groups) for (const item of group.items) out[item.key as FilterKey] = item.default;
  out.interiorsOnly = false;
  return out;
}

function action(label: string, handler: () => void): HTMLButtonElement {
  const button = el('button', { type: 'button', text: label }) as HTMLButtonElement;
  button.addEventListener('click', handler);
  return button;
}

function filterColor(key: FilterKey): string {
  const [, name] = key.split('.');
  if (key.startsWith('ground.')) return GROUND_COLORS[name as keyof typeof GROUND_COLORS];
  if (key.startsWith('zone.')) return parcelColor(name as Parameters<typeof parcelColor>[0], 'mid');
  if (key.startsWith('street.')) return streetColor(name as Parameters<typeof streetColor>[0]);
  if (key.startsWith('transit.')) return TRANSIT_COLORS.subway;
  if (key.startsWith('furniture.')) return FURNITURE_COLORS[name as keyof typeof FURNITURE_COLORS];
  if (key === 'hydrology.water') return HYDROLOGY_COLORS['water.river'];
  if (key === 'hydrology.shoreline') return HYDROLOGY_COLORS.shoreline;
  if (key.startsWith('diagnostic.')) return DIAGNOSTIC_COLORS[name as keyof typeof DIAGNOSTIC_COLORS];
  return DISTRICT_OUTLINE;
}
