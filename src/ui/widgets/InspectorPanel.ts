/** Persistent details for the feature selected from the map. */
import type { Parcel, Polygon, Polyline } from '../../../schema/blueprint';
import type { MapHit } from '../views/MapView';
import { el } from '../components/dom';

export class InspectorPanel {
  readonly root: HTMLElement;
  private readonly content: HTMLElement;
  private readonly clear: HTMLButtonElement;
  private pinned: MapHit | null = null;

  constructor(
    private readonly onOpenParcel: (parcel: Parcel) => void,
    private readonly onClear?: () => void,
  ) {
    this.content = el('div', { class: 'inspector-content' });
    this.clear = el('button', { type: 'button', class: 'inspector-clear', text: 'Clear selection' }) as HTMLButtonElement;
    this.clear.hidden = true;
    this.clear.addEventListener('click', () => {
      this.pinned = null;
      this.clear.hidden = true;
      this.render(null, false);
      this.onClear?.();
    });
    this.root = el('section', { class: 'inspector', 'aria-label': 'Map inspector' }, [
      el('div', { class: 'panel-title' }, [
        el('div', {}, [el('p', { class: 'eyebrow', text: 'Selection' }), el('h3', { text: 'Inspector' })]),
        this.clear,
      ]),
      this.content,
    ]);
    this.render(null, false);
  }

  preview(hit: MapHit | null): void {
    if (!this.pinned) this.render(hit, false);
  }

  select(hit: MapHit): void {
    this.pinned = hit;
    this.clear.hidden = false;
    this.render(hit, true);
  }

  private render(hit: MapHit | null, pinned: boolean): void {
    this.content.replaceChildren();
    if (!hit) {
      this.content.append(el('p', { class: 'inspector-empty', text: 'Hover to preview. Right-click a feature to keep its measurements here.' }));
      return;
    }
    const state = el('span', { class: `inspection-state ${pinned ? 'pinned' : ''}`, text: pinned ? 'Selected' : 'Hover' });
    if (hit.kind === 'parcel') {
      const parcel = hit.parcel;
      this.content.append(
        el('div', { class: 'inspector-heading' }, [state, el('strong', { text: `${parcel.id} · ${humanize(parcel.type)}` })]),
        facts([
          ['Tier', humanize(parcel.tier)],
          ['District', parcel.districtId],
          ['Block', parcel.blockId],
          ['Lot area', `${area(parcel.lot).toFixed(1)} m²`],
          ['Footprint', `${area(parcel.footprint).toFixed(1)} m²`],
          ['Floors', `${parcel.envelope.minFloors} to ${parcel.envelope.maxFloors}`],
          ['Height cap', `${parcel.envelope.maxHeight.toFixed(1)} m`],
          ['Access edge', parcel.access.edgeId],
        ]),
      );
      if (pinned) {
        const open = el('button', { type: 'button', class: 'inspector-open', text: 'Open building view' });
        open.addEventListener('click', () => this.onOpenParcel(parcel));
        this.content.append(open);
      }
      return;
    }
    if (hit.kind === 'station') {
      const station = hit.station;
      const paths = station.accessPaths.reduce((sum, path) => sum + path.segments.length, 0);
      this.content.append(
        el('div', { class: 'inspector-heading' }, [state, el('strong', { text: `${station.id} · ${humanize(hit.mode)} station` })]),
        facts([
          ['Level', `${station.level.toFixed(1)} m`],
          ['Platform', `${area(station.platform).toFixed(1)} m²`],
          ['Station box', `${station.box.bottom.toFixed(1)} to ${station.box.top.toFixed(1)} m`],
          ['Entrances', String(station.entrances.length)],
          ['Shafts', String(station.shafts.length)],
          ['Access routes', `${station.accessPaths.length} (${paths} legs)`],
        ]),
      );
      return;
    }
    const edge = hit.edge;
    const profile = edge.elevationProfile.map((point) => `${point.distance.toFixed(0)} m: ${point.level.toFixed(1)} m`).join(' / ');
    const rows: [string, string][] = [
      ['Class', humanize(edge.class)],
      ['Length', `${length(edge.path).toFixed(1)} m`],
      ['Carriageway', `${edge.width.toFixed(1)} m`],
      ['Sidewalks', `${edge.sidewalk.left.toFixed(1)} / ${edge.sidewalk.right.toFixed(1)} m`],
      ['Maximum level', `${edge.level.toFixed(1)} m`],
      ['Elevation profile', profile],
    ];
    if (hit.structure) {
      rows.push(
        ['Deck width', `${hit.structure.width.toFixed(1)} m`],
        ['Deck thickness', `${hit.structure.deckThickness.toFixed(1)} m`],
        ['Ramps', `${hit.structure.ramps.start.toFixed(1)} / ${hit.structure.ramps.end.toFixed(1)} m`],
        ['Supports', String(hit.structure.supports.length)],
      );
    }
    this.content.append(
      el('div', { class: 'inspector-heading' }, [state, el('strong', { text: `${edge.id} · ${humanize(edge.class)}` })]),
      facts(rows),
    );
  }
}

function facts(rows: [string, string][]): HTMLElement {
  const list = el('dl', { class: 'fact-grid' });
  for (const [label, value] of rows) list.append(el('dt', { text: label }), el('dd', { text: value }));
  return list;
}

function area(polygon: Polygon): number {
  let sum = 0;
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(sum) / 2;
}

function length(path: Polyline): number {
  let sum = 0;
  for (let index = 1; index < path.length; index++) {
    sum += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
  }
  return sum;
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}
