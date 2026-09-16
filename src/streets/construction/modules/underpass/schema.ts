import type { Polygon } from '../../../../../schema/blueprint';
import type { ModuleDefinition, ModuleFormat } from '../schema';

export interface UnderpassInput {
  /** Omission selects the source construction dimensions. */
  format?: ModuleFormat;
  /** Physical paved widths and corner returns, including the district separator. */
  startWidth: number;
  endWidth: number;
  startReturn: number;
  endReturn: number;
  /** Elevated carriageway width: whole metres for source, 0.2 m increments for district. */
  span: number;
}

export interface UnderpassTemplate {
  definition: ModuleDefinition;
  boundary: Polygon;
}
