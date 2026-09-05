import type { Polygon, Vec2 } from '../../../schema/blueprint';
import { GRID_STEP, hasInteriorBeyondPrecision } from '../../geom/clip';
import { edgeMaskView, edgePositionView } from '../../geom/partition/EdgeMasks';
import type { PartitionEdgeMask, PartitionEdgePosition } from '../../geom/partition/schema';
import { FootprintRegions } from './intervals/FootprintRegions';
import { StationFrame } from './intervals/StationFrame';

export const CROSSING_DIMENSIONS = { width: 3, stripeLength: 0.5, stripeGap: 0.5 } as const;

export function stripeCuts(): number[] {
  const { width, stripeLength, stripeGap } = CROSSING_DIMENSIONS;
  const count = Math.floor((width + stripeGap) / (stripeLength + stripeGap));
  const occupied = count * stripeLength + (count - 1) * stripeGap;
  return Array.from({ length: count }, (_, index) => {
    const start = -occupied / 2 + index * (stripeLength + stripeGap);
    return [start, start + stripeLength];
  }).flat();
}

export class CrossingFrame {
  private readonly frame: StationFrame;
  constructor(a: Vec2, b: Vec2) { this.frame = new StationFrame(a, b); }
  get length(): number { return this.frame.length; }
  private position(station: number, lateral: number): PartitionEdgePosition {
    return { from: this.frame.edgePoint(0, lateral), to: this.frame.edgePoint(this.length, lateral),
      t: station / this.length };
  }

  point(station: number, lateral: number): Vec2 {
    return edgePositionView({ position: this.position(station, lateral), encoding: 'authored-1mm' });
  }

  construction(station: number, lateral: [number, number], width: number = CROSSING_DIMENSIONS.width): PartitionEdgeMask {
    const h = width / 2;
    return [this.position(station - h, lateral[0]), this.position(station + h, lateral[0]),
      this.position(station + h, lateral[1]), this.position(station - h, lateral[1])];
  }

  rectangle(station: number, lateral: [number, number], width: number = CROSSING_DIMENSIONS.width): Polygon {
    return edgeMaskView({ mask: this.construction(station, lateral, width), encoding: 'authored-1mm' });
  }

  stripes(station: number, roadWidth: number): Polygon[] {
    const cuts = stripeCuts();
    return Array.from({ length: cuts.length / 2 }, (_, index) => this.rectangle(
      station + (cuts[index * 2] + cuts[index * 2 + 1]) / 2,
      [-roadWidth / 2, roadWidth / 2], CROSSING_DIMENSIONS.stripeLength,
    ));
  }
}

export class FootprintIndex {
  private readonly entries: { polygon: Polygon; bounds: Bounds }[];
  constructor(polygons: readonly Polygon[]) {
    this.entries = polygons.map((polygon) => ({ polygon, bounds: bounds(polygon) }));
  }
  near(polygon: Polygon): Polygon[] {
    const target = bounds(polygon);
    const neighborhood: Bounds = [target[0] - GRID_STEP, target[1] - GRID_STEP, target[2] + GRID_STEP, target[3] + GRID_STEP];
    return this.entries.filter((entry) => overlaps(neighborhood, entry.bounds)).map((entry) => entry.polygon);
  }
  covers(polygon: Polygon): boolean {
    return FootprintRegions.covers(polygon, this.near(polygon));
  }
  intersects(polygon: Polygon): boolean {
    return hasInteriorBeyondPrecision(FootprintRegions.inside(polygon, this.near(polygon)));
  }
  overlapsArea(polygon: Polygon): boolean {
    return FootprintRegions.inside(polygon, this.near(polygon)).length > 0;
  }
}

type Bounds = [number, number, number, number];
function bounds(polygon: Polygon): Bounds {
  return [Math.min(...polygon.map((p) => p[0])), Math.min(...polygon.map((p) => p[1])),
    Math.max(...polygon.map((p) => p[0])), Math.max(...polygon.map((p) => p[1]))];
}
function overlaps(a: Bounds, b: Bounds): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}
