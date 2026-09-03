import { describe, expect, it } from 'vitest';
import { AtlasError } from '../errors';
import { HYDROLOGY_FIXTURES } from './fixtures/hydrology';
import { planHydrology, withHydrologyStructures } from './Hydrology';
import { checkHydrology } from './HydrologyInvariants';

describe('hydrology contract', () => {
  it.each(HYDROLOGY_FIXTURES)('publishes stable bounded $config.type geometry', (request) => {
    const first = planHydrology(request)!;
    const second = planHydrology(request)!;
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(() => checkHydrology(first, request.size)).not.toThrow();
    expect(first.bodies[0].type).toBe(request.config!.type);
    expect(first.bodies[0].surfaces).toHaveLength(1);
    expect(first.bodies[0].shorelines[0].closed).toBe(true);
  });

  it('keeps the omitted default byte-empty and gives a different identity to another seed', () => {
    const base = { ...HYDROLOGY_FIXTURES[0], config: undefined };
    expect(planHydrology(base)).toBeNull();
    const left = planHydrology(HYDROLOGY_FIXTURES[0])!;
    const right = planHydrology({ ...HYDROLOGY_FIXTURES[0], seed: 'different' })!;
    expect(left.seedId).not.toBe(right.seedId);
  });

  it('keeps every hydrology type valid and deterministic across seed streams', () => {
    for (const fixture of HYDROLOGY_FIXTURES) for (let seed = 0; seed < 16; seed++) {
      const request = { ...fixture, seed: `property-${seed}` };
      const first = planHydrology(request)!;
      expect(JSON.stringify(planHydrology(request))).toBe(JSON.stringify(first));
      expect(() => checkHydrology(first, request.size)).not.toThrow();
    }
  });

  it('publishes exact in-water bridge and tunnel portions', () => {
    const plan = planHydrology(HYDROLOGY_FIXTURES[0])!;
    const center = plan.bodies[0].surfaces[0].reduce<[number, number]>((sum, p) => [sum[0] + p[0], sum[1] + p[1]], [0, 0])
      .map((value) => value / plan.bodies[0].surfaces[0].length) as [number, number];
    const crossed = withHydrologyStructures(plan, [
      { network: 'street', refId: 'e0', path: [[0, center[1]], [800, center[1]]], width: 14, level: 0 },
      { network: 'subway', refId: 'sl0', path: [[center[0], 0], [center[0], 800]], width: 6, level: -12 },
    ])!;
    expect(crossed.structures.map((item) => item.kind)).toEqual(['bridge', 'tunnel']);
    expect(crossed.structures.every((item) => item.path.length >= 2)).toBe(true);
  });

  it('fails closed for malformed and unsatisfiable requests', () => {
    expect(code(() => planHydrology({ ...HYDROLOGY_FIXTURES[0], config: { type: 'ocean' as 'lagoon' } }))).toBe('E_INVALID_PARAMS');
    expect(code(() => planHydrology({ ...HYDROLOGY_FIXTURES[0], size: { width: 300, depth: 300 } }))).toBe('E_UNSATISFIABLE');
  });
});

function code(run: () => unknown): string | undefined {
  try { run(); return undefined; } catch (error) { return error instanceof AtlasError ? error.code : String(error); }
}
