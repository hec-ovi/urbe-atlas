import { expect, it } from 'vitest';
import { generateCity } from './generate';

for (const highways of [false, true]) it(`generates a complete district city with physical medians and highways=${highways}`, () => {
  const city = generateCity({ seed: 'district-luxury', size: { width: 500, depth: 500 }, maxFloors: 30,
    tierWeights: { poor: 0, mid: 0, rich: 0.5, high_rich: 0.5 }, features: { highways, subways: false }, diagonals: 'off' });
  expect(city.streets.construction!.modules!.format).toBe('district');
  expect(city.streets.construction!.medians!.length).toBeGreaterThan(0);
  expect(city.streets.edges.filter(edge => edge.class !== 'highway').every(edge => edge.districtStyle !== undefined)).toBe(true);
  for (const owner of city.streets.construction!.reservations!.owners.filter(owner => owner.kind === 'block')) {
    const block = city.blocks.find(block => block.id === owner.id)!;
    const district = city.districts.find(district => district.id === block.districtId)!;
    expect(owner.finish).toBe(district.kind === 'industrial' ? 'industrial-yellow'
      : district.tier === 'high_rich' ? 'luxury-blue' : 'luxury-red');
    const fronts = city.streets.construction!.reservations!.frontages.filter(front => front.ownerId === owner.id);
    expect(fronts.every(front => front.pavedWidth === 4.2 && front.gutterWidth === 0.5)).toBe(true);
  }
  for (const median of city.streets.construction!.medians!) {
    const edge = city.streets.edges.find(edge => edge.id === median.edgeId)!;
    expect(edge.class).toBe('road');
    expect(edge.crossSection!.lanes).toHaveLength(4);
    expect(edge.crossSection!.lanes.every(lane => lane.width === 3.5)).toBe(true);
    expect(edge.width).toBeCloseTo(17.4, 8);
    expect([median.width, median.pavedWidth, median.curbWidth, median.gutterWidth]).toEqual([3.4, 2, 0.2, 0.5]);
  }
  for (const parking of city.streets.construction!.reservations!.parking) {
    expect([parking.depth, parking.slotLength, parking.endRun, parking.walkingClearance]).toEqual([2, 6, 2, 2.2]);
  }
  expect(city.streets.highwayStructures.length > 0).toBe(highways);
});
