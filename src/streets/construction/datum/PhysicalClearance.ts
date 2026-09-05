import { invalidParams, invariantFailure } from '../../../errors';
import { intersection, union } from '../../../geom/clip';
import { levelAt } from '../highway';
import { PathStations } from './PathStations';
import { StationCells } from './StationCells';
import type { DatumClearanceInput, DatumClearanceRegion } from './schema';

export function clearanceFootprints(input: DatumClearanceInput): DatumClearanceRegion[] {
  const { plan, groundTop, clearHeight } = input;
  if (!Number.isFinite(groundTop) || !Number.isFinite(clearHeight) || clearHeight < 0) {
    throw invalidParams('datum clearance needs a finite ground top and nonnegative clear height');
  }
  const ceiling = groundTop + clearHeight;
  if (!Number.isFinite(ceiling)) throw invalidParams('datum clearance ceiling is not finite');
  const regions: DatumClearanceRegion[] = [];
  plan.physical.forEach((owner, physicalOwnerIndex) => {
    const source = new PathStations(owner.path, owner.topProfile, owner.edgeId);
    const thickness = owner.topProfile[0].level - owner.undersideProfile[0].level;
    const cuts = source.cuts([groundTop, ceiling + thickness]);
    const cells = new StationCells(source, owner.width / 2);
    const polygons = union(cuts.slice(1).flatMap((end, index) => {
      const start = cuts[index];
      const middle = (start + end) / 2;
      return levelAt(owner.topProfile, middle) >= groundTop && levelAt(owner.undersideProfile, middle) <= ceiling
        ? cells.slice(owner.polygons, start, end) : [];
    }));
    if (polygons.length) regions.push({ source: { kind: 'deck', physicalOwnerIndex }, polygons });
  });
  input.supports.forEach(({ support, structureEdgeIds }, supportIndex) => {
    if (!plan.projected.structures.some(structure => structure.edgeIds.length === structureEdgeIds.length
      && structure.edgeIds.every((id, index) => id === structureEdgeIds[index]))) {
      throw invariantFailure(`datum support ${supportIndex} has no structure ownership`);
    }
    if (!Number.isFinite(support.bottom) || !Number.isFinite(support.top) || support.top < support.bottom) {
      throw invariantFailure(`datum support ${supportIndex} has invalid vertical bounds`);
    }
    if (support.top < groundTop || support.bottom > ceiling) return;
    const polygons = intersection([support.footprint], [plan.boundary]);
    if (polygons.length) regions.push({ source: { kind: 'support', supportIndex }, polygons });
  });
  return regions;
}
