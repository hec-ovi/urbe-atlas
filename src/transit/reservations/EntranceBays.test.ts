import { describe, expect, it } from 'vitest';
import type { Polygon, Vec2 } from '../../../schema/blueprint';
import { difference, intersection } from '../../geom/clip';
import { area, pointInPolygon } from '../../geom/polygon';
import { resolveStreetDesign } from '../../streets/construction/Design';
import { StreetCorridors } from '../../streets/construction/StreetCorridors';
import { StreetSections } from '../../streets/construction/StreetSections';
import type { SectionedStreetEdge } from '../../streets/construction/schema/sections';
import { platformOf, rectangle, STATION } from '../stations';
import { EntranceBays } from './EntranceBays';

function street(path: Vec2[] = [[0, 0], [120, 0]]): SectionedStreetEdge {
  return StreetSections.plan([{ id: 'e0', class: 'street', from: 'n0', to: 'n1', path }], [
    { id: 'n0', position: path[0], edgeIds: ['e0'] },
    { id: 'n1', position: path[path.length - 1], edgeIds: ['e0'] },
  ], resolveStreetDesign(), ([, z]) => z > 0 ? 'residential' : 'commercial').edges[0];
}

const size = (polygons: Polygon[]): number => polygons.reduce((sum, polygon) => sum + area(polygon), 0);
const boundary: Polygon = [[-30, -50], [150, -50], [150, 60], [-30, 60]];

describe('subway entrance reservations', () => {
  it('retains full stairs and both directed walking bands beside unequal sidewalks', () => {
    const edge = street();
    const input = { edges: [edge], boundary, obstacles: [] };
    const planner = new EntranceBays(input);
    const platform = platformOf([60, 0], [1, 0]);
    const places = planner.find([60, 0], platform);
    expect(places).toHaveLength(2);
    expect(places.map((place) => place.bay.side)).toEqual(['left', 'right']);
    expect(edge.sidewalk).toEqual({ left: 2.5, right: 6.5 });
    const corridors = new StreetCorridors([edge]);
    for (const place of places) {
      expect(area(place.bay.shaft)).toBeCloseTo(STATION.shaft.length * STATION.shaft.width, 6);
      expect(size(intersection([place.bay.shaft], corridors.full))).toBe(0);
      expect(size(difference([place.bay.footprint], [boundary]))).toBe(0);
      expect(place.bay.approach.at(-1)).toEqual(place.point);
      expect(StreetCorridors.band(edge, place.bay.side, 'walking')
        .some((polygon) => pointInPolygon(place.bay.approach[0], polygon))).toBe(true);
      expect(size(intersection([place.bay.footprint], StreetCorridors.band(edge, place.bay.side, 'walking')))).toBeGreaterThan(0);
    }
    expect(new EntranceBays(input).find([60, 0], platform)).toEqual(places);
  });

  it('keeps whole bays clear of curves, junction roads, water and prior stations', () => {
    const bent = street([[0, 0], [50, 0], [85, 25], [120, 25]]);
    const cross = { ...street([[60, -50], [60, 50]]), id: 'e1' };
    const water = rectangle([100, -20], [1, 0], 40, 30);
    const planner = new EntranceBays({ edges: [bent, cross], boundary, obstacles: [water] });
    const platform = platformOf([60, 10], [1, 0]);
    const first = planner.find([60, 10], platform);
    expect(first.length).toBeGreaterThan(0);
    planner.reserve(first.map((place) => place.bay));
    const second = planner.find([60, 10], platform);
    expect(second.length).toBeGreaterThan(0);
    const unavailable = [...new StreetCorridors([bent, cross]).roadway.values()].flat();
    for (const place of [...first, ...second]) {
      expect(size(intersection([place.bay.footprint], [...unavailable, water]))).toBe(0);
      expect(size(difference([place.bay.footprint], [boundary]))).toBe(0);
    }
    expect(size(intersection(first.map((place) => place.bay.footprint), second.map((place) => place.bay.footprint)))).toBe(0);
  });

  it('reports unavailable land without clipping bays or reducing stair dimensions', () => {
    const edge = street();
    const occupied: Polygon = [[-30, -50], [150, -50], [150, 60], [-30, 60]];
    const planner = new EntranceBays({ edges: [edge], boundary, obstacles: [occupied] });
    expect(planner.find([60, 0], platformOf([60, 0], [1, 0]))).toEqual([]);
  });
});
