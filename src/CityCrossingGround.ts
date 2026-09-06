import type { GroundSurface, Polygon } from '../schema/blueprint';
import { difference, intersection } from './geom/clip';
import { bounds } from './geom/polygon';

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
