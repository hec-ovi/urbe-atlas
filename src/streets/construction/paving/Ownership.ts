import type { Polygon, StreetEdge, Vec2 } from '../../../../schema/blueprint';
import { intersection, union } from '../../../geom/clip';
import { invariantFailure } from '../../../errors';
import { StreetCorridors } from '../StreetCorridors';
import { CrossingPlanner } from '../../crossings/CrossingPlanner';
import { edgeMaskView } from '../../../geom/partition/EdgeMasks';
import type { PartitionEdgeMask, PartitionEncoding } from '../../../geom/partition/schema';
import { BANDS } from './Design';
import { bounds, rectangle, type Bounds } from './Geometry';
import type { PavingInput } from './producer-schema';
import type { PavingFrame, PavingOwner, PavingRegion, PavingRole } from './schema';

export interface Field {
  owner: PavingOwner;
  band: PavingRegion['band'];
  frame: Omit<PavingFrame, 'id'>;
  polygons: Polygon[];
  bounds: Bounds;
  fit: boolean;
  role: PavingRole;
  across?: { width: number; direction: 1 | -1 };
  tangents?: Field[];
  encoding: PartitionEncoding;
  edgeMasks?: PartitionEdgeMask[];
}

const aligned = (origin: Vec2, u: Vec2): Omit<PavingFrame, 'id'> => ({ origin, u, gridStep: 0.001 });

function field(owner: PavingOwner, band: Field['band'], frame: Field['frame'], polygons: Polygon[], fit: boolean,
  role: PavingRole, across?: Field['across'], encoding: PartitionEncoding = 'authored-1mm'): Field {
  return { owner, band, frame, polygons, bounds: bounds(polygons), fit, role, encoding, ...(across ? { across } : {}) };
}

export class Ownership {
  readonly fields: Field[] = [];
  private readonly edgeById: Map<string, StreetEdge>;

