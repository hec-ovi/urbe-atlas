import type { GroundSurface, Polygon } from '../schema/blueprint';
import type { CityCrossingLandExclusions } from './CityCrossings';
import { invalidParams } from './errors';
import { difference, intersection } from './geom/clip';
import { bounds, isSimpleRing } from './geom/polygon';

export interface CityCrossingRegion extends GroundSurface {
  edgeId?: string;
}

/** Local ownership proofs for a fixed-size crossing, indexed in 32 m cells. */
export class CityCrossingGround {
  private readonly cells = new Map<string, Set<CityCrossingRegion>>();
  private readonly obstacles = new Map<string, Set<Polygon>>();

  constructor(ground: readonly CityCrossingRegion[], obstacles: readonly Polygon[]) {
    for (const region of ground) {
      if (region.surface === 'open' || region.surface === 'block') continue;
      for (const key of this.keys(region.polygon)) this.add(this.cells, key, region);
    }
    for (const polygon of obstacles) for (const key of this.keys(polygon)) this.add(this.obstacles, key, polygon);
  }

  static landExclusions(exclusions?: CityCrossingLandExclusions): CityCrossingGround {
    if (!exclusions) return new CityCrossingGround([], []);
    const valid = (polygon: Polygon) => Array.isArray(polygon)
      && polygon.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))
      && isSimpleRing(polygon);
    if (!Array.isArray(exclusions.water) || !exclusions.water.every(valid) || !Array.isArray(exclusions.blocks)) {
      throw invalidParams('grid crossing requires valid source water exclusions');
    }
    const water = new CityCrossingGround([], exclusions.water), ids = new Set<string>();
    for (const block of exclusions.blocks) {
      if (!block || typeof block.ownerId !== 'string' || !block.ownerId || ids.has(block.ownerId)
        || !valid(block.boundary) || water.clear(block.boundary)) {
        throw invalidParams('grid crossing excluded block requires unique source ownership and water contact', { ownerId: block?.ownerId });
      }
      ids.add(block.ownerId);
    }
    return new CityCrossingGround([], [...exclusions.water, ...exclusions.blocks.map(block => block.boundary)]);
  }

  covers(polygon: Polygon, surfaces: readonly GroundSurface['surface'][]): boolean {
    const nearby = this.near(this.cells, polygon).filter(region => surfaces.includes(region.surface));
    return difference([polygon], nearby.map(region => region.polygon)).length === 0;
  }

  avoidsOtherRoads(polygon: Polygon, edgeId: string): boolean {
    return intersection([polygon], this.near(this.cells, polygon)
      .filter(region => region.edgeId !== edgeId).map(region => region.polygon)).length === 0;
  }

  clear(polygon: Polygon): boolean {
    return intersection([polygon], this.near(this.obstacles, polygon)).length === 0;
  }

  private near<T>(index: Map<string, Set<T>>, polygon: Polygon): T[] {
    const found = new Set<T>();
    for (const key of this.keys(polygon)) for (const value of index.get(key) ?? []) found.add(value);
    return [...found];
  }

  private add<T>(index: Map<string, Set<T>>, key: string, value: T): void {
    if (!index.has(key)) index.set(key, new Set());
    index.get(key)!.add(value);
  }

  private keys(polygon: Polygon): string[] {
    const box = bounds(polygon), keys: string[] = [];
    for (let x = Math.floor(box.min[0] / 32); x <= Math.floor(box.max[0] / 32); x++) {
      for (let z = Math.floor(box.min[1] / 32); z <= Math.floor(box.max[1] / 32); z++) keys.push(`${x}:${z}`);
    }
    return keys;
  }
}
