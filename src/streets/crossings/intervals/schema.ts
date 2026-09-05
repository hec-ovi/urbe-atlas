import type { Polygon, Vec2 } from '../../../../schema/blueprint';

export type { Polygon, Vec2 };

export interface StationIntervalInput {
  a: Vec2;
  b: Vec2;
  /** Complete footprint length along the segment, metres. */
  width: number;
  /** Minimum and maximum offset along the segment's left normal. */
  lateral: [number, number];
  /** Preceding source-path distance used to encode then recover local stations. Defaults to zero. */
  sourceOffset?: number;
  allowed: Polygon[];
  /** Blocks overlap with a positive precision interior. */
  forbidden?: Polygon[];
  /** Blocks every positive-area overlap, including sub-grid regions. */
  excluded?: Polygon[];
}

/** Inclusive centre stations in metres from the segment start. */
export interface StationInterval {
  from: number;
  to: number;
}
