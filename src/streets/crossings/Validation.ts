import type { CrossingSegment, StreetEdge } from '../../../schema/blueprint';
import { invariantFailure } from '../../errors';
import { isCrossingArm } from './Eligibility';
import { approachGeometry } from './ApproachGeometry';
import { CROSSING_DIMENSIONS, CrossingFrame, FootprintIndex } from './Footprints';
import { ContactDomains } from './ContactDomains';
import { Traffic } from './Traffic';
import type { CrossingInput, CrossingValidationPlan, JunctionApproach } from './schema';

export function validateCrossingPlan(input: CrossingInput, plan: CrossingValidationPlan): void {
  const fail = (message: string, details?: Record<string, unknown>): never => { throw invariantFailure(`crossing construction ${message}`, details); };
  const contacts = ContactDomains.plan(input);
  const groups = new Map(contacts.domains.flatMap(domain => domain.groups.map(group => [group.id, group] as const)));
  const edges = new Map(input.edges.map((e) => [e.id, e]));
  const reservations = new Map(input.reservations.edges.map((e) => [e.edgeId, e]));
  const roads = input.edges.filter(isCrossingArm);
  const traffic = new Traffic(input).byEdge;
  const roadway = new FootprintIndex(input.ground.filter((g) => g.surface === 'roadway').map((g) => g.polygon));
  const pavement = new FootprintIndex(input.ground.filter((g) => g.surface === 'curb' || g.surface === 'sidewalk').map((g) => g.polygon));
  const crossingGround = new FootprintIndex(input.ground.filter((g) => ['roadway', 'curb', 'sidewalk'].includes(g.surface)).map((g) => g.polygon));
  const obstacles = new FootprintIndex(input.obstacles ?? []);
  const groupOwners = new Map<string, string>();
  const usedJunctions = new Set<string>();
  const usedSegments = new Set<string>();
  const fields: JunctionApproach[] = [];
  for (const junction of plan.junctions) {
    if (usedJunctions.has(junction.id)) fail('repeats a junction id');
    usedJunctions.add(junction.id);
    for (const groupId of junction.groupIds) {
      if (!groups.has(groupId) || groupOwners.has(groupId)) fail('has an invalid or repeated source group', { groupId });
      groupOwners.set(groupId, junction.id);
    }
    const expectedNodes = [...new Set(junction.groupIds.map((id) => groups.get(id)!.nodeId))].sort();
    if (!equal(junction.nodeIds, expectedNodes)) fail('changes source node ownership');
    const domain = contacts.domains.find(domain => domain.groups.some(group => group.id === junction.groupIds[0]));
    if (!domain || !domain.groups.some(group => group.junction)
      || !equal(junction.groupIds, domain.groups.map(group => group.id))) fail('changes the source contact domain');
    const internal = new Set(junction.internalEdgeIds);
    if (internal.size !== junction.internalEdgeIds.length) fail('repeats an internal edge');
    for (const edgeId of internal) {
      const edge = edges.get(edgeId);
      if (!edge || !isCrossingArm(edge)) fail('has an invalid internal edge', { edgeId });
      if (!domain!.internalEdgeIds.includes(edgeId)) fail('internal edge changes original connections', { edgeId });
    }
    const approaches = new Map<string, JunctionApproach>();
    for (const approach of junction.approaches) {
      const key = `${approach.groupId}:${approach.edgeId}`;
      if (internal.has(approach.edgeId)) fail('places an approach on an internal edge', { key });
      if (approaches.has(key)) fail('repeats an approach', { key });
      approaches.set(key, approach);
      const group = groups.get(approach.groupId), edge = edges.get(approach.edgeId);
      if (!group || !edge || !junction.groupIds.includes(group.id)
        || !group.pedestrianEdgeIds.includes(edge.id) || group.nodeId !== approach.nodeId) fail('approach changes source incidence', { key });
      const segment = plan.crossings.filter((c) => c.nodeId === approach.nodeId && c.junctionId === junction.id)
        .flatMap((c) => c.segments).filter((s) => s.edgeId === approach.edgeId);
      if (segment.length !== 1) fail('approach must publish one marking set', { key });
      usedSegments.add(`${junction.id}:${approach.nodeId}:${approach.edgeId}`);
      verifyGeometry(edge!, approach, segment[0]);
      const own = reservations.get(edge!.id);
      const ownRoad = new FootprintIndex(traffic.get(edge!.id) ?? []);
      if (!own || !roadway.covers(approach.field) || !ownRoad.covers(approach.field)) fail('field leaves its grade carriageway', {
        key, field: approach.field, distance: approach.distance,
        ownsGround: roadway.covers(approach.field), ownsSource: ownRoad.covers(approach.field),
      });
      if (!crossingGround.covers(approach.landings.left) || !crossingGround.covers(approach.landings.right)) fail('connector leaves crossing ground', { key });
      for (const side of ['left', 'right'] as const) {
        if (!pavement.covers(approach.walkingLandings[side])
          || !new FootprintIndex(own!.sides[side].walking).covers(approach.walkingLandings[side])) fail('terminal leaves its pedestrian walking band', { key, side });
      }
      const otherRoads = new FootprintIndex([...traffic].filter(([id]) => id !== edge!.id).flatMap(([, polygons]) => polygons));
      if (otherRoads.overlapsArea(approach.field)) fail('field enters intersecting traffic', { key, field: approach.field });
      for (const polygon of [approach.field, approach.landings.left, approach.landings.right, approach.walkingLandings.left, approach.walkingLandings.right]) {
        if (obstacles.intersects(polygon) || otherRoads.intersects(polygon)) fail('approach enters intersecting traffic or physical structure', { key, polygon });
      }
      fields.push(approach);
    }
    for (const edge of roads) {
      if (domain!.internalEdgeIds.includes(edge.id) && !internal.has(edge.id)) fail('omits an internal edge', { edgeId: edge.id });
    }
    for (const arm of domain!.arms) {
      if (arm.crossing && !approaches.has(`${arm.groupId}:${arm.edgeId}`)) fail('omits an external approach', { edgeId: arm.edgeId });
    }
  }
  for (const group of groups.values()) {
    if (group.junction && group.pedestrianEdgeIds.some((id) => isCrossingArm(edges.get(id)!))
      && !groupOwners.has(group.id)) fail('omits a source contact group', { groupId: group.id });
  }
  let segmentCount = 0;
  for (const crossing of plan.crossings) for (const segment of crossing.segments) {
    segmentCount++;
    if (!usedSegments.has(`${crossing.junctionId}:${crossing.nodeId}:${segment.edgeId}`)) fail('publishes an unowned marking set');
  }
  if (segmentCount !== usedSegments.size) fail('duplicates a marking set');
  for (let i = 0; i < fields.length; i++) {
    const following = fields.slice(i + 1);
    if (new FootprintIndex(following.map((a) => a.field)).overlapsArea(fields[i].field)) fail('fields overlap', {
      first: fields[i], others: following.filter(other => new FootprintIndex([other.field]).overlapsArea(fields[i].field)),
    });
  }
}

