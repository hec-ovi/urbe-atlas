/**
 * URL template used by a selected parcel's open action, so the map can hand a
 * building to the engine viewer. The default targets the local engine; empty
 * means off.
 */
import type { Parcel } from '../../../schema/blueprint';
import { el } from '../components/dom';

/** Where a building opens by default: the engine's building viewer on the preview stack, the assembled world of this seed. */
const DEFAULT_TEMPLATE = 'http://localhost:5306/?mode=building&parcel={parcelId}&out=/out/{seed}';

const HINT = 'Requires an out= world output. Tokens: {seed} {parcelId} {blockId} {districtId} {type} {tier} {x} {z}';

export type ParcelDestination =
  | { url: string; error?: never }
  | { url?: never; error: string };

export class ParcelLink {
  readonly root: HTMLElement;
  private readonly input: HTMLInputElement;

  constructor() {
    this.input = el('input', {
      type: 'text',
      id: 'parcel-link',
      placeholder: 'off',
      value: DEFAULT_TEMPLATE,
    });
    this.root = el('div', { class: 'parcel-link' }, [
      el('h3', { text: 'Parcel link' }),
      el('label', { class: 'field field-wide', for: 'parcel-link' }, ['URL template', this.input]),
      el('p', { class: 'hint', text: HINT }),
    ]);
  }

  /** Resolve a destination, forcing the selected parcel while retaining the chosen output. */
  destinationFor(parcel: Parcel, seed: string): ParcelDestination {
    const template = this.input.value.trim();
    if (template === '') {
      return { error: 'No exterior viewer is configured. Set a URL template with an out= world output.' };
    }
    const values: Record<string, string> = {
      seed,
      parcelId: parcel.id,
      blockId: parcel.blockId,
      districtId: parcel.districtId,
      type: parcel.type,
      tier: parcel.tier,
      x: String(parcel.access.point[0]),
      z: String(parcel.access.point[1]),
    };
    const resolved = template.replace(/\{(\w+)\}/g, (token, key: string) => values[key] ?? token);
    let url: URL;
    try {
      url = new URL(resolved, window.location.href);
    } catch {
      return { error: 'The exterior viewer URL is invalid.' };
    }
    const output = url.searchParams.get('out')?.trim();
    if (!output) {
      return { error: 'No assembled output is selected. Add an out= world output to the URL template.' };
    }
    url.searchParams.set('mode', 'building');
    url.searchParams.set('parcel', parcel.id);
    url.searchParams.set('out', output);
    return { url: url.toString() };
  }
}
