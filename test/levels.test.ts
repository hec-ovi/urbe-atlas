/** Contract: every network says where it runs in height, so a consumer can stack the city. */
import { describe, expect, it } from 'vitest';
import { generateCity } from '../src';
import { LEVELS } from '../src/levels';

describe('levels', () => {
  it('puts highways on their deck, streets at grade, trains at grade and subways underground, stations with their lines', () => {
    const bp = generateCity({ seed: 'levels-test' });
    const highways = bp.streets.edges.filter((e) => e.class === 'highway');
    const others = bp.streets.edges.filter((e) => e.class !== 'highway');
    expect(others.every((e) => e.level === LEVELS.ground)).toBe(true);
    for (const e of highways) expect(e.level).toBe(LEVELS.highway);
    for (const line of bp.transit.trainLines) expect(line.level).toBe(LEVELS.train);
    for (const line of bp.transit.subwayLines) expect(line.level).toBe(LEVELS.subway);
    for (const s of bp.transit.trainStations) expect(s.level).toBe(LEVELS.train);
    for (const s of bp.transit.subwayStations) {
      expect(s.level).toBe(LEVELS.subway);
      // entrances stay on the sidewalk at grade: they are plain points, height implied 0
      expect(s.entrances.length).toBeGreaterThan(0);
    }
    expect(bp.meta.version).toBe('0.8.0');
  });
});
