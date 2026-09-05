import { describe, expect, it } from 'vitest';
import type { Polygon, StreetEdge, Vec2 } from '../../../../schema/blueprint';
import { hasInteriorBeyondPrecision, snapPoint } from '../../../geom/clip';
import { StreetCorridors } from '../../construction/StreetCorridors';
import { FootprintRegions } from './FootprintRegions';
import { StationFrame } from './StationFrame';

function rectangle(frame: StationFrame, from: number, to: number, min: number, max: number): Polygon {
  return [frame.edgePoint(from, min), frame.edgePoint(to, min), frame.edgePoint(to, max), frame.edgePoint(from, max)];
}

describe('StationFrame public shared-edge construction', () => {
  it('publishes a decimal interior subdivision through the exact edge conversion', () => {
    const frame = new StationFrame([0.1, 0.2], [0.3, 0.4]);
    expect(frame.edgePoint(frame.length / 10, 0)).toEqual([0.12, 0.22]);
  });

  it('anchors the directed frame at the original canonical endpoints', () => {
    const a: Vec2 = [10, 20], b: Vec2 = [34, 52];
    const frame = new StationFrame(a, b);
    expect(frame.length).toBe(40);
    expect(frame.u).toEqual([0.6, 0.8]);
    expect(frame.v).toEqual([-0.8, 0.6]);
    expect(frame.point(10, 2)).toEqual([14.4, 29.2]);
    expect(frame.project(frame.edgePoint(10, 2))).toBeCloseTo(10, 12);
    expect(frame.edgePoint(0, 2)).toEqual(snapPoint([a[0] + frame.v[0] * 2, a[1] + frame.v[1] * 2]));
    expect(frame.edgePoint(frame.length, 2)).toEqual(snapPoint([b[0] + frame.v[0] * 2, b[1] + frame.v[1] * 2]));
    frame.edgePoint(0, 2)[0] = 999;
    expect(frame.edgePoint(0, 2)).toEqual([8.4, 21.2]);
    expect(a).toEqual([10, 20]); expect(b).toEqual([34, 52]);
  });

  it('keeps short fields and complete stripes inside shared long bands on a bent street', () => {
    const path: Vec2[] = [[132.698, 720.685], [138, 672.125], [141.583, 649.454]];
    const edge: StreetEdge = { id: 'source', class: 'street', from: 'a', to: 'b', path, width: 7,
      sidewalk: { left: 6.5, right: 6.5 }, districtIds: [], level: 0,
      elevationProfile: [{ distance: 0, level: 0 }, { distance: 71.80097893291506, level: 0 }] };
    const ownRoad = StreetCorridors.reservations([edge]).edges[0].roadway;
    for (let i = 1; i < path.length; i++) {
      const frame = new StationFrame(path[i - 1], path[i]);
      const long = rectangle(frame, 0, frame.length, -3.5, 3.5);
      expect(hasInteriorBeyondPrecision(FootprintRegions.outside(long, ownRoad))).toBe(false);
      for (const station of [2, frame.length / 2, frame.length - 2]) {
        const field = rectangle(frame, station - 1.5, station + 1.5, -3.5, 3.5);
        expect(hasInteriorBeyondPrecision(FootprintRegions.outside(field, [long]))).toBe(false);
        expect(hasInteriorBeyondPrecision(FootprintRegions.outside(field, ownRoad))).toBe(false);
        for (const offset of [-1, 0, 1]) {
          const stripe = rectangle(frame, station + offset - 0.25, station + offset + 0.25, -3.5, 3.5);
          expect(hasInteriorBeyondPrecision(FootprintRegions.outside(stripe, [field]))).toBe(false);
          expect(hasInteriorBeyondPrecision(FootprintRegions.outside(stripe, ownRoad))).toBe(false);
        }
      }
    }
  });

  it('retains source-boundary precision at a fractional crossing station', () => {
    const a: Vec2 = [219.992, 410.765], b: Vec2 = [281.862, 428.536];
    const allowed: Polygon[] = [[[210, 390], [290, 400], [290, 440], [273.135, 429.749],
      [272.699, 429.545], [220.943, 414.679], [210, 414]]];
    const station = 54.344372820466354;
    const frame = new StationFrame(a, b);
    const field = rectangle(frame, station - 1.5, station + 1.5, -3.5, 3.5);
    const long = rectangle(frame, 0, frame.length, -3.5, 3.5);
    expect(hasInteriorBeyondPrecision(FootprintRegions.outside(field, [long]))).toBe(false);
    expect(hasInteriorBeyondPrecision(FootprintRegions.outside(field, allowed))).toBe(false);
    expect(field.some(point => point.some(coordinate => coordinate !== Math.round(coordinate * 1000) / 1000))).toBe(true);
    expect(rectangle(frame, station - 1.5, station + 1.5, -3.5, 3.5)).toEqual(field);
  });
});
