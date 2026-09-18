/** The planar street graph shape the layout publishes: nodes, and edges between them. */
import type { Polyline, StreetClass, Vec2 } from '../../schema/blueprint';

export interface BuiltNode {
  id: string;
  position: Vec2;
  edgeIds: string[];
}

export interface BuiltEdge {
  id: string;
  class: StreetClass;
  from: string;
  to: string;
  path: Polyline;
}
