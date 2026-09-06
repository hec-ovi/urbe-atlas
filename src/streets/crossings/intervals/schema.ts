import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import type { FootprintRegions } from './FootprintRegions';

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

/** Prepared fields snapshot their masks and share exact geometry between queries. */
export type StationIntervalQuery = Omit<StationIntervalInput, 'allowed' | 'forbidden' | 'excluded'> & {
  allowed: Polygon[] | FootprintRegions;
  forbidden?: Polygon[] | FootprintRegions;
  excluded?: Polygon[] | FootprintRegions;
};

/** Inclusive centre stations in metres from the segment start. */
export interface StationInterval {
  from: number;
  to: number;
}
