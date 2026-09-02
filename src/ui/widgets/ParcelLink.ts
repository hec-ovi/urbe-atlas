/**
 * URL template used by a selected parcel's open action, so the map can hand a
 * building to the engine viewer. The default targets the local engine; empty
 * means off.
 */
import type { Parcel } from '../../../schema/blueprint';
import { el } from '../components/dom';

/** Where a building opens by default: the engine's building viewer on the preview stack, the assembled world of this seed. */
const DEFAULT_TEMPLATE = 'http://localhost:5306/?mode=building&parcel={parcelId}&out=/out/{seed}';

const HINT = 'empty means off. Tokens: {seed} {parcelId} {blockId} {districtId} {type} {tier} {x} {z}';

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

  /** The link for this parcel, or null while the template is empty. */
  linkFor(parcel: Parcel, seed: string): string | null {
    const template = this.input.value.trim();
    if (template === '') return null;
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
    return template.replace(/\{(\w+)\}/g, (token, key: string) => values[key] ?? token);
  }
}
