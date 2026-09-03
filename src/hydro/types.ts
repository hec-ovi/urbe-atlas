export type HydroPoint = [x: number, z: number];
export type HydroPolygon = HydroPoint[];

export type HydrologyType = 'lagoon' | 'river' | 'sea-coast';

export interface HydrologyParams {
  type: HydrologyType;
}

export interface HydrologyRequest {
  seed: string | number;
  size: { width: number; depth: number };
  boundary: HydroPolygon;
  config?: HydrologyParams;
}

export interface Shoreline {
  id: string;
  /** Closed implicitly from the final point to the first, without repeating it. */
  path: HydroPolygon;
  closed: true;
  /** Water-side construction strips following each shoreline segment. */
  band: HydroPolygon[];
}

export interface WaterBody {
  id: string;
  type: HydrologyType;
  surfaces: HydroPolygon[];
  shorelines: Shoreline[];
  elevation: number;
  depth: number;
  materialKey: 'water.lagoon' | 'water.river' | 'water.sea-coast';
}

export type HydrologyNetwork = 'street' | 'train' | 'subway';

export interface HydrologyCrossingInput {
  network: HydrologyNetwork;
  refId: string;
  path: HydroPoint[];
  /** Full constructed width whose contact with water requires a structure. */
  width: number;
  level: number;
}

export interface WaterStructure {
  id: string;
  kind: 'bridge' | 'tunnel';
  network: HydrologyNetwork;
  refId: string;
  waterBodyId: string;
  path: HydroPoint[];
  width: number;
  level: number;
}

export interface HydrologyPlan {
  seedId: string;
  type: HydrologyType;
  bodies: WaterBody[];
  structures: WaterStructure[];
}
