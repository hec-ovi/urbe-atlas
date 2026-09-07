import type { Polygon, Polyline, Transit, Vec2 } from '../../schema/blueprint';
import type { Rng } from '../core/rng';
import type { PlannedDistrict } from '../districts/DistrictPlanner';

export type SubwayPlan = Pick<Transit, 'subwayStations' | 'subwayLines' | 'subwayDemand'>;
export interface SubwayOptions {
  districts: PlannedDistrict[];
  districtOfNode: (nodeId: string) => number;
  cityCenter: Vec2;
  boundary: Polygon;
  populationEstimate: number;
  entranceObstacles: Polygon[];
  /** Actual unavailable platform land; the full platform polygon is checked against it. */
  stationExclusion?: Polygon[];
  rng: Rng;
}

export interface SubwayRouting {
  nearest(point: Vec2, minimumArms?: number): { id: string; position: Vec2 };
  path(fromId: string, toId: string): Polyline | null;
}
