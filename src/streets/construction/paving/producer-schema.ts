import type { District, GroundSurface, Polygon, Station, StreetGraph } from '../../../../schema/blueprint';
import type { StreetConstruction } from '../schema/sections';
import type { SourcePartition } from '../../../geom/partition/SourcePartition';
import type { PavingConstruction, PavingDesign } from './schema';

export interface PavingInput {
  ground: GroundSurface[];
  streets: Pick<StreetGraph, 'nodes' | 'edges' | 'crossings'> & { construction: StreetConstruction };
  districts: Pick<District, 'id' | 'boundary'>[];
  design: PavingDesign;
  stationBays?: { stationId: string; entranceIndex: number; footprint: Polygon }[];
}

export interface PavingOutput {
  ground: GroundSurface[];
  construction: PavingConstruction;
}

export interface PavingGroundOwner extends Pick<GroundSurface, 'surface' | 'bottom' | 'top'> {
  ownerId: string;
}

/** Runtime-only owned state. Numeric snapshots never replace this partition. */
export interface PavingGroundSource {
  partition: SourcePartition;
  boundary: Polygon;
  coordinateScale: 1000;
  owners: PavingGroundOwner[];
  excludedOwnerIds: string[];
}

export interface SharedPavingInput extends Omit<PavingInput, 'ground'> {
  /** District and station-bay polygons are authored 1 mm inputs; crossing landings retain exact source-edge construction. */
  groundSource: PavingGroundSource;
}

/** Serialized public city fields; neither source geometry nor certificates are retained. */
export interface PublishedPavingInput {
  meta: { boundary: Polygon };
  streets: Pick<StreetGraph, 'nodes' | 'edges' | 'construction'>;
  volumetric: { ground: GroundSurface[] };
  hydrology?: { bodies: { surfaces: Polygon[] }[] };
  transit: { trainStations: Pick<Station, 'id' | 'entranceBays'>[]; subwayStations: Pick<Station, 'id' | 'entranceBays'>[] };
}
