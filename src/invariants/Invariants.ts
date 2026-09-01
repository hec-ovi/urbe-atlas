/** Post-generation coherence checks; any failure throws E_INVARIANT. */
import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import {
  CORE_DEPTH,
  CORE_WIDTH,
  NO_CORE_MAX_FLOORS,
  WALKUP_CORE_DEPTH,
  WALKUP_CORE_WIDTH,
  fitsCore,
  fitsWalkupCore,
} from '../zoning/core';
import { minFloorHeight } from '../zoning/floorMinimums';
import { area, pointInPolygon } from '../geom/polygon';
import { distanceTo } from '../geom/polyline';
import { closestOnSegment, dist } from '../geom/vec';

export class Invariants {
  static check(bp: CityBlueprint): void {
    // ids globally unique
    const ids = new Set<string>();
    const claim = (id: string): void => {
      if (ids.has(id)) throw invariantFailure(`duplicate id ${id}`);
      ids.add(id);
    };
    for (const d of bp.districts) claim(d.id);
    for (const n of bp.streets.nodes) claim(n.id);
    for (const e of bp.streets.edges) claim(e.id);
    for (const b of bp.blocks) claim(b.id);
    for (const p of bp.parcels) claim(p.id);
    for (const s of bp.transit.busStops) claim(s.id);
    for (const r of bp.transit.busRoutes) claim(r.id);
    for (const s of [...bp.transit.trainStations, ...bp.transit.subwayStations]) claim(s.id);
    for (const l of [...bp.transit.trainLines, ...bp.transit.subwayLines]) claim(l.id);

    // street graph connected
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      return r;
    };
    for (const n of bp.streets.nodes) parent.set(n.id, n.id);
    for (const e of bp.streets.edges) parent.set(find(e.from), find(e.to));
    const roots = new Set(bp.streets.nodes.map((n) => find(n.id)));
    if (roots.size > 1) throw invariantFailure(`street graph has ${roots.size} components`);

    // parcels: valid refs, access point on a sidewalk of the block
    const edgeById = new Map(bp.streets.edges.map((e) => [e.id, e]));
    const blockById = new Map(bp.blocks.map((b) => [b.id, b]));
    for (const p of bp.parcels) {
      const edge = edgeById.get(p.access.edgeId);
      if (!edge) throw invariantFailure(`parcel ${p.id} access edge ${p.access.edgeId} missing`);
      const block = blockById.get(p.blockId);
      if (!block) throw invariantFailure(`parcel ${p.id} block ${p.blockId} missing`);
      const onSidewalk = block.sidewalk.some(
        (poly) => pointInPolygon(p.access.point, poly) || distToOutline(p.access.point, poly) < 0.75,
      );
      if (!onSidewalk) {
        throw invariantFailure(`parcel ${p.id} access point is not on its block sidewalk`, {
          point: p.access.point,
        });
      }
    }

    // envelopes: core feasibility and one floor of the type's family
    for (const p of bp.parcels) {
      if (!fitsWalkupCore(p.footprint)) {
        throw invariantFailure(
          `parcel ${p.id} footprint cannot host the ${WALKUP_CORE_WIDTH}x${WALKUP_CORE_DEPTH} m walkup core`,
        );
      }
      if (p.envelope.maxFloors > NO_CORE_MAX_FLOORS && !fitsCore(p.footprint)) {
        throw invariantFailure(
          `parcel ${p.id} has ${p.envelope.maxFloors} floors but its footprint cannot host the ${CORE_WIDTH}x${CORE_DEPTH} m core`,
        );
      }
      const minHeight = minFloorHeight(p.type);
      if (p.envelope.maxHeight < minHeight - 1e-6) {
        throw invariantFailure(
          `parcel ${p.id} (${p.type}) allows ${p.envelope.maxHeight} m, below the ${minHeight} m minimum floor of its family`,
        );
      }
    }

    // sidewalk presence along streets and roads
    for (const e of bp.streets.edges) {
      if (e.class !== 'highway' && (e.sidewalk.left <= 0 || e.sidewalk.right <= 0)) {
        throw invariantFailure(`edge ${e.id} (${e.class}) is missing a sidewalk`);
      }
    }

