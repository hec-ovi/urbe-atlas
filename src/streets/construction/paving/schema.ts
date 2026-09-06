import type { GroundSurface, Vec2 } from '../../../../schema/blueprint';
import type { SidewalkBands } from '../schema/design';

/** Caller-owned finish selection and numeric construction dimensions. */
export interface PavingLayout {
  id: string;
  familyId: string;
  modules: PavingModule[];
  bands: Record<keyof SidewalkBands, PavingBandSetting>;
}

export interface PavingBandSetting {
  moduleId: string;
  borderWidth: number;
  /** Optional whole-group pattern, measured in the band's underlying base cells. */
  grouping?: { moduleId: string; period: [number, number]; offset: [number, number] };
}

export interface PavingModule {
  id: string;
  /** Cell footprint dimensions, metres along frame U and V. */
  pitch: [number, number];
  /** Total joint width at each U/V boundary. Body = pitch - joint. */
  joint: [number, number];
  /** Integer base-cell count in one slab. Omission is [1, 1]. */
  baseCells?: [number, number];
}

export interface PavingDesign {
  layouts: PavingLayout[];
  defaultLayoutId: string;
  /** Continuous roadway finish. Omission selects defaultLayoutId. */
  roadwayLayoutId?: string;
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
  /** Required in 1.1.0; source identity carries semantic levels, never geometry. */
  sourceId?: string;
  owner: PavingOwner;
  /** Movement space is independent of finish and visible joints. */
  band: keyof SidewalkBands | 'circulation';
  layoutId: string;
  frameId: string;
}

export interface PavingSource {
  id: string;
  surface: GroundSurface['surface'];
  bottom: number;
  top: number;
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
      /** Integer base-cell translation. Omission is [0, 0]; nonzero requires 1.2.0. */
      baseOffset?: [number, number];
      /** Sorted disjoint row spans, from inclusive and to exclusive. */
      cells: { row: number; from: number; to: number }[];
    }
    | { kind: 'solid'; role: PavingRole };
}

/** Additive StreetConstruction.paving, with no duplicate geometry polygons. */
interface PavingConstructionData {
  layouts: PavingLayout[];
  frames: PavingFrame[];
}

interface FittedPavingData {
  roadwayLayoutId: string;
  sources: PavingSource[];
  regions: (PavingRegion & { sourceId: string })[];
}

export type PavingConstruction = PavingConstructionData & (
  | { version: '1.0.0'; regions: PavingRegion[] }
  | ({ version: '1.1.0' } & FittedPavingData)
  | ({ version: '1.2.0' } & FittedPavingData)
);
