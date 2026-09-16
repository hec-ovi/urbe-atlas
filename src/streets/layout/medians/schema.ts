import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import type { ModuleDefinition, ModuleFrontage, ModulePlacement } from '../../construction/modules/schema';
import type { LayoutFrontage } from '../schema';

export interface AvenueMedian {
  id: string;
  edgeId: string;
  start: number;
  end: number;
  width: 3.4;
  pavedWidth: 2;
  curbWidth: 0.2;
  gutterWidth: 0.5;
  footprint: Polygon;
  paving: Polygon;
  ornaments: { kind: 'tree' | 'pole'; position: Vec2 }[];
}

export interface MedianConstruction {
  medians: AvenueMedian[];
  definitions: ModuleDefinition[];
  placements: ModulePlacement[];
  owners: ModuleFrontage[];
  frontages: LayoutFrontage[];
}
