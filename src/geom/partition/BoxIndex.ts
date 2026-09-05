import type { Region } from './Exact';

export type Box = [number, number, number, number];
export const overlaps = (a: Box, b: Box): boolean => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
export function extent(region: Region): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of region) for (const { value: [x, y] } of ring) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const pad = Math.max(1, Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1)) * Number.EPSILON * 16;
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

interface Node<T> { box: Box; items?: T[]; left?: Node<T>; right?: Node<T> }
export class BoxIndex<T extends { box: Box }> {
  private readonly root?: Node<T>;
  constructor(items: T[]) { if (items.length) this.root = this.build([...items]); }

  query(box: Box): T[] {
    const result: T[] = [], stack = this.root ? [this.root] : [];
    while (stack.length) {
      const node = stack.pop()!;
      if (!overlaps(box, node.box)) continue;
      if (node.items) for (const item of node.items) { if (overlaps(box, item.box)) result.push(item); }
      else { stack.push(node.left!, node.right!); }
    }
    return result;
  }

  private build(items: T[]): Node<T> {
    const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const item of items) {
      box[0] = Math.min(box[0], item.box[0]); box[1] = Math.min(box[1], item.box[1]);
      box[2] = Math.max(box[2], item.box[2]); box[3] = Math.max(box[3], item.box[3]);
    }
    if (items.length <= 8) return { box, items };
    const axis = box[2] - box[0] >= box[3] - box[1] ? 0 : 1;
    items.sort((a, b) => a.box[axis] + a.box[axis + 2] - b.box[axis] - b.box[axis + 2]);
    const middle = Math.floor(items.length / 2);
    return { box, left: this.build(items.slice(0, middle)), right: this.build(items.slice(middle)) };
  }
}
