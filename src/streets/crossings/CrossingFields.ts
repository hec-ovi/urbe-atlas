import { FootprintIndex } from './Footprints';
import { Traffic } from './Traffic';
import type { CrossingInput, CrossingSourceInput } from './schema';

/** One planning or validation call owns these reusable geometry inputs. */
export class CrossingFields {
  readonly roadway: FootprintIndex;
  readonly pavement: FootprintIndex;
  readonly crossingGround: FootprintIndex;
  readonly obstacles: FootprintIndex;
  readonly reservations: Map<string, CrossingInput['reservations']['edges'][number]>;
  private readonly traffic: Traffic['byEdge'];
  private readonly own = new Map<string, FootprintIndex>();
  private readonly foreign = new Map<string, FootprintIndex>();
  private readonly terminals = new Map<string, FootprintIndex>();

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

  ownRoad(edgeId: string): FootprintIndex {
    let field = this.own.get(edgeId);
    if (!field) { field = new FootprintIndex(this.traffic.get(edgeId) ?? []); this.own.set(edgeId, field); }
    return field;
  }

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

  walking(edgeId: string, side: 'left' | 'right'): FootprintIndex {
    const key = `${edgeId}:${side}`;
    let field = this.terminals.get(key);
    if (!field) {
      field = new FootprintIndex(this.reservations.get(edgeId)!.sides[side].walking);
      this.terminals.set(key, field);
    }
    return field;
  }
}
