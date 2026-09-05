import type { Vec2 } from '../../../../schema/blueprint';
import type { SidewalkBands } from '../schema/design';

/** Caller-owned finish selection and numeric construction dimensions. */
export interface PavingLayout {
  id: string;
  familyId: string;
  modules: PavingModule[];
  bands: Record<keyof SidewalkBands, { moduleId: string; borderWidth: number }>;
}

export interface PavingModule {
  id: string;
  /** Cell footprint dimensions, metres along frame U and V. */
  pitch: [number, number];
  /** Total joint width at each U/V boundary. Body = pitch - joint. */
  joint: [number, number];
}

export interface PavingDesign {
  layouts: PavingLayout[];
  defaultLayoutId: string;
  districtLayouts: { districtId: string; layoutId: string }[];
}

export interface PavingFrame {
  id: string;
  origin: Vec2;
  /** Unit direction. V is [-u[1], u[0]]. */
  u: Vec2;
  gridStep: 0.001;
}

export type PavingOwner =
  | { kind: 'run'; runId: string; edgeId: string; side: 'left' | 'right'; station: [number, number] }
  | { kind: 'junction'; nodeId: string; edgeIds: string[] }
  | { kind: 'station-bay'; stationId: string; entranceIndex: number };

export interface PavingRegion {
  id: string;
  owner: PavingOwner;
  /** Movement space is independent of finish and visible joints. */
  band: keyof SidewalkBands | 'circulation';
  layoutId: string;
  frameId: string;
}

export type PavingRole =
  | 'body' | 'joint' | 'border' | 'curb'
  | 'crossing-field' | 'approach' | 'corner-infill';

/** Additive GroundSurface.construction; the owner polygon remains authoritative. */
export interface GroundConstruction {
  regionId: string;
  part:
    | {
      kind: 'grid';
      moduleId: string;
      /** Sorted disjoint row spans, from inclusive and to exclusive. */
      cells: { row: number; from: number; to: number }[];
    }
    | { kind: 'solid'; role: PavingRole };
}

/** Additive StreetConstruction.paving, with no duplicate geometry polygons. */
export interface PavingConstruction {
  version: '1.0.0';
  layouts: PavingLayout[];
  frames: PavingFrame[];
  regions: PavingRegion[];
}
