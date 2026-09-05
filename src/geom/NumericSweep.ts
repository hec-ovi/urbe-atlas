import { invariantFailure } from '../errors';
import { convexHull } from './ConvexHull';
import { orientation } from './orientation';
import { edgeSupportEnclosures } from './partition/EdgeSupportEnclosures';
import type { PartitionPointEnclosure } from './partition/schema';
import type { NumericSweepEnvelope, NumericSweepInput, Vec2 } from './schema';

const corners = ({ lower, upper }: PartitionPointEnclosure): Vec2[] => [
  [lower[0], lower[1]], [lower[0], upper[1]], [upper[0], lower[1]], [upper[0], upper[1]],
];

/** Encloses the published numeric views of both source sides without moving either side. */
export function numericSweepEnvelope(input: NumericSweepInput): NumericSweepEnvelope {
  if (!input || !Array.isArray(input.sides) || input.sides.length !== 2) {
    throw invariantFailure('numeric sweep requires two source sides');
  }
  const sides: NumericSweepEnvelope['sides'] = [
    edgeSupportEnclosures({ ...input.sides[0], encoding: input.encoding }),
    edgeSupportEnclosures({ ...input.sides[1], encoding: input.encoding }),
  ];
  const source = convexHull(input.sides.flatMap(side => [side.from, side.to]), orientation);
  if (source.length < 3) throw invariantFailure('numeric sweep requires a positive-area source');
  const polygon = convexHull(sides.flatMap(side => [...corners(side.from), ...corners(side.to)]), orientation);
  return { polygon, sides };
}
