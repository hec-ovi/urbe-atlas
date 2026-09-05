export interface RectangleCandidate {
  u: number;
  v: number;
  width: number;
  depth: number;
}

/** Whole-cell area, short side, then stable grid position. */
export function compareCandidates(a: RectangleCandidate, b: RectangleCandidate): number {
  return b.width * b.depth - a.width * a.depth
    || Math.min(b.width, b.depth) - Math.min(a.width, a.depth)
    || a.u - b.u || a.v - b.v || b.width - a.width;
}

/** Best-first rectangle envelopes and their contained one-cell trims. */
export class RectangleCandidates {
  private readonly heap: RectangleCandidate[];
  private readonly seen = new Set<string>();

  constructor(candidates: RectangleCandidate[], private readonly usable: (candidate: RectangleCandidate) => boolean) {
    this.heap = candidates.filter((candidate) => this.accept(candidate));
    for (let index = Math.floor(this.heap.length / 2) - 1; index >= 0; index--) this.sink(index);
  }

  take(): RectangleCandidate | undefined {
    const first = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length && last) { this.heap[0] = last; this.sink(0); }
    return first;
  }

  refine(candidate: RectangleCandidate): void {
    const { u, v, width, depth } = candidate;
    this.add({ u: u + 1, v, width: width - 1, depth });
    this.add({ u, v, width: width - 1, depth });
    this.add({ u, v: v + 1, width, depth: depth - 1 });
    this.add({ u, v, width, depth: depth - 1 });
  }

  private accept(candidate: RectangleCandidate): boolean {
    if (!this.usable(candidate)) return false;
    const key = `${candidate.u}:${candidate.v}:${candidate.width}:${candidate.depth}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  private add(candidate: RectangleCandidate): void {
    if (!this.accept(candidate)) return;
    let index = this.heap.push(candidate) - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareCandidates(this.heap[parent], candidate) <= 0) break;
      this.heap[index] = this.heap[parent];
      index = parent;
    }
    this.heap[index] = candidate;
  }

  private sink(index: number): void {
    const candidate = this.heap[index];
    while (2 * index + 1 < this.heap.length) {
      let child = 2 * index + 1;
      if (child + 1 < this.heap.length && compareCandidates(this.heap[child + 1], this.heap[child]) < 0) child++;
      if (compareCandidates(candidate, this.heap[child]) <= 0) break;
      this.heap[index] = this.heap[child];
      index = child;
    }
    this.heap[index] = candidate;
  }
}