function verifyGeometry(edge: StreetEdge, approach: JunctionApproach, segment: CrossingSegment): void {
  let offset = 0;
  for (let i = 1; i < edge.path.length; i++) {
    const frame = new CrossingFrame(edge.path[i - 1], edge.path[i]);
    const station = approach.distance - offset;
    if (station >= CROSSING_DIMENSIONS.width / 2 && station <= frame.length - CROSSING_DIMENSIONS.width / 2) {
      const candidate = approachGeometry(edge, frame, offset, station);
      const { field, landings, walkingLandings } = candidate.approach;
      const starts = edge.from === approach.nodeId;
      const expected = {
        field, landings, walkingLandings,
        cut: { left: field[starts ? 3 : 2], right: field[starts ? 0 : 1] },
      };
      if (!equal(approach.station, [approach.distance - CROSSING_DIMENSIONS.width / 2, approach.distance + CROSSING_DIMENSIONS.width / 2])) {
        throw invariantFailure('crossing construction changes complete field stations', { edgeId: edge.id });
      }
      if (!equal({ field: approach.field, landings: approach.landings, walkingLandings: approach.walkingLandings, cut: approach.cut }, expected) || !equal(segment, candidate.segment)) {
        throw invariantFailure('crossing construction changes canonical field, landing or stripe geometry', { edgeId: edge.id, distance: approach.distance });
      }
      return;
    }
    offset += frame.length;
  }
  throw invariantFailure('crossing construction field crosses a source bend or endpoint', { edgeId: edge.id, distance: approach.distance });
}
function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
