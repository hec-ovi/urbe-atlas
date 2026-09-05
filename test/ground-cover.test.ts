import { expect, it } from 'vitest';
import type { Polygon, Polyline, StreetEdge } from '../schema/blueprint';
import { coversSegment } from '../src/geom/polygon';
import { verifyPublishedCover } from '../src/geom/partition/published/verifyPublishedCover';
import { GradeDatum } from '../src/streets/construction/datum';
import { GroundCover, type GroundCoverInput } from '../src/streets/GroundCover';

it('retains authored collinearity while assigning ground and open fringe', () => {
  const boundary: Polygon = [[190, 433], [192, 433], [192, 435], [190, 435]];
  const source: Polygon = [[190.788, 433.93], [190.72, 433.846], [191, 433]];
  const subdivided: Polygon = [source[0], [190.754, 433.888], ...source.slice(1)];
  const input = {
    boundary, water: [], stationBays: [],
    masks: { roadway: [], curb: [], sidewalk: [subdivided], block: [source], open: [] },
  };
  const original = JSON.stringify(input);
  const ground = GroundCover.build(input);
  expect(new Set(ground.map(region => region.surface))).toEqual(new Set(['sidewalk', 'open']));
  expect(ground.filter(region => region.surface === 'sidewalk')).toHaveLength(1);
  expect(JSON.stringify(input)).toBe(original);
  expect(() => GroundCover.build({ ...input, boundary: [[190.0001, 433], ...boundary.slice(1)] }))
    .toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
});

function e103Input(): GroundCoverInput {
  const sources: { id: string; path: Polyline; width: number }[] = [
    { id: 'e94', path: [[842.93, 515.647], [853.001, 444.36], [853.778, 435.836]], width: 21 },
    { id: 'e95', path: [[882.042, 438.262], [842.93, 515.647]], width: 14 },
    { id: 'e96', path: [[853.778, 435.836], [858.45, 384.619], [859.086, 362.998]], width: 21 },
    { id: 'e103', path: [[859.086, 362.998], [920.339, 362.49]], width: 14 },
    { id: 'e111', path: [[920.339, 362.49], [882.042, 438.262]], width: 14 },
  ];
  const edges: StreetEdge[] = sources.map(source => ({ ...source, class: 'road',
    from: `${source.path[0]}`, to: `${source.path.at(-1)}`, sidewalk: { left: 8.5, right: 8.5 },
    districtIds: [], level: 0, elevationProfile: [{ distance: 0, level: 0 }, { level: 0,
      distance: source.path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - source.path[i][0], p[1] - source.path[i][1]), 0) }],
  }));
  const boundary: Polygon = [[831, 351], [929, 351], [929, 528], [831, 528]];
  const datum = GradeDatum.plan({ boundary, edges, structures: [], roadwayTop: 0, pedestrianTop: 0.15 });
  const corner: Polygon = [[870.837, 370.003], [870.239, 370.306], [869.761, 370.774], [869.446, 371.366],
    [869.324, 372.025], [868.945, 384.928], [869.386, 369.913], [871.496, 369.895]];
  return { boundary, water: [], stationBays: [], masks: {
    roadway: [...datum.grade.roadway.flatMap(owner => owner.polygons), corner],
    curb: [], sidewalk: datum.grade.corridors.flatMap(owner => owner.polygons), block: [], open: [],
  } };
}

it('preserves the e103 lane edge and shared sidewalk seam', () => {
  const source = GroundCover.plan(e103Input());
  const field: Polygon = [[859.028, 355.998], [920.281, 355.49], [920.397, 369.49], [859.144, 369.998]];
  expect(source.partition.covers('roadway', field)).toBe(true);
  const ground = GroundCover.snapshot(source);
  const witness: [number, number] = [886.731, 369.7686];
  expect(ground.filter(region => region.surface === 'roadway')
    .some(region => coversSegment(region.polygon, witness, witness))).toBe(true);
  const seam: [number, number] = [886.731, 355.7676];
  expect(ground.filter(region => coversSegment(region.polygon, seam, seam)).map(region => region.surface)).toEqual(['sidewalk']);
});

it('retains exact semantic owners after a numeric snapshot', () => {
  const band = (left: number, right: number): Polygon => [[left, 0], [right, 0], [right, 10], [left, 10]];
  const input: GroundCoverInput = { boundary: band(0, 10), water: [band(0, 2)], stationBays: [band(2, 3)], masks: {
    roadway: [band(3, 4)], curb: [band(4, 5)], sidewalk: [band(5, 6)], block: [band(6, 7)], open: [band(7, 8)],
  } };
  const source = GroundCover.plan(input);
  const snapshot = GroundCover.snapshot(source);
  expect(GroundCover.build(input)).toEqual(snapshot);
  expect(source.owners.map(owner => owner.ownerId)).toEqual(['station', 'roadway', 'curb', 'sidewalk', 'block', 'open', 'fringe']);
  expect(source.excludedOwnerIds).toEqual(['water']);
  expect(source.partition.covers('sidewalk', band(5, 6))).toBe(true);
  source.partition.divide('sidewalk', { claims: [{ id: 'slab', masks: [band(5, 6)] }], remainderId: 'remaining' });
  expect(() => GroundCover.snapshot(source)).toThrow(expect.objectContaining({ code: 'E_INVARIANT' }));
  const refined = { ...source, owners: [...source.owners, { ...source.owners.find(owner => owner.ownerId === 'sidewalk')!, ownerId: 'slab' }] };
  expect(GroundCover.snapshot(refined)).toEqual(snapshot);
});

it('publishes a complete independent saved e103 ground cover', () => {
  const input = e103Input();
  const ground = GroundCover.build(input);
  expect(() => verifyPublishedCover({ boundary: input.boundary, exclusions: [],
    pieces: ground.map((region, index) => ({ id: String(index), polygon: region.polygon })),
  })).not.toThrow();
});