  constructor(private readonly input: Omit<PavingInput, 'ground'>, shared = false) {
    this.edgeById = new Map(input.streets.edges.map(edge => [edge.id, edge]));
    const nodes = input.streets.nodes.slice().sort((a, b) => a.id.localeCompare(b.id));
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    for (const bay of (input.stationBays ?? []).slice().sort((a, b) => a.stationId.localeCompare(b.stationId) || a.entranceIndex - b.entranceIndex)) {
      const a = bay.footprint[0], b = bay.footprint[1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!length) throw invariantFailure('paving station bay has a zero-length edge');
      this.fields.push(field({ kind: 'station-bay', stationId: bay.stationId, entranceIndex: bay.entranceIndex },
        'circulation', aligned(a, [(b[0] - a[0]) / length, (b[1] - a[1]) / length]), [bay.footprint], false, 'approach'));
    }
    if (shared && input.streets.crossings.length && !input.streets.construction.junctions) {
      throw invariantFailure('shared paving requires authoritative crossing approaches');
    }
    for (const junction of shared ? input.streets.construction.junctions ?? [] : []) {
      for (const approach of junction.approaches) {
        const node = nodeById.get(approach.nodeId), edge = this.edgeById.get(approach.edgeId);
        if (!node || !edge || !node.edgeIds.includes(edge.id)) throw invariantFailure('paving approach references an unknown arm');
        const construction = CrossingPlanner.construction(edge, { distance: approach.distance });
        const views: [PartitionEdgeMask, Polygon][] = [[construction.field, approach.field],
          [construction.landings.left, approach.landings.left], [construction.landings.right, approach.landings.right],
          [construction.walkingLandings.left, approach.walkingLandings.left],
          [construction.walkingLandings.right, approach.walkingLandings.right]];
        for (const [mask, polygon] of views) {
          const view = edgeMaskView({ mask, encoding: 'authored-1mm' });
          if (!Array.isArray(polygon) || polygon.length !== view.length
            || view.some((point, index) => !Array.isArray(polygon[index]) || polygon[index].length !== 2
              || point.some((value, axis) => value !== polygon[index][axis]))) {
            throw invariantFailure('paving approach view disagrees with its source construction', { edgeId: edge.id });
          }
        }
        const [a, b] = approach.walkingLandings.left;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!length) throw invariantFailure('paving approach has a zero-length station interval');
        const landing = field({ kind: 'junction', nodeId: node.id, edgeIds: node.edgeIds.slice().sort() },
          'circulation', aligned(a, [(b[0] - a[0]) / length, (b[1] - a[1]) / length]),
          [approach.landings.left, approach.landings.right], false, 'approach');
        landing.edgeMasks = [construction.landings.left, construction.landings.right];
        this.fields.push(landing);
      }
    }
    for (const crossing of shared ? [] : input.streets.crossings.slice().sort((a, b) => a.nodeId.localeCompare(b.nodeId))) {
      const node = nodeById.get(crossing.nodeId);
      if (!node) throw invariantFailure('paving crossing references an unknown junction');
      for (const segment of crossing.segments.slice().sort((a, b) => a.edgeId.localeCompare(b.edgeId))) {
        const edge = this.edgeById.get(segment.edgeId);
        if (!edge || !node.edgeIds.includes(edge.id)) throw invariantFailure('paving crossing references an unknown arm');
        const length = Math.hypot(segment.to[0] - segment.from[0], segment.to[1] - segment.from[1]);
        if (!length) throw invariantFailure('paving crossing has a zero-length approach');
        const u: Vec2 = [(segment.to[0] - segment.from[0]) / length, (segment.to[1] - segment.from[1]) / length];
        this.fields.push(field({ kind: 'junction', nodeId: node.id, edgeIds: node.edgeIds.slice().sort() },
          'circulation', aligned(node.position, u), [rectangle(segment.from, segment.to, -segment.width / 2, segment.width / 2)], false, 'crossing-field', undefined, 'binary'));
      }
    }
    const sidewalk = new Map<string, Polygon[]>();
    for (const edge of input.streets.edges) if (edge.crossSection) {
      sidewalk.set(edge.id, [...StreetCorridors.sidewalk(edge, 'left'), ...StreetCorridors.sidewalk(edge, 'right')]);
    }
    for (const node of nodes) {
      const incident = node.edgeIds.map(id => this.edgeById.get(id)).filter((edge): edge is StreetEdge => !!edge?.crossSection);
      const shared: Polygon[] = [];
      for (let a = 0; a < incident.length; a++) for (let b = a + 1; b < incident.length; b++) {
        if (incident[a].crossSection!.runId !== incident[b].crossSection!.runId) {
          shared.push(...intersection(sidewalk.get(incident[a].id)!, sidewalk.get(incident[b].id)!));
        }
      }
      if (shared.length) this.fields.push(field({ kind: 'junction', nodeId: node.id, edgeIds: incident.map(edge => edge.id).sort() },
        'circulation', aligned(node.position, [1, 0]), union(shared), false, 'corner-infill'));
    }
    const bandFields = new Map<string, Field[]>(BANDS.map(band => [band, []]));
    for (const run of input.streets.construction.runs.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      for (const member of run.edges) {
        const edge = this.edgeById.get(member.edgeId)!;
        if (!edge.crossSection) continue;
        const segments: { a: Vec2; b: Vec2; length: number; distance: number }[] = [];
        let distance = 0;
        for (let i = 1; i < edge.path.length; i++) {
          const a = edge.path[i - 1], b = edge.path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (!length) throw invariantFailure('paving street contains a zero-length segment');
          segments.push({ a, b, length, distance });
          distance += length;
        }
        const stations = segments.map((segment, index) => index === 0 ? (member.forward ? member.start : member.end)
          : member.forward ? member.start + segment.distance : member.end - segment.distance);
        stations.push(member.forward ? member.end : member.start);
        for (const side of ['left', 'right'] as const) {
          const sign = side === 'left' ? 1 : -1;
          let inner = edge.width / 2;
          for (const band of BANDS) {
            const width = edge.crossSection.sidewalks[side].bands[band], outer = inner + width;
            if (width > 0) {
              const whole = StreetCorridors.band(edge, side, band);
              const target = bandFields.get(band)!;
              const across = { width, direction: (member.forward ? sign : -sign) as 1 | -1 };
              const tangents: Field[] = [];
              let firstFrame: Field['frame'] | undefined;
              for (const [index, segment] of segments.entries()) {
                const direction: Vec2 = [(segment.b[0] - segment.a[0]) / segment.length, (segment.b[1] - segment.a[1]) / segment.length];
                const u: Vec2 = member.forward ? direction : [-direction[0], -direction[1]];
                const station = stations[index];
                const origin: Vec2 = [segment.a[0] - direction[1] * sign * inner - u[0] * station,
                  segment.a[1] + direction[0] * sign * inner - u[1] * station];
                const frame = aligned(origin, u);
                firstFrame ??= frame;
                const end = stations[index + 1];
                const mask = rectangle(segment.a, segment.b, Math.min(sign * inner, sign * outer), Math.max(sign * inner, sign * outer));
                // These tangent intents are authored here, never copied from a published boundary.
                if (shared) for (const point of mask) for (const axis of [0, 1] as const) point[axis] = Math.round(point[axis] * 1000) / 1000;
                tangents.push(field({ kind: 'run', runId: run.id, edgeId: edge.id, side,
                  station: [Math.min(station, end), Math.max(station, end)] }, band, frame, [mask], true,
                band === 'curb' || band === 'border' ? band : 'corner-infill', across));
              }
              if (firstFrame) {
                const parent = field({ kind: 'run', runId: run.id, edgeId: edge.id, side,
                  station: [member.start, member.end] }, band, firstFrame, whole, false,
                band === 'curb' || band === 'border' ? band : 'corner-infill', across);
                parent.tangents = tangents;
                target.push(parent);
              }
            }
            inner = outer;
          }
        }
      }
    }
    // Circulation owns conflicts before any furnishing reservation can claim them.
    for (const band of ['walking', 'curb', 'border', 'frontage', 'furnishing']) this.fields.push(...bandFields.get(band)!);
  }

  residual(polygon: Polygon): Field {
    const center: Vec2 = [polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length,
      polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length];
    const node = this.input.streets.nodes.slice().sort((a, b) => {
      const distance = (p: Vec2) => (p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2;
      return distance(a.position) - distance(b.position) || a.id.localeCompare(b.id);
    })[0];
    return field({ kind: 'junction', nodeId: node.id, edgeIds: node.edgeIds.slice().sort() },
      'circulation', aligned(node.position, [1, 0]), [polygon], false, 'corner-infill');
  }
}
