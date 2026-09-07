import type { Polygon, StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import type { RoadProfile, SidewalkProfile } from '../construction/schema/design';
import type { StreetRun } from '../construction/schema/sections';
import type { ModuleBlock, ModuleConstruction } from '../construction/modules/schema';

export interface GridLayoutInput {
  seed: string;
  size: { width: number; depth: number };
  profiles: RoadProfile[];
  /** Rare declared-angle cuts in eligible interior blocks. Defaults to true. */
  diagonals?: boolean;
  sideAt: (point: Vec2, streetClass: 'street' | 'road') => { profile: SidewalkProfile; finish: string };
  /** Complete outer sidewalks with a shared profile and finish. */
  perimeter?: { profile: SidewalkProfile; finish: string };
}

export interface GridLayoutBlock extends Omit<ModuleBlock, 'placements'> {
  /** Surrounding frontage edges and an optional internal diagonal. */
  edgeIds: string[];
  /** Separate buildable regions when a declared street cuts this block. */
  interiors?: Polygon[];
}

export interface GridLayoutPlan {
  nodes: StreetNode[];
  edges: StreetEdge[];
  runs: StreetRun[];
  blocks: GridLayoutBlock[];
  modules: ModuleConstruction;
  roadway: Polygon[];
  /** Outer limits of the roadway rectangles, inside the city extent. */
  bounds: { min: Vec2; max: Vec2 };
}
