import type { Polygon, Vec2 } from '../../../../schema/blueprint';

export type SidewalkWidth = 2 | 4 | 6;
export type ModuleFormat = 'source' | 'district';
export type ModuleRole = 'panel' | 'joint' | 'curb' | 'gutter' | 'gutter-lip' | 'guardrail' | 'roadway' | 'marking';
export type QuarterTurn = 0 | 1 | 2 | 3;

/** Local XZ polygon and absolute Y levels, in metres. UVs use local metre coordinates. */
export interface ModulePrism {
  role: ModuleRole;
  polygon: Polygon;
  bottom: number;
  top: number;
}

export interface ModuleDefinition {
  id: string;
  /** Supporting beds already form disjoint, hole-free planning regions. */
  partitionedBeds?: true;
  parts: ModulePrism[];
}

/** Planning cover. Physical joints and lip heights remain in the module prisms. */
export interface ModuleGroundRegion {
  blockId: string;
  surface: 'roadway' | 'sidewalk' | 'curb' | 'gutter';
  polygon: Polygon;
  bottom: number;
  top: number;
}

export interface ModulePlacement {
  moduleId: string;
  blockId: string;
  origin: Vec2;
  turn: QuarterTurn;
  /** Repeats along local +X. Geometry is shared by every repetition. */
  count: number;
  step: number;
  finish: string;
}

export interface ModuleConstruction {
  version: '1.0.0';
  /** Omission identifies the original source construction. */
  format?: ModuleFormat;
  definitions: ModuleDefinition[];
  placements: ModulePlacement[];
  parking?: ModuleParking[];
  /** Paved land owners outside the building blocks. */
  frontages?: ModuleFrontage[];
}

export interface ModuleFrontage { id: string; boundary: Polygon; planning?: ModuleBlockPlan }

export interface PerimeterModuleInput {
  id: string;
  /** Roadway rectangle, whole-metre source spans or 0.2 m district spans on millimetre-grid coordinates. */
  bounds: { min: Vec2; max: Vec2 };
  width: SidewalkWidth;
  finish: string;
}

interface ParkingIdentity {
  blockId: string;
  side: QuarterTurn;
  start: number;
  end: number;
  slotCount: number;
  slots: Polygon[];
}

export type ModuleParking = ParkingIdentity & (
  | { profile?: undefined; slotLength: 4; width: 2 }
  | { profile: 'native'; frontageId: string; slotLength: 6; width: 2 | 2.5; endRun: 2; footprint: Polygon;
      /** Complete construction span, including two metres beyond each bay end. */
      support: { start: number; end: number }; walkingClearance: number }
);

export interface BlockModuleInput {
  id: string;
  /** Lower-left paved corner, before curb and gutter. */
  origin: Vec2;
  /** Whole even panel counts including corners. District rectangles add 0.4 m per axis for separators. */
  panels: [number, number];
  /** South, east, north, west. */
  sidewalks: [SidewalkWidth, SidewalkWidth, SidewalkWidth, SidewalkWidth];
  finish: string;
  /** Source 4/6 m walks can carry a 2 x 2 m middle panel. District always uses the 2 x 2 m inner panel. */
  centerDouble?: boolean;
  /** Short groups of 2 m rails at complete panel stations. */
  guardrails?: { side: QuarterTurn; start: number; segments: 1 | 2 | 3 }[];
  /** Distance intervals along each side's counterclockwise straight run. */
  reserved?: [Vec2[], Vec2[], Vec2[], Vec2[]];
  /** Native 6 m slots require 6 m source or 4 m district panels. Omitted profile is source-only. */
  parking?: { side: QuarterTurn; start: number; slots: 1 | 2 | 3; profile?: 'native' }[];
}

export interface ModuleFrontagePlan {
  id: string;
  ownerId: string;
  side: QuarterTurn;
  /** Road-facing tangent endpoints; station zero is start, increasing toward end. */
  start: Vec2;
  end: Vec2;
  inward: Vec2;
  pavedWidth: number;
  /** Exact dimensions of the source construction profile. */
  curbWidth?: number;
  gutterWidth?: number;
  /** Source module station zero. Parking start/end are measured from this point along the frontage. */
  moduleStationOrigin: Vec2;
  /** End of the original straight module run, before its next corner support. */
  moduleStationEnd?: Vec2;
  cornerIds: [string, string];
}

interface CornerIdentity {
  id: string;
  ownerId: string;
  frontageIds: [string, string];
  /** Exact source placement identity, used when another producer replaces this corner. */
  placement: { moduleId: string; origin: Vec2; turn: QuarterTurn };
}

export type ModuleCornerPlan = CornerIdentity & (
  | { kind: 'arc'; center: Vec2; radius: number; arc: Polygon }
  | { kind: 'explicit'; boundary: Polygon }
);

export interface ModuleBlockPlan {
  frontages: ModuleFrontagePlan[];
  corners: ModuleCornerPlan[];
}

export interface ModuleBlock {
  id: string;
  outer: Polygon;
  interior: Polygon;
  placements: ModulePlacement[];
  planning?: ModuleBlockPlan;
}