    // transit membership and rail connectivity
    const usedStops = new Set(bp.transit.busRoutes.flatMap((r) => r.stopIds));
    for (const s of bp.transit.busStops) {
      if (!usedStops.has(s.id)) throw invariantFailure(`bus stop ${s.id} belongs to no route`);
      const edge = edgeById.get(s.edgeId);
      if (!edge) throw invariantFailure(`bus stop ${s.id} references missing edge`);
      const d = distanceTo(edge.path, s.position);
      const maxSw = Math.max(edge.sidewalk.left, edge.sidewalk.right);
      if (d < edge.width / 2 - 0.5 || d > edge.width / 2 + maxSw + 0.5) {
        throw invariantFailure(`bus stop ${s.id} is not on its edge sidewalk band`, { distance: d });
      }
    }
    // station entrances sit in a sidewalk band beside some street or road
    const sidewalked = bp.streets.edges.filter((e) => e.sidewalk.left > 0 || e.sidewalk.right > 0);
    for (const st of [...bp.transit.trainStations, ...bp.transit.subwayStations]) {
      for (const entrance of st.entrances) {
        const ok = sidewalked.some((e) => {
          const d = distanceTo(e.path, entrance);
          return d >= e.width / 2 - 0.5 && d <= e.width / 2 + Math.max(e.sidewalk.left, e.sidewalk.right) + 0.5;
        });
        if (!ok) throw invariantFailure(`station ${st.id} entrance is not on a sidewalk band`, { entrance });
      }
    }
    for (const r of bp.transit.busRoutes) {
      if (r.stopIds.length < 2) throw invariantFailure(`bus route ${r.id} serves fewer than 2 stops`);
      for (const id of r.edgeIds) {
        if (!edgeById.has(id)) throw invariantFailure(`bus route ${r.id} references missing edge ${id}`);
      }
    }
    checkRailNetwork(bp.transit.subwayStations, bp.transit.subwayLines, 'subway');
    checkRailNetwork(bp.transit.trainStations, bp.transit.trainLines, 'train');

    // feature toggles respected
    const f = bp.meta.params.features;
    if (f.highways === false && bp.streets.edges.some((e) => e.class === 'highway')) {
      throw invariantFailure('highways disabled but highway edges exist');
    }
    if (f.subways === false && (bp.transit.subwayLines.length > 0 || bp.transit.subwayStations.length > 0)) {
      throw invariantFailure('subways disabled but subway entities exist');
    }
    if (f.trains === false && (bp.transit.trainLines.length > 0 || bp.transit.trainStations.length > 0)) {
      throw invariantFailure('trains disabled but train entities exist');
    }

    // ground coverage: surfaces fill the city with no gaps beyond tolerance
    const cityArea = area(bp.meta.boundary);
    let covered = 0;
    for (const g of bp.volumetric.ground) covered += area(g.polygon);
    if (covered < cityArea * 0.96) {
      throw invariantFailure(`ground covers ${(100 * covered) / cityArea | 0}% of the city (<96%)`, {
        cityArea,
        covered,
      });
    }

    // per-block containment: lots + open areas stay within the interior area
    for (const b of bp.blocks) {
      const interior = area(b.boundary) - b.sidewalk.reduce((s, poly) => s + area(poly), 0);
      const parts = bp.parcels.filter((p) => p.blockId === b.id).reduce((s, p) => s + area(p.lot), 0)
        + b.openAreas.reduce((s, poly) => s + area(poly), 0);
      if (parts > interior * 1.05 + 30) {
        throw invariantFailure(`block ${b.id} lots+open exceed its interior`, { interior, parts });
      }
    }
  }
}

function distToOutline(p: [number, number], poly: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const { point } = closestOnSegment(p, a, b);
    best = Math.min(best, dist(p, point));
  }
  return best;
}

function checkRailNetwork(
  stations: CityBlueprint['transit']['trainStations'],
  lines: CityBlueprint['transit']['trainLines'],
  label: string,
): void {
  if (stations.length === 0 && lines.length === 0) return;
  const inLine = new Set(lines.flatMap((l) => l.stationIds));
  for (const s of stations) {
    if (!inLine.has(s.id)) throw invariantFailure(`${label} station ${s.id} is on no line`);
  }
  for (const l of lines) {
    for (const id of l.stationIds) {
      if (!stations.some((s) => s.id === id)) throw invariantFailure(`${label} line ${l.id} references missing station ${id}`);
    }
    if (l.stationIds.length < 2) throw invariantFailure(`${label} line ${l.id} serves fewer than 2 stations`);
  }
  // network connected: stations linked when they share a line
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const s of stations) parent.set(s.id, s.id);
  for (const l of lines) {
    for (let i = 1; i < l.stationIds.length; i++) {
      parent.set(find(l.stationIds[i - 1]), find(l.stationIds[i]));
    }
  }
  const roots = new Set(stations.map((s) => find(s.id)));
  if (roots.size > 1) throw invariantFailure(`${label} network has ${roots.size} components`);
}
