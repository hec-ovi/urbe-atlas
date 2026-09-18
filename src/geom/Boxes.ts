/**
 * Axis-aligned rectangles answered with arithmetic: four comparisons decide overlap,
 * and a uniform cell index narrows a whole set to the pairs that can touch. Anything
 * that is not an upright rectangle belongs in the Boolean kernel, [clip.ts](clip.ts).
 */
import type { Vec2 } from '../../schema/blueprint';

export interface Box { minX: number; minZ: number; maxX: number; maxZ: number }

export function boxOf(points: readonly Vec2[]): Box {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

/** Positive grows the rectangle on every side, negative shrinks it. */
export const grow = (box: Box, by: number): Box => ({
  minX: box.minX - by, minZ: box.minZ - by, maxX: box.maxX + by, maxZ: box.maxZ + by,
});

export const overlaps = (a: Box, b: Box): boolean =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minZ <= b.maxZ && b.minZ <= a.maxZ;

/** A box wider than this many cells on both axes is compared against everything instead. */
const SPREAD_LIMIT = 128;

/**
 * Uniform cells over a fixed set of rectangles. Two rectangles can only overlap when
 * they share a cell, which replaces the forward scan that a city-long strip never ends.
 */
export class BoxPairs {
  private readonly boxes: readonly Box[];
  private readonly cells = new Map<number, number[]>();
  private readonly spread: number[] = [];
  private readonly originX: number;
  private readonly originZ: number;
  private readonly size: number;
  private readonly seen: Int32Array;
  private stamp = 0;

  constructor(boxes: readonly Box[]) {
    this.boxes = boxes;
    this.seen = new Int32Array(boxes.length);
    const all: Box = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (i === 0) { all.minX = b.minX; all.minZ = b.minZ; all.maxX = b.maxX; all.maxZ = b.maxZ; continue; }
      if (b.minX < all.minX) all.minX = b.minX;
      if (b.minZ < all.minZ) all.minZ = b.minZ;
      if (b.maxX > all.maxX) all.maxX = b.maxX;
      if (b.maxZ > all.maxZ) all.maxZ = b.maxZ;
    }
    const span = Math.max(all.maxX - all.minX, all.maxZ - all.minZ);
    const columns = Math.min(64, Math.max(1, Math.round(Math.sqrt(boxes.length))));
    this.originX = all.minX;
    this.originZ = all.minZ;
    this.size = span > 0 ? span / columns : 1;
    for (let i = 0; i < boxes.length; i++) this.add(i, boxes[i]);
  }

  /** Every rectangle after `index` that could overlap it, ascending, each listed once. */
  after(index: number): number[] {
    const box = this.boxes[index];
    const found: number[] = [];
    this.stamp++;
    const collect = (candidate: number): void => {
      if (candidate <= index || this.seen[candidate] === this.stamp) return;
      this.seen[candidate] = this.stamp;
      if (overlaps(box, this.boxes[candidate])) found.push(candidate);
    };
    for (const candidate of this.spread) collect(candidate);
    const [x0, z0, x1, z1] = this.range(box);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const bucket = this.cells.get(z * 131072 + x);
        if (bucket) for (const candidate of bucket) collect(candidate);
      }
    }
    return found.sort((a, b) => a - b);
  }

  private add(index: number, box: Box): void {
    const [x0, z0, x1, z1] = this.range(box);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > SPREAD_LIMIT) {
      this.spread.push(index);
      return;
    }
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const key = z * 131072 + x;
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(index);
        else this.cells.set(key, [index]);
      }
    }
  }

  private range(box: Box): [number, number, number, number] {
    return [
      Math.floor((box.minX - this.originX) / this.size), Math.floor((box.minZ - this.originZ) / this.size),
      Math.floor((box.maxX - this.originX) / this.size), Math.floor((box.maxZ - this.originZ) / this.size),
    ];
  }
}
