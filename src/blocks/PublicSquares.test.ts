import { describe, expect, it } from 'vitest';
import type { Polygon } from '../../schema/blueprint';
import { generateCity } from '../generate';
import { publicSquares, type SquareLot } from './PublicSquares';

const box = (x: number, z: number, w: number, d: number): Polygon => [[x, z], [x + w, z], [x + w, z + d], [x, z + d]];
const lot = (polygon: Polygon, blockIndex: number, extra: Partial<SquareLot> = {}): SquareLot =>
  ({ polygon, blockIndex, districtIndex: 0, standard: true, type: 'commerce', ...extra });

describe('public squares', () => {
  it('opens the corner lot at the avenue crossing nearest the district centre, and none in a district under three blocks', () => {
    const lots = [lot(box(12, 12, 24, 40), 0), lot(box(36, 12, 24, 40), 0), lot(box(212, 12, 24, 40), 1), lot(box(-36, -52, 24, 40), 2)];
    const crossings = [{ position: [0, 0] as [number, number], roads: 2 }, { position: [200, 0] as [number, number], roads: 1 }];
    expect([...publicSquares(lots, crossings, [[150, 0]], [3])]).toEqual([0]);
    expect(publicSquares(lots, crossings, [[150, 0]], [2]).size).toBe(0);
  });

  it('passes over landmarks, anchors and a second lot of a block that already opened one', () => {
    const lots = [lot(box(12, 12, 40, 40), 0, { standard: false }), lot(box(-36, 12, 24, 40), 1, { type: 'hospital' }),
      lot(box(12, -52, 24, 40), 2), lot(box(14, 12, 24, 40), 3), lot(box(40, -52, 24, 40), 2)];
    const crossings = [{ position: [0, 0] as [number, number], roads: 2 }, { position: [26, 0] as [number, number], roads: 2 }];
    // Two squares wanted (16 blocks): the first crossing takes block 2's corner, and the second,
    // whose nearest lot is block 2's other one, opens block 3's instead.
    expect([...publicSquares(lots, crossings, [[0, 0]], [16])].sort()).toEqual([2, 3]);
  });

  it('opens at least one square in every district of three or more blocks of a generated city', () => {
    const city = generateCity({ seed: 'squares', size: { width: 900, depth: 900 } });
    const blocks = new Map<string, number>();
    for (const block of city.blocks) blocks.set(block.districtId, (blocks.get(block.districtId) ?? 0) + 1);
    const parks = city.parcels.filter((parcel) => parcel.type === 'park');
    for (const [districtId, count] of blocks) {
      if (count >= 3) expect(parks.some((parcel) => parcel.districtId === districtId), districtId).toBe(true);
    }
    // A square is a standard lot with no building, on a block it shares with built lots.
    for (const park of parks) {
      expect(park.lotSize).toBeDefined();
      expect(park.footprint).toBeUndefined();
    }
  });
});
