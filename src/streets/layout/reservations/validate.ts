import { intersection, difference } from '../../../geom/clip';
import { area } from '../../../geom/polygon';
import { invariantFailure } from '../../../errors';
import type { ReservationCity, StreetReservations } from './schema';
import type { Polygon, Vec2 } from '../../../../schema/blueprint';

const fail = (message: string, details: Record<string, unknown> = {}): never => { throw invariantFailure(message, details); };
const point = (value: number[]): boolean => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number): boolean => Number.isFinite(a) && Math.abs(a - b) <= 1e-8;
// Translating before the shoelace sum prevents cancellation at large city coordinates.
const localArea = (polygon: Polygon): number => area(polygon.map(([x, z]) => [x - polygon[0][0], z - polygon[0][1]]));
// The same land, whatever vertex a ring starts on.
const sameRing = (a: Polygon, b: Polygon): boolean => !difference([a], [b]).length && !difference([b], [a]).length;
function indexed<T extends { id: string }>(rows: T[], name: string): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    if (!row?.id || out.has(row.id)) fail(`duplicate or absent ${name} identity`, { id: row?.id });
    out.set(row.id, row);
  }
  return out;
}

export function validateReservations(value: StreetReservations, city: ReservationCity): void {
  const format = city.modules.format === undefined ? 'source' : city.modules.format, district = format === 'district';
  if (format !== 'source' && format !== 'district') fail('unknown street construction format', { format });
  if (value.version !== '1.0.0' || value.groundArray.path !== 'volumetric.ground'
    || value.groundArray.count !== city.volumetric.ground.length) fail('street reservations address a different ground array');
  const ground = city.volumetric.ground, claimed = new Set<number>();
  const owners = indexed(value.owners, 'street owner'), frontages = indexed(value.frontages, 'frontage'), corners = indexed(value.corners, 'corner');
  const blocks = indexed(city.blocks, 'block'), parcels = indexed(city.parcels, 'parcel'), edges = indexed(city.streets.edges, 'edge');
  const nodes = new Set(city.streets.nodes.map(node => node.id));
  for (const owner of owners.values()) {
    if (!['block', 'perimeter', 'underpass', 'roadway', 'station', 'median'].includes(owner.kind)) fail('unknown street owner kind');
    if (owner.kind === 'median' && (!district || !city.modules.frontages?.some(front => front.id === owner.id && front.kind === 'median')
      || owner.interiors.length || owner.excludedParcelIds.length)) fail('invalid median owner', { ownerId: owner.id });
    if (!owner.groundIndices.length) fail('street owner has no ground', { ownerId: owner.id });
    const block = blocks.get(owner.id);
    if (owner.kind === 'block' && (!block || !same([...block.parcelIds].sort(), [...owner.excludedParcelIds].sort()))) {
      fail('street owner differs from local parcel authority', { ownerId: owner.id });
    }
    const excluded = owner.excludedParcelIds.map(id => parcels.get(id)?.lot ?? fail('street owner names unknown parcel', { ownerId: owner.id, parcelId: id }));
    for (const index of owner.groundIndices) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= ground.length || claimed.has(index)) fail('street ground has duplicate or invalid ownership', { index });
      const source = ground[index];
      if (!['roadway', 'curb', 'gutter', 'sidewalk'].includes(source.surface)) fail('street owner claims non-street land', { index });
      if (source.moduleBlockId ? source.moduleBlockId !== owner.id
        : owner.kind === 'roadway' ? source.surface !== 'roadway' : owner.kind !== 'station' || source.surface !== 'sidewalk') {
        fail('street ground source disagrees with owner', { index, ownerId: owner.id });
      }
      claimed.add(index);
      if (excluded.length && intersection([source.polygon], excluded).length) fail('street ground enters a parcel', { index, ownerId: owner.id });
      if (owner.interiors.length && intersection([source.polygon], owner.interiors).length) fail('street ground enters building land', { index, ownerId: owner.id });
    }
  }
  ground.forEach((source, index) => {
    if (['roadway', 'curb', 'gutter', 'sidewalk'].includes(source.surface) && !claimed.has(index)) fail('street ground has no reservation owner', { index });
  });
  for (const frontage of frontages.values()) {
    const owner = owners.get(frontage.ownerId);
    if (!owner || ![frontage.start, frontage.end, frontage.inward].every(point)
      || !frontage.edgeIds.length || frontage.edgeIds.some(id => !edges.has(id))) fail('invalid street frontage references', { frontageId: frontage.id });
    const dx = frontage.end[0] - frontage.start[0], dz = frontage.end[1] - frontage.start[1];
    const length = dx * frontage.inward[1] - dz * frontage.inward[0];
    if (Math.abs(Math.hypot(...frontage.inward) - 1) > 1e-9 || Math.abs(dx * frontage.inward[0] + dz * frontage.inward[1]) > 0.002
      || length <= 0 || frontage.stationRange[0] !== 0 || Math.abs(frontage.stationRange[1] - length) > 1e-8
      || !Number.isFinite(frontage.moduleStationOffset) || !(owner!.kind === 'median' ? [2] : district ? [4.2] : [2, 4, 6]).includes(frontage.pavedWidth)
      || frontage.curbWidth !== 0.2 || frontage.gutterWidth !== (district ? 0.5 : 0.3)) fail('invalid street frontage frame', { frontageId: frontage.id });
    const source = owner!.groundIndices.map(index => ground[index]);
    if (!Number.isFinite(frontage.roadTop) || frontage.pavedTop - frontage.roadTop !== 0.2
      || !source.some(ground => ground.surface === 'sidewalk' && ground.top === frontage.pavedTop)
      || !source.some(ground => (ground.surface === 'roadway' || ground.surface === 'gutter') && ground.top === frontage.roadTop)) {
      fail('street frontage levels differ from ground', { frontageId: frontage.id });
    }
    if (frontage.cornerIds.length !== 2 || frontage.cornerIds.some(id => id !== null && corners.get(id)?.ownerId !== frontage.ownerId)) {
      fail('street frontage has unknown corner support', { frontageId: frontage.id });
    }
  }
  for (const corner of corners.values()) {
    if (!owners.has(corner.ownerId) || corner.frontageIds.some(id => frontages.get(id)?.ownerId !== corner.ownerId)
      || !point(corner.placement.origin) || ![0, 1, 2, 3].includes(corner.placement.turn)
      || !city.modules.placements.some(placement => placement.moduleId === corner.placement.moduleId
        && placement.blockId === corner.ownerId && placement.turn === corner.placement.turn
        && same(placement.origin, corner.placement.origin))) fail('invalid street corner references', { cornerId: corner.id });
    const boundary = corner.kind === 'arc' ? corner.arc : corner.boundary;
    if (!boundary.every(point) || boundary.length < 3 || (corner.kind === 'arc' && (!point(corner.center) || corner.radius <= 0))) {
      fail('invalid street corner support', { cornerId: corner.id });
    }
  }
  indexed(value.parking, 'parking');
  // A bay stands in one authored roadway record: the notch its module cut in the sidewalk.
  const notches = new Map<string, number[]>(), replaced = new Set<number>();
  for (const bay of value.parking) {
    if (!notches.has(bay.ownerId)) {
      notches.set(bay.ownerId, owners.get(bay.ownerId)?.groundIndices.filter(index => ground[index].surface === 'roadway') ?? []);
    }
  }
  for (const bay of value.parking) {
    const frontage = frontages.get(bay.frontageId), owner = owners.get(bay.ownerId);
    if (!frontage || !owner || frontage.ownerId !== bay.ownerId || frontage.pavedWidth !== (district ? 4.2 : 6)
      || frontage.edgeIds.some(id => edges.get(id)?.class === 'highway')) fail('parking lacks an eligible frontage', { parkingId: bay.id });
    if (!Number.isSafeInteger(bay.slotCount) || bay.slotCount < 1 || bay.slotCount > 6 || bay.slotLength !== 6 || bay.depth !== (district ? 2 : 2.5) || bay.endRun !== 2
      || !near(bay.end - bay.start, bay.slotCount * 6 + 4) || bay.slots.length !== bay.slotCount
      || !near(bay.walkingClearance, frontage!.pavedWidth - bay.depth) || bay.walkingClearance < 2
      || !near(bay.support.start, bay.start - 2) || !near(bay.support.end, bay.end + 2)
      || bay.support.start < 0 || bay.support.end > frontage!.stationRange[1]) fail('invalid native parking dimensions', { parkingId: bay.id });
    const at = (station: number, depth: number): Vec2 => [frontage!.start[0] + frontage!.inward[1] * station + frontage!.inward[0] * depth,
      frontage!.start[1] - frontage!.inward[0] * station + frontage!.inward[1] * depth];
    // The bay returns 45 degrees over its end run at each end; the notch it stands in keeps the full rectangle.
    const expected = [at(bay.start, 0), at(bay.end, 0), at(bay.end - bay.endRun, bay.depth), at(bay.start + bay.endRun, bay.depth)];
    const cut = [at(bay.start, 0), at(bay.end, 0), at(bay.end, bay.depth), at(bay.start, bay.depth)];
    const notch = notches.get(bay.ownerId)!.filter(index => !replaced.has(index) && sameRing(ground[index].polygon, cut));
    if (bay.footprint.length !== 4 || bay.footprint.some((p, i) => !point(p) || p.some((n, axis) => Math.abs(n - expected[i][axis]) > 1e-8))
      || bay.slots.some(slot => slot.length !== 4 || !slot.every(point) || Math.abs(localArea(slot) - bay.slotLength * bay.depth) > 1e-6)
      || difference(bay.slots, [bay.footprint]).length || notch.length !== 1) {
      fail('parking differs from the ground record it stands in', { parkingId: bay.id });
    }
    replaced.add(notch[0]);
  }
  for (const [ownerId, indices] of notches) {
    if (indices.some(index => !replaced.has(index))) fail('authored parking ground has no reservation', { ownerId });
  }
  const protectedIds = new Set<string>(), stations = indexed(city.transit.subwayStations, 'station');
  for (const record of value.protected) {
    const id = JSON.stringify(record);
    if (protectedIds.has(id)) fail('duplicate protected street reference');
    protectedIds.add(id);
    if (record.kind === 'highway') {
      if (!city.streets.highwayStructures[record.structureIndex]) fail('unknown protected highway');
    } else if (record.kind === 'underpass') {
      if (owners.get(record.ownerId)?.kind !== 'underpass' || !nodes.has(record.nodeId)
        || record.edgeIds.some(id => !edges.has(id)) || !record.highwayIndices.length
        || record.highwayIndices.some(index => !city.streets.highwayStructures[index]?.edgeIds.some(id => record.edgeIds.includes(id)))) fail('invalid protected underpass');
    } else {
      const station = stations.get(record.stationId);
      if (!station || (record.kind === 'station-bay' ? !station.entranceBays?.[record.bayIndex]
        : record.kind !== 'station-shaft' || !station.shafts[record.shaftIndex])) fail('invalid protected station reference');
    }
  }
  if (value.protected.filter(record => record.kind === 'highway').length !== city.streets.highwayStructures.length
    || value.protected.filter(record => record.kind === 'underpass').length !== value.owners.filter(owner => owner.kind === 'underpass').length
    || value.protected.filter(record => record.kind === 'station-bay').length !== city.transit.subwayStations.reduce((sum, station) => sum + (station.entranceBays?.length ?? 0), 0)
    || value.protected.filter(record => record.kind === 'station-shaft').length !== city.transit.subwayStations.reduce((sum, station) => sum + station.shafts.length, 0)) fail('incomplete protected street references');
}
