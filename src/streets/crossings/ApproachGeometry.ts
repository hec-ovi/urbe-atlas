import type { CrossingSegment, StreetEdge } from '../../../schema/blueprint';
import { sidewalkBand } from '../construction/SidewalkSection';
import { CROSSING_DIMENSIONS, CrossingFrame } from './Footprints';
import type { JunctionApproach } from './schema';

export interface ApproachCandidate {
  approach: Omit<JunctionApproach, 'nodeId' | 'groupId'>;
  segment: CrossingSegment;
}

export function approachBands(edge: StreetEdge): {
  half: number; left: number; right: number;
  field: [number, number]; leftTerminal: [number, number]; rightTerminal: [number, number]; whole: [number, number];
} {
  const half = edge.width / 2;
  const leftBand = sidewalkBand(edge, 'left', 'walking'), rightBand = sidewalkBand(edge, 'right', 'walking');
  const left = half + leftBand.offset, right = half + rightBand.offset;
  const leftTerminal: [number, number] = [left - leftBand.width / 4, left + leftBand.width / 4];
  const rightTerminal: [number, number] = [-right - rightBand.width / 4, -right + rightBand.width / 4];
  return { half, left, right, field: [-half, half], leftTerminal, rightTerminal,
    whole: [rightTerminal[0], leftTerminal[1]] };
}

/** Fields and their pedestrian terminals share each source segment's long edges. */
export function approachGeometry(edge: StreetEdge, frame: CrossingFrame, offset: number, local: number): ApproachCandidate {
  const distance = offset + local;
  const station = distance - offset;
  const bands = approachBands(edge);
  const { half, left, right } = bands;
  const field = frame.rectangle(station, bands.field);
  return {
    approach: {
      edgeId: edge.id, distance,
      station: [distance - CROSSING_DIMENSIONS.width / 2, distance + CROSSING_DIMENSIONS.width / 2],
      field,
      landings: { left: frame.rectangle(station, [half, left]), right: frame.rectangle(station, [-right, -half]) },
      walkingLandings: {
        left: frame.rectangle(station, bands.leftTerminal),
        right: frame.rectangle(station, bands.rightTerminal),
      },
      cut: { left: field[3], right: field[0] },
    },
    segment: {
      edgeId: edge.id, from: frame.point(station, left), to: frame.point(station, -right),
      roadway: { from: frame.point(station, half), to: frame.point(station, -half) },
      width: CROSSING_DIMENSIONS.width, markings: frame.stripes(station, edge.width),
    },
  };
}
