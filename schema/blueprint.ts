/**
 * atlas output: the city blueprint.
 * Units: meters. Ground plane is XZ, +Y up; 2D points are [x, z]; heights along +Y.
 * Polygons: CCW rings, first point not repeated, no self-intersections.
 * Determinism: same seed + params produce a byte-identical blueprint JSON.
 * IDs are deterministic strings, globally unique via a disjoint prefix per collection:
 * d district, n street node, e street edge, b block, p parcel,
 * bs bus stop, br bus route, ts train station, tl train line, ss subway station, sl subway line.
 */

import type { AtlasParams, DistrictKind, WealthTier } from './params';

export type Vec2 = [x: number, z: number];
export type Polygon = Vec2[];
export type Polyline = Vec2[];

/**
 * `alley` is pedestrian only: no carriageway (width 0), 3 to 5 m of ground,
 * all of it sidewalk. No vehicle route ever uses one.
 */
export type StreetClass = 'street' | 'road' | 'highway' | 'alley';

export type ParcelType =
  | 'residential'
  | 'hotel'
  | 'offices'
  | 'corpo'
  | 'hospital'
  | 'clinic'
  | 'police'
  | 'military'
  | 'factory'
  | 'commerce'
  | 'mall'
  | 'restaurant'
  | 'coffee_shop';

export interface CityBlueprint {
  meta: BlueprintMeta;
  districts: District[];
  streets: StreetGraph;
  blocks: Block[];
  parcels: Parcel[];
  transit: Transit;
  volumetric: Volumetric;
  stats: CityStats;
}

export interface BlueprintMeta {
  /** Blueprint schema version, semver. */
  version: string;
  seed: string;
  /** Params after defaults were applied: the exact input that reproduces this blueprint. */
  params: Required<AtlasParams>;
  /** Axis-aligned bounds of all geometry. */
  bounds: { min: Vec2; max: Vec2 };
  units: 'meters';
  /** Irregular outer city boundary. */
  boundary: Polygon;
}

export interface District {
  id: string;
  kind: DistrictKind;
  /** Dominant wealth tier; individual parcels may differ. */
  tier: WealthTier;
  boundary: Polygon;
  center: Vec2;
  maxFloors: number;
}

/** Planar street graph. Edges reference nodes; blocks are its interior faces. */
export interface StreetGraph {
  nodes: StreetNode[];
  edges: StreetEdge[];
  /** Pedestrian crossings linking sidewalks across roadways at intersections. */
  crossings: Crossing[];
}

export interface StreetNode {
  id: string;
  position: Vec2;
  edgeIds: string[];
}

export interface StreetEdge {
  id: string;
  class: StreetClass;
  from: string;
  to: string;
  /** Centerline from `from` to `to`; curves are polylines with <= 1 m deviation. */
  path: Polyline;
  /** Carriageway width in meters, sidewalks excluded. 0 on alleys. */
  width: number;
  /** Sidewalk width per side in meters, 0 = none (highways). Left/right relative to path direction. */
  sidewalk: { left: number; right: number };
  districtIds: string[];
}

export interface Crossing {
  nodeId: string;
  /** Each segment spans the roadway from one sidewalk to another. */
  segments: { from: Vec2; to: Vec2 }[];
}

/** A street-bounded area: sidewalk ring on its edge, parcels and open areas inside. */
export interface Block {
  id: string;
  districtId: string;
  /** Curb line: the face minus the roadway, with rounded corners at intersections. */
  boundary: Polygon;
  /** Sidewalk strip polygons between boundary and the buildable interior. */
  sidewalk: Polygon[];
  parcelIds: string[];
  /** Unbuilt leftover areas (plazas, courtyards). Parcels + sidewalk + openAreas cover the block. */
  openAreas: Polygon[];
}

export interface Parcel {
  id: string;
  blockId: string;
  districtId: string;
  type: ParcelType;
  tier: WealthTier;
  /** Full lot polygon; lots + open areas + sidewalk tile their block. */
  lot: Polygon;
  /** Buildable footprint: the lot inset by the type's setback, trimmed to the band the type needs end to end. */
  footprint: Polygon;
  /** Street access: the entrance connects to this edge's sidewalk at this point. */
  access: { edgeId: string; point: Vec2 };
  envelope: Envelope;
}

/**
 * 3D envelope for downstream building generation.
 * Every parcel footprint hosts the core rectangle its type needs, derived from
 * interior's core feasibility: the compact elevator core (12.14 x 13.74 m) for
 * offices, corpo, hotel, hospital, mall and factory, the walkup core
 * (11.14 x 9.74 m) for the rest. maxFloors stays within what the hosted core
 * allows (4 with one stair, 6 with two, unlimited with an elevator core) and
 * maxHeight always fits at least one floor of the type's family.
 */
export interface Envelope {
  minFloors: number;
  maxFloors: number;
  /** Nominal floor height for the type/tier, meters. Preview and estimation only; real per-floor elevations are owned by exterior and vary 2-4 m. */
  floorHeight: number;
  /** maxFloors * floorHeight, meters. Nominal cap, same caveat as floorHeight. */
  maxHeight: number;
}

export interface Transit {
  busStops: BusStop[];
  busRoutes: BusRoute[];
  trainStations: Station[];
  trainLines: RailLine[];
  subwayStations: Station[];
  subwayLines: RailLine[];
}

export interface BusStop {
  id: string;
  /** On the sidewalk of this edge. */
  edgeId: string;
  position: Vec2;
  districtId: string;
}

export interface BusRoute {
  id: string;
  /** Ordered stops served. */
  stopIds: string[];
  /** Ordered street edges the route drives, terminal to terminal. */
  edgeIds: string[];
}

export interface Station {
  id: string;
  position: Vec2;
  districtId: string;
  /** Street-level entrance points, each on a sidewalk. */
  entrances: Vec2[];
}

export interface RailLine {
  id: string;
  /** Ordered stations served. */
  stationIds: string[];
  /** Track centerline through all stations. */
  path: Polyline;
  /** True for subway lines and buried train segments. */
  underground: boolean;
}

/** Low poly city for map previews: one prism per parcel plus ground cover. */
export interface Volumetric {
  buildings: BuildingVolume[];
  ground: GroundSurface[];
}

export interface BuildingVolume {
  parcelId: string;
  footprint: Polygon;
  /** Representative height within the parcel envelope, meters. */
  height: number;
}

export interface GroundSurface {
  surface: 'roadway' | 'sidewalk' | 'block' | 'open';
  polygon: Polygon;
}

export interface CityStats {
  /** Estimated residents from residential capacity. */
  population: number;
  parcelCounts: Record<ParcelType, number>;
  perDistrict: DistrictStats[];
}

export interface DistrictStats {
  districtId: string;
  population: number;
  parcelCounts: Record<ParcelType, number>;
}

/** Closed error set. */
export type AtlasErrorCode = 'E_INVALID_PARAMS' | 'E_UNSATISFIABLE' | 'E_INVARIANT';

export interface AtlasErrorShape {
  code: AtlasErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
