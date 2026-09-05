import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { offset } from '../geom/clip';
import { setback } from './profiles';
import { INTERIOR } from './core';
import { GridFrame } from './GridFrame';
import { GridLand } from './GridLand';

/** The serialized construction rectangle stays on its shared grid and inside its lot. */
export function validateFootprints(city: CityBlueprint): void {
  if (city.meta.params.footprintShape !== 'rectangle') return;
  const grid = city.meta.buildingGrid;
  if (!grid || grid.angle !== city.meta.gridAngle || grid.spacing !== INTERIOR.snap
    || grid.origin[0] !== 0 || grid.origin[1] !== 0) {
    throw invariantFailure('rectangular footprints require the published city building grid');
  }
  const frame = new GridFrame(grid);
  for (const parcel of city.parcels) {
    if (parcel.footprint.length !== 4) throw invariantFailure(`parcel ${parcel.id} footprint is not a rectangle`);
    const candidate = frame.candidate(parcel.footprint);
    const exact = frame.polygon(candidate);
    if (candidate.width <= 0 || candidate.depth <= 0 || parcel.footprint.some((point, index) =>
      point[0] !== exact[index][0] || point[1] !== exact[index][1])) {
      throw invariantFailure(`parcel ${parcel.id} footprint leaves its construction grid`);
    }
    if (!offset([parcel.lot], -setback(parcel.type)).some((inset) =>
      new GridLand(inset, frame).contains(candidate, grid.spacing))) {
      throw invariantFailure(`parcel ${parcel.id} footprint exceeds its setback land`);
    }
  }
}
