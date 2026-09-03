/** Post-generation coherence checks; any failure throws E_INVARIANT. */
import type { CityBlueprint } from '../../schema/blueprint';
import { invariantFailure } from '../errors';
import { COMPACT_RECT, coreFit } from '../zoning/core';
import { isHeavy, minBand } from '../zoning/bands';
import { minFloorHeight } from '../zoning/floorMinimums';
import { ALLEY_WIDTH, CURB_WIDTH } from '../streets/widths';
import { HIGHWAY_EXIT_TOLERANCE } from '../streets/Highways';
import { bandWidth, hostsBand } from '../geom/band';
import { area, distanceToOutline, isSimpleRing, pointInPolygon } from '../geom/polygon';
import { distanceTo } from '../geom/polyline';
import { checkGroundCover } from './groundCover';
import { checkStreetEdges } from './streetEdges';
import { checkStations } from './stations';
import { checkFurniture } from './furniture';
import { checkHighwayStructures } from './highways';
import { checkTransitClearance } from './transitClearance';
import { checkStreetElevations } from './elevations';
import { checkBusRouteTopology } from './routes';
import { checkCrossings } from './crossings';

/** Shortest run of kerb the generator ever publishes as its own piece, meters. */
const MIN_CURB_RUN = 0.5;

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
        (poly) => pointInPolygon(p.access.point, poly) || distanceToOutline(p.access.point, poly) < 0.75,
      );
      if (!onSidewalk) {
        throw invariantFailure(`parcel ${p.id} access point is not on its block sidewalk`, {
          point: p.access.point,
        });
      }
    }

    // footprints: the type's band end to end, core feasibility, one floor of the type's family
    for (const p of bp.parcels) {
      if (!hostsBand(p.footprint, minBand(p.type))) {
        throw invariantFailure(
          `parcel ${p.id} (${p.type}) keeps a ${bandWidth(p.footprint).toFixed(2)} m band, below the ${minBand(p.type)} m its type needs`,
        );
      }
      const fit = coreFit(p.footprint);
      if (isHeavy(p.type) && !fit.compact) {
        throw invariantFailure(
          `parcel ${p.id} (${p.type}) footprint cannot host the ${COMPACT_RECT.join('x')} m compact core`,
        );
      }
      if (fit.floorCap === 0) throw invariantFailure(`parcel ${p.id} footprint hosts no core rectangle`);
      if (p.envelope.maxFloors > fit.floorCap) {
        throw invariantFailure(`parcel ${p.id} has ${p.envelope.maxFloors} floors, over the ${fit.floorCap} its core allows`);
      }
      const minHeight = minFloorHeight(p.type);
      if (p.envelope.maxHeight < minHeight - 1e-6) {
        throw invariantFailure(
          `parcel ${p.id} (${p.type}) allows ${p.envelope.maxHeight} m, below the ${minHeight} m minimum floor of its family`,
        );
      }
    }

    // street edges: no degenerate run, no centerline folded over its own band
    checkStreetEdges(bp);
    checkStreetElevations(bp);
    checkHighwayStructures(bp);

    // sidewalk presence along streets and roads
    for (const e of bp.streets.edges) {
      if (e.class !== 'highway' && (e.sidewalk.left <= 0 || e.sidewalk.right <= 0)) {
        throw invariantFailure(`edge ${e.id} (${e.class}) is missing a sidewalk`);
      }
    }

    // highways are through routes: an end is a junction with another highway
    // or a point at the city edge, never a deck stopping over a block
    const highwayEnds = new Map<string, number>();
    for (const e of bp.streets.edges) {
      if (e.class !== 'highway') continue;
      highwayEnds.set(e.from, (highwayEnds.get(e.from) ?? 0) + 1);
      highwayEnds.set(e.to, (highwayEnds.get(e.to) ?? 0) + 1);
    }
    const nodeById = new Map(bp.streets.nodes.map((n) => [n.id, n]));
    for (const [nodeId, count] of highwayEnds) {
      if (count !== 1) continue;
      const node = nodeById.get(nodeId);
      if (!node) throw invariantFailure(`highway end references missing node ${nodeId}`);
      const d = distanceToOutline(node.position, bp.meta.boundary);
      if (d > HIGHWAY_EXIT_TOLERANCE) {
        throw invariantFailure(`highway dead-ends ${d.toFixed(1)} m inside the city at ${nodeId}`, {
          node: node.position,
        });
      }
    }

    // alleys: no carriageway, a sidewalk-only band, no vehicle traffic
    const alleyIds = new Set(bp.streets.edges.filter((e) => e.class === 'alley').map((e) => e.id));
    for (const id of alleyIds) {
      const e = edgeById.get(id)!;
      if (e.width !== 0) throw invariantFailure(`alley ${e.id} has a ${e.width} m carriageway`);
      const width = e.sidewalk.left + e.sidewalk.right;
      if (width < ALLEY_WIDTH[0] - 1e-9 || width > ALLEY_WIDTH[1] + 1e-9) {
        throw invariantFailure(`alley ${e.id} is ${width} m wide, outside ${ALLEY_WIDTH[0]}-${ALLEY_WIDTH[1]} m`);
      }
    }
    for (const s of bp.transit.busStops) {
      if (alleyIds.has(s.edgeId)) throw invariantFailure(`bus stop ${s.id} stands on alley ${s.edgeId}`);
    }
    for (const r of bp.transit.busRoutes) {
      for (const id of r.edgeIds) {
        if (alleyIds.has(id)) throw invariantFailure(`bus route ${r.id} drives through alley ${id}`);
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
    checkBusRouteTopology(bp);
    checkCrossings(bp);
    checkRailNetwork(bp.transit.subwayStations, bp.transit.subwayLines, 'subway');
    checkRailNetwork(bp.transit.trainStations, bp.transit.trainLines, 'train');
    checkStations(bp);
    checkTransitClearance(bp);
    checkFurniture(bp);

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
    if (f.alleys === false && alleyIds.size > 0) throw invariantFailure('alleys disabled but alley edges exist');

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
    // and they tile it: no two ground surfaces overlap
    checkGroundCover(bp);

    // per-block: valid rings, and lots + open areas within the interior area
    for (const b of bp.blocks) {
      if (!isSimpleRing(b.boundary)) throw invariantFailure(`block ${b.id} boundary is not a simple ring`);
      for (const poly of b.sidewalk) {
        if (!isSimpleRing(poly)) throw invariantFailure(`block ${b.id} has a sidewalk polygon that is not a simple ring`);
      }
      // a kerb piece is a run of strip, never a sliver left by a boolean
      for (const poly of b.curb) {
        if (!isSimpleRing(poly)) throw invariantFailure(`block ${b.id} has a curb polygon that is not a simple ring`);
        if (area(poly) < CURB_WIDTH * MIN_CURB_RUN) {
          throw invariantFailure(`block ${b.id} has a curb sliver`, { area: area(poly) });
        }
      }
      const paved = [...b.sidewalk, ...b.curb].reduce((s, poly) => s + area(poly), 0);
      const interior = area(b.boundary) - paved;
      const parts = bp.parcels.filter((p) => p.blockId === b.id).reduce((s, p) => s + area(p.lot), 0)
        + b.openAreas.reduce((s, poly) => s + area(poly), 0);
      if (parts > interior * 1.05 + 30) {
        throw invariantFailure(`block ${b.id} lots+open exceed its interior`, { interior, parts });
      }
    }
  }
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
    if (label === 'subway') {
      const first = stations.find((station) => station.id === l.stationIds[0])!;
      const last = stations.find((station) => station.id === l.stationIds[l.stationIds.length - 1])!;
      for (const [station, endpoint, end] of [
        [first, l.path[0], 'start'],
        [last, l.path[l.path.length - 1], 'end'],
      ] as const) {
        if (!pointInPolygon(endpoint, station.platform) && distanceToOutline(endpoint, station.platform) > 1e-6) {
          throw invariantFailure(`${label} line ${l.id} ${end} leaves terminal platform ${station.id}`, { endpoint });
        }
      }
    }
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
