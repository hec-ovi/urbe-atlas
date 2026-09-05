import type { Polygon, StreetEdge } from '../../../schema/blueprint';
import type { StreetDesign } from '../construction/schema/design';

export interface StreetDomainInput {
  boundary: Polygon;
  design: StreetDesign;
  highways: boolean;
  alleys: boolean;
}

export interface StreetDomainPlan {
  boundary: Polygon;
  clearance: number;
}

export interface StreetDomainState {
  meta: { boundary: Polygon };
  streets: { edges: StreetEdge[] };
}
