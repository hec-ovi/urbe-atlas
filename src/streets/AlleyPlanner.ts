/**
 * Alleys: narrow pedestrian cuts through long blocks, dense in poor and
 * commercial districts, elsewhere only where a block runs long enough to need
 * a mid-block connector. A cut is a straight chord across the buildable land
 * of one block, overshooting into the streets at both ends so the graph
 * builder nodes it into the network; the overshoot prunes away as a stub.
 */
import type { Polygon, Polyline, Vec2 } from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import type { PlannedDistrict } from '../districts/DistrictPlanner';
import { orientedBoundingBox } from '../geom/obb';
import { centroid, pointInPolygon } from '../geom/polygon';
import { add, closestOnSegment, cross, dist, distSq, scale, sub } from '../geom/vec';

/** Block left on each side of a cut, so both halves still hold parcels. */
const MIN_HALF = 42;
/** A block narrower than this across the cut has no room for one. */
const MIN_BLOCK_WIDTH = 30;
/** Block length that earns a connector outside the dense districts. */
const MIN_PLAIN_LENGTH = 140;
/** Distance between cuts along the block. */
const SPACING = { dense: 85, plain: 130 };
const MAX_CUTS = 3;
/** Share of eligible blocks that get alleys. */
const CHANCE = { dense: 0.85, plain: 0.45 };
/** Overshoot past the curb line, far enough to cross the street centerline. */
const OVERSHOOT = 14;
/** Shortest alley worth cutting. */
const MIN_CHORD = 24;
/** Clearance from street junctions, so a cut lands mid-block. */
const JUNCTION_CLEARANCE = 15;
/** Mouth where an alley opens onto the street. */
const THROAT = 10;
/** Past its throats a cut keeps this far from the curb, never running along one. */
const CURB_CLEARANCE = 9;
/** Swing off the perpendicular, radians. */
const SWING = 0.2;

export class AlleyPlanner {
  /**
   * One centerline per alley, ready to join the traced street lines.
   * `blocks` is the buildable land of each block, `junctions` the street nodes.
   */
  static plan(
    blocks: readonly Polygon[],
    junctions: readonly Vec2[],
    districtOf: (p: Vec2) => PlannedDistrict,
    rng: Rng,
  ): Polyline[] {
    const out: Polyline[] = [];
    blocks.forEach((block, blockIndex) => {
      const box = orientedBoundingBox(block);
      const district = districtOf(centroid(block));
      const dense =
        district.kind === 'commercial' || district.kind === 'downtown' || district.tier === 'poor';
      if (box.width < MIN_BLOCK_WIDTH) return;
      if (box.length < (dense ? 2 * MIN_HALF : MIN_PLAIN_LENGTH)) return;

      const blockRng = rng.fork(blockIndex);
      if (!blockRng.chance(dense ? CHANCE.dense : CHANCE.plain)) return;

      const spacing = dense ? SPACING.dense : SPACING.plain;
      const cuts = Math.max(1, Math.min(MAX_CUTS, Math.floor(box.length / spacing)));
      for (let k = 1; k <= cuts; k++) {
        const t = k / (cuts + 1) + blockRng.range(-0.05, 0.05);
        const origin = add(box.center, scale(box.axis, (t - 0.5) * box.length));
        const angle = blockRng.range(-SWING, SWING);
        const across: Vec2 = [-box.axis[1], box.axis[0]];
        const dir: Vec2 = [
          across[0] * Math.cos(angle) - across[1] * Math.sin(angle),
          across[0] * Math.sin(angle) + across[1] * Math.cos(angle),
        ];
        const cut = chordThrough(block, origin, dir, junctions);
        if (cut) out.push(cut);
      }
    });
    return out;
  }
}

/**
 * The piece of the line through `origin` that crosses `block`, overshooting
 * both ends into the street. Null when the cut would run along a curb, land on
 * a junction, or come out short.
 */
function chordThrough(
  block: Polygon,
  origin: Vec2,
  dir: Vec2,
  junctions: readonly Vec2[],
): Polyline | null {
  if (!pointInPolygon(origin, block)) return null;
  let back = 0;
  let forward = 0;
  for (let i = 0; i < block.length; i++) {
    const p = block[i];
    const edge = sub(block[(i + 1) % block.length], p);
    const denom = cross(dir, edge);
    if (Math.abs(denom) < 1e-12) continue;
    const dp = sub(p, origin);
    const u = cross(dp, dir) / denom;
    if (u < 0 || u > 1) continue;
    const s = cross(dp, edge) / denom;
    if (s < 0) back = back === 0 ? s : Math.max(back, s);
    else if (s > 0) forward = forward === 0 ? s : Math.min(forward, s);
  }
  if (back === 0 || forward === 0 || forward - back < MIN_CHORD) return null;

  const ends = [add(origin, scale(dir, back)), add(origin, scale(dir, forward))];
  const clearance = JUNCTION_CLEARANCE * JUNCTION_CLEARANCE;
  for (const end of ends) {
    for (const junction of junctions) {
      if (distSq(end, junction) < clearance) return null;
    }
  }
  for (let s = back + THROAT; s <= forward - THROAT; s += 3) {
    if (distanceToRing(add(origin, scale(dir, s)), block) < CURB_CLEARANCE) return null;
  }
  return [add(ends[0], scale(dir, -OVERSHOOT)), add(ends[1], scale(dir, OVERSHOOT))];
}

function distanceToRing(p: Vec2, poly: Polygon): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const { point } = closestOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
    best = Math.min(best, dist(p, point));
  }
  return best;
}
