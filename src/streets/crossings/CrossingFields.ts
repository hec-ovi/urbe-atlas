import { FootprintIndex } from './Footprints';
import { Traffic } from './Traffic';
import type { CrossingInput } from './schema';

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

  constructor(input: CrossingInput) {
    this.roadway = new FootprintIndex(input.ground.filter(g => g.surface === 'roadway').map(g => g.polygon));
    this.pavement = new FootprintIndex(input.ground.filter(g => g.surface === 'curb' || g.surface === 'sidewalk').map(g => g.polygon));
    this.crossingGround = new FootprintIndex(input.ground.filter(g => ['roadway', 'curb', 'sidewalk'].includes(g.surface)).map(g => g.polygon));
    this.obstacles = new FootprintIndex(input.obstacles ?? []);
    this.reservations = new Map(input.reservations.edges.map(edge => [edge.edgeId, edge]));
    this.traffic = new Traffic(input).byEdge;
  }

  ownRoad(edgeId: string): FootprintIndex {
    let field = this.own.get(edgeId);
    if (!field) { field = new FootprintIndex(this.traffic.get(edgeId) ?? []); this.own.set(edgeId, field); }
    return field;
  }

  foreignRoads(edgeId: string): FootprintIndex {
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
