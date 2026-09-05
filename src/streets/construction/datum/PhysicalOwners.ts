import type { Polygon } from '../../../../schema/blueprint';
import { invariantFailure } from '../../../errors';
import { intersection } from '../../../geom/clip';
import { StreetCorridors } from '../StreetCorridors';
import { PathStations } from './PathStations';
import type { DatumPhysicalInput, DatumPhysicalPlan } from './schema';

export function validateBoundary(boundary: Polygon): void {
  if (boundary.length < 3 || boundary.some(point => point.some(value => !Number.isFinite(value)))) {
    throw invariantFailure('datum has no finite city boundary');
  }
}

/** Only structure-owned sources need physical corridor and height queries. */
export function physicalPlan(input: DatumPhysicalInput): DatumPhysicalPlan {
  validateBoundary(input.boundary);
  const byId = new Map(input.edges.map(edge => [edge.id, edge]));
  if (byId.size !== input.edges.length) throw invariantFailure('datum repeats a physical source edge');
  const claimed = new Set<string>();
  const owners = input.structures.flatMap(structure => {
    if (structure.edgeIds.length === 0 || !Number.isFinite(structure.deckThickness)
      || !Number.isFinite(structure.width) || structure.width <= 0 || !Number.isFinite(structure.level)
      || structure.deckThickness <= 0 || structure.deckThickness >= structure.level) {
      throw invariantFailure('datum structure has no valid deck ownership');
    }
    return structure.edgeIds.map(edgeId => {
      const edge = byId.get(edgeId);
      if (!edge || claimed.has(edgeId) || edge.width !== structure.width || edge.level !== structure.level) {
        throw invariantFailure(`datum structure conflicts with edge ${edgeId}`);
      }
      claimed.add(edgeId);
      new PathStations(edge.path, edge.elevationProfile, edgeId);
      return { edge, thickness: structure.deckThickness };
    });
  });
  const corridors = new StreetCorridors(owners.map(owner => owner.edge));
  return {
    boundary: input.boundary,
    projected: { structures: input.structures.map(structure => ({ edgeIds: structure.edgeIds })) },
    physical: owners.map(({ edge, thickness }) => ({
      kind: 'deck', edgeId: edge.id, path: edge.path, width: edge.width,
      polygons: intersection(corridors.roadway.get(edge.id) ?? [], [input.boundary]),
      topProfile: edge.elevationProfile,
      undersideProfile: edge.elevationProfile.map(knot => ({ ...knot, level: knot.level - thickness })),
    })),
  };
}
