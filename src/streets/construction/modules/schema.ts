import type { Polygon, Vec2 } from '../../../../schema/blueprint';

export type SidewalkWidth = 2 | 4 | 6;
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
  parts: ModulePrism[];
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
  definitions: ModuleDefinition[];
  placements: ModulePlacement[];
  parking?: ModuleParking[];
}

export interface ModuleParking {
  blockId: string;
  side: QuarterTurn;
  start: number;
  end: number;
  slotCount: number;
  slotLength: 4;
  width: 2;
  slots: Polygon[];
}

export interface BlockModuleInput {
  id: string;
  /** Lower-left paved corner, before curb and gutter. */
  origin: Vec2;
  /** Full paved rectangle dimensions in whole panels, including corner reservations. */
  panels: [number, number];
  /** South, east, north, west. */
  sidewalks: [SidewalkWidth, SidewalkWidth, SidewalkWidth, SidewalkWidth];
  finish: string;
  /** 4/6 m walks can carry one 2 x 2 m middle panel in each 2 m group. */
  centerDouble?: boolean;
  guardrails?: boolean;
  /** Distance intervals along each side's counterclockwise straight run. */
  reserved?: [Vec2[], Vec2[], Vec2[], Vec2[]];
  /** Whole 4 m slots, with a 2 m transition at each end; wide sidewalks only. */
  parking?: { side: QuarterTurn; start: number; slots: 1 | 2 | 3 }[];
}

export interface ModuleBlock {
  id: string;
  outer: Polygon;
  interior: Polygon;
  placements: ModulePlacement[];
}
