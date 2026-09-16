import type { Polygon, StreetEdge, StreetNode, Vec2 } from '../../../schema/blueprint';
import type { RoadProfile, SidewalkProfile } from '../construction/schema/design';
import type { StreetRun } from '../construction/schema/sections';
import type { ModuleBlock, ModuleConstruction, ModuleFormat, ModuleFrontagePlan, ModuleCornerPlan } from '../construction/modules/schema';
import type { SidewalkSectionRecord } from '../construction/schema/sections';
import type { DiagonalCandidate } from './diagonal-candidates/schema';

export type DiagonalMode = 'candidates' | 'off' | 'legacy-applied';
export interface LayoutDiagonalCandidate extends Omit<DiagonalCandidate, 'constructionWidth'> {
  roadProfile: RoadProfile;
  sidewalks: { left: SidewalkSectionRecord; right: SidewalkSectionRecord };
  roadWidth: number;
  /** Road and both actual resolved sidewalk bands. */
  constructionWidth: number;
  /** Conservative return allowance on each side, beyond constructionWidth. */
  reservationPadding: number;
  /** Full width used by footprint and all mouth-clearance checks. */
  reservationWidth: number;
}

export interface GridLayoutInput {
  moduleFormat?: ModuleFormat;
  districtCenters?: Vec2[];
  seed: string;
  size: { width: number; depth: number };
  profiles: RoadProfile[];
  /** Reserve a seeded interior four-lane through-run before sizing blocks. Default false. */
  highway?: boolean;
  /** Default candidates. Applied cuts require explicit legacy-applied compatibility mode. */
  diagonals?: DiagonalMode;
  /** Clearance of every complete reserved mouth from original face corners, default 3 m. */
  diagonalCornerClearance?: number;
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

export interface LayoutFrontage extends Omit<ModuleFrontagePlan, 'side' | 'pavedWidth' | 'cornerIds'> {
  pavedWidth: number;
  /** Null marks a straight handoff to another owner. */
  cornerIds: [string | null, string | null];
  edgeIds: string[];
}

export interface LayoutPlanningData {
  protected: { kind: 'underpass'; ownerId: string; nodeId: string; edgeIds: string[]; replacedCornerIds: string[] }[];
  frontages: LayoutFrontage[];
  corners: ModuleCornerPlan[];
}

export interface GridLayoutPlan {
  diagonalCandidates: LayoutDiagonalCandidate[];
  planning: LayoutPlanningData;
  nodes: StreetNode[];
  edges: StreetEdge[];
  runs: StreetRun[];
  /** Reserved through-run; the caller assigns its elevated highway class and profile. */
  highwayRunId?: string;
  blocks: GridLayoutBlock[];
  modules: ModuleConstruction;
  roadway: Polygon[];
  /** Outer limits of the roadway rectangles, inside the city extent. */
  bounds: { min: Vec2; max: Vec2 };
}
