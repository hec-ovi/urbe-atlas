/** Read-only color legend: parcel types by tier, street classes, transit modes. */
import type { ParcelType, StreetClass } from '../../../schema/blueprint';
import type { WealthTier } from '../../../schema/params';
import { GROUND_COLORS, TRANSIT_COLORS, parcelColor, streetColor } from '../components/colors';
import { el } from '../components/dom';

const TYPES: ParcelType[] = [
  'residential', 'hotel', 'offices', 'corpo', 'hospital', 'clinic', 'police',
  'military', 'factory', 'commerce', 'mall', 'restaurant', 'coffee_shop',
];
const TIERS: WealthTier[] = ['poor', 'mid', 'rich', 'high_rich'];
const STREETS: StreetClass[] = ['street', 'road', 'highway', 'alley'];

export class LegendWidget {
  readonly root: HTMLElement;

  constructor() {
    this.root = el('div', { class: 'legend' }, [el('h3', { text: 'Legend' })]);

    const zoneRows = el('div', { class: 'legend-section' });
    for (const type of TYPES) {
      const row = el('div', { class: 'legend-row' });
      for (const tier of TIERS) {
        row.append(el('span', { class: 'swatch', title: `${type} ${tier}`, style: `background:${parcelColor(type, tier)}` }));
      }
      row.append(el('span', { class: 'legend-label', text: type.replace('_', ' ') }));
      zoneRows.append(row);
    }
    this.root.append(el('p', { class: 'legend-hint', text: 'tiers left to right: poor, mid, rich, high rich' }), zoneRows);

    const other = el('div', { class: 'legend-section' });
    for (const cls of STREETS) {
      other.append(
        el('div', { class: 'legend-row' }, [
          el('span', { class: 'swatch', style: `background:${streetColor(cls)}` }),
          el('span', { class: 'legend-label', text: cls }),
        ]),
      );
    }
    const extras: [string, string][] = [
      ['curb', GROUND_COLORS.curb],
      ['sidewalk', GROUND_COLORS.sidewalk],
      ['open ground', GROUND_COLORS.open],
      ['bus', TRANSIT_COLORS.busRoute],
      ['subway', TRANSIT_COLORS.subway],
      ['train', TRANSIT_COLORS.train],
    ];
    for (const [label, color] of extras) {
      other.append(
        el('div', { class: 'legend-row' }, [
          el('span', { class: 'swatch', style: `background:${color}` }),
          el('span', { class: 'legend-label', text: label }),
        ]),
      );
    }
    this.root.append(other);
  }
}
