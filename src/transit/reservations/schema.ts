import type { CityBlueprint, GroundSurface, Polygon, Polyline, Vec2 } from '../../../schema/blueprint';
import type { SectionedStreetEdge } from '../../streets/construction/schema/sections';
import type { StreetSide } from '../../streets/construction/SidewalkSection';

export interface EntranceBay {
  edgeId: string;
  side: StreetSide;
  /** Metres from the first point of the directed edge path. */
  distance: number;
  /** Complete reserved land, including apron and sidewalk connection. */
  footprint: Polygon;
  /** Fixed-size stair construction footprint inside the apron. */
  shaft: Polygon;
  /** Ground-level walk from the sidewalk walking band to the shaft entrance. */
  approach: Polyline;
}

export interface BayPlace {
  point: Vec2;
  direction: Vec2;
  bay: EntranceBay;
}

export interface EntranceBayInput {
  edges: readonly SectionedStreetEdge[];
  boundary: Polygon;
  /** Water, highway structure clearance and other unavailable land. */
  obstacles: Polygon[];
}

export interface StationEntranceState {
  meta: Pick<CityBlueprint['meta'], 'boundary'>;
  streets: Pick<CityBlueprint['streets'], 'edges'>;
  parcels: Pick<CityBlueprint['parcels'][number], 'lot'>[];
  transit: Pick<CityBlueprint['transit'], 'subwayStations'>;
  volumetric: { ground: GroundSurface[] };
}
