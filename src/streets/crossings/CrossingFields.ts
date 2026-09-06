import { FootprintIndex } from './Footprints';
import { Traffic } from './Traffic';
import type { CrossingInput, CrossingSourceInput } from './schema';
type SourceFields = Record<'roadway' | 'left' | 'right', FootprintIndex>;

/** One planning or validation call owns these reusable geometry inputs. */
export class CrossingFields {
  readonly roadway: FootprintIndex;
  readonly pavement: FootprintIndex;
  readonly crossingGround: FootprintIndex;
  readonly obstacles: FootprintIndex;
  readonly reservations: Map<string, CrossingInput['reservations']['edges'][number]>;
  private readonly traffic: Traffic['byEdge'];
  private readonly sources = new Map<string, SourceFields>();
  private readonly foreign = new Map<string, FootprintIndex>();

  constructor(input: CrossingSourceInput | CrossingInput) {
    const final = 'ground' in input ? input : undefined;
    const ground = final?.ground ?? [];
    this.roadway = new FootprintIndex(ground.filter(g => g.surface === 'roadway').map(g => g.polygon));
    this.pavement = new FootprintIndex(ground.filter(g => g.surface === 'curb' || g.surface === 'sidewalk').map(g => g.polygon));
    this.crossingGround = new FootprintIndex(ground.filter(g => ['roadway', 'curb', 'sidewalk'].includes(g.surface)).map(g => g.polygon));
    this.obstacles = new FootprintIndex(final?.obstacles ?? []);
    this.reservations = new Map(input.reservations.edges.map(edge => [edge.edgeId, edge]));
    this.traffic = new Traffic(input).byEdge;
  }

  source(edgeId: string): SourceFields {
    const sides = this.reservations.get(edgeId)?.sides;
    return { roadway: new FootprintIndex(this.traffic.get(edgeId) ?? []),
      left: new FootprintIndex(sides?.left.walking ?? []), right: new FootprintIndex(sides?.right.walking ?? []) };
  }

  ownRoad(edgeId: string): FootprintIndex { return this.retainedSource(edgeId).roadway; }
  walking(edgeId: string, side: 'left' | 'right'): FootprintIndex { return this.retainedSource(edgeId)[side]; }

  foreignRoads(edgeId: string, contactEdgeIds?: readonly string[]): FootprintIndex {
    if (contactEdgeIds) return new FootprintIndex([...new Set(contactEdgeIds)].filter(id => id !== edgeId)
      .flatMap(id => this.traffic.get(id) ?? []));
    let field = this.foreign.get(edgeId);
    if (!field) {
      field = new FootprintIndex([...this.traffic].filter(([id]) => id !== edgeId).flatMap(([, polygons]) => polygons));
      this.foreign.set(edgeId, field);
    }
    return field;
  }

  private retainedSource(edgeId: string): SourceFields {
    let source = this.sources.get(edgeId);
    if (!source) { source = this.source(edgeId); this.sources.set(edgeId, source); }
    return source;
  }
}
