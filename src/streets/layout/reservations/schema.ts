import type { Block, CityBlueprint, GroundSurface, Parcel, Polygon, Vec2 } from '../../../../schema/blueprint';
import type { ModuleConstruction, ModuleCornerPlan } from '../../construction/modules/schema';
import type { GridLayoutBlock, LayoutPlanningData } from '../schema';

export interface ReservationCity {
  modules: ModuleConstruction;
  streets: Pick<CityBlueprint['streets'], 'nodes' | 'edges' | 'highwayStructures'>;
  blocks: Pick<Block, 'id' | 'parcelIds'>[];
  parcels: Pick<Parcel, 'id' | 'lot'>[];
  transit: Pick<CityBlueprint['transit'], 'subwayStations'>;
  volumetric: { ground: GroundSurface[] };
}

export interface ReservationInput extends ReservationCity {
  planning: LayoutPlanningData;
  layoutBlocks: Pick<GridLayoutBlock, 'id' | 'interior' | 'interiors'>[];
}

export interface StreetOwner {
  id: string;
  kind: 'block' | 'perimeter' | 'underpass' | 'roadway' | 'station';
  /** Indices in the exact saved volumetric.ground array; each selected index belongs to one owner. */
  groundIndices: number[];
  excludedParcelIds: string[];
  /** Authored building land, in contour order; only block owners have interiors. */
  interiors: Polygon[];
  finish: string | null;
}

export interface StreetFrontage {
  id: string;
  ownerId: string;
  edgeIds: string[];
  /** Station zero is start; positive stations run toward end in metres. */
  start: Vec2;
  end: Vec2;
  inward: Vec2;
  stationRange: [0, number];
  /** Position of source module station zero, measured from start. */
  moduleStationOffset: number;
  pavedWidth: number;
  roadTop: number;
  pavedTop: number;
  curbWidth: 0.2;
  gutterWidth: 0.3 | 0.5;
  cornerIds: [string | null, string | null];
}

export interface StreetParking {
  id: string;
  ownerId: string;
  frontageId: string;
  /** Both intervals use the named frontage's station zero and direction. */
  start: number;
  end: number;
  support: { start: number; end: number };
  slotCount: number;
  slotLength: 6;
  depth: 2 | 2.5;
  endRun: 2;
  walkingClearance: number;
  footprint: Polygon;
  slots: Polygon[];
}

export type ProtectedStreetReference =
  | { kind: 'highway'; structureIndex: number }
  | { kind: 'underpass'; ownerId: string; nodeId: string; edgeIds: string[]; highwayIndices: number[] }
  | { kind: 'station-bay'; stationId: string; bayIndex: number }
  | { kind: 'station-shaft'; stationId: string; shaftIndex: number };

export interface StreetReservations {
  version: '1.0.0';
  groundArray: { path: 'volumetric.ground'; count: number };
  owners: StreetOwner[];
  frontages: StreetFrontage[];
  corners: ModuleCornerPlan[];
  parking: StreetParking[];
  /** References constrain construction but never add ground ownership. */
  protected: ProtectedStreetReference[];
}
