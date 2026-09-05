import { ShapeUtils } from 'three/src/extras/ShapeUtils.js';
import { Vector2 } from 'three/src/math/Vector2.js';
import { invariantFailure } from '../../errors';
import { BoxIndex, extent, type Box } from './BoxIndex';
import { compare, compareX, compareY, intersection, onSegment, orient, type Point, type PointPool, type Region, type Ring } from './Exact';
import { chain, nodeSegments, segments } from './Segments';

/** Positive triangles with this oriented boundary have exactly the source winding. */
function matchesBoundary(source: Region, triangles: Region, pool: PointPool): boolean {
  if (triangles.some(ring => orient(ring[0], ring[1], ring[2]) <= 0n)) return false;
  const edges = segments([...source, ...triangles]), sourceEdges = source.reduce((sum, ring) => sum + ring.length, 0);
  nodeSegments(edges, pool);
  const incidence = new Map<string, number>();
  edges.forEach((edge, index) => {
    const path = chain(edge), direction = index < sourceEdges ? 1 : -1;
    for (let step = 1; step < path.length; step++) {
      const a = path[step - 1], b = path[step], forward = compare(a, b) < 0;
      const key = forward ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
      incidence.set(key, (incidence.get(key) ?? 0) + direction * (forward ? 1 : -1));
    }
  });
  return [...incidence.values()].every(value => value === 0);
}

/** A left ray reaches the current exterior before any hole still to its right. */
function bridge(outline: Ring, hole: Ring, pool: PointPool): Ring {
  let first = 0;
  for (let index = 1; index < hole.length; index++) if (compare(hole[index], hole[first]) < 0) first = index;
  const h = hole[first], end = pool.make(h.x + h.w, h.y, h.w);
  let nearest: Point | undefined, edgeIndex = -1;
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index], b = outline[(index + 1) % outline.length], ay = compareY(a, h), by = compareY(b, h);
    if (ay * by > 0) continue;
    const candidates = !ay && !by ? [a, b] : [intersection(a, b, h, end, pool)];
    for (const point of candidates) if (compareX(point, h) <= 0 && (!nearest || compareX(point, nearest) > 0)) {
      nearest = point; edgeIndex = index;
    }
  }
  if (!nearest) throw invariantFailure('partition hole has no interior bridge');
  const joined = [...outline];
  if (nearest.key === joined[(edgeIndex + 1) % joined.length].key) edgeIndex = (edgeIndex + 1) % joined.length;
  else if (nearest.key !== joined[edgeIndex].key) joined.splice(++edgeIndex, 0, nearest);
  const loop = [...hole.slice(first), ...hole.slice(0, first + 1)];
  return [...joined.slice(0, edgeIndex + 1), ...loop, nearest, ...joined.slice(edgeIndex + 1)];
}

interface Vertex { point: Point; box: Box; previous: Vertex; next: Vertex; alive: boolean }

/** Exact ear decisions retain features below the candidate triangulator's precision. */
function exactEars(outline: Ring): Region {
  const vertices = outline.map(point => ({ point, box: extent([[point]]), alive: true } as Vertex));
  vertices.forEach((vertex, index) => {
    vertex.previous = vertices[(index + vertices.length - 1) % vertices.length];
    vertex.next = vertices[(index + 1) % vertices.length];
  });
  const index = new BoxIndex(vertices), result: Region = [];
  let current = vertices[0], count = vertices.length, misses = 0;
  const remove = (vertex: Vertex) => {
    vertex.alive = false; vertex.previous.next = vertex.next; vertex.next.previous = vertex.previous; count--;
  };
  while (count > 3) {
    const a = current.previous.point, b = current.point, c = current.next.point, turn = orient(a, b, c);
    if (!turn && (a.key === c.key || onSegment(b, a, c))) {
      const next = current.next; remove(current); current = next; misses = 0; continue;
    }
    let ear = turn > 0n;
    if (ear) for (const other of index.query(extent([[a, b, c]]))) {
      const point = other.point;
      if (!other.alive || point.key === a.key || point.key === b.key || point.key === c.key) continue;
      if (orient(a, b, point) >= 0n && orient(b, c, point) >= 0n && orient(c, a, point) >= 0n) { ear = false; break; }
    }
    if (ear) {
      result.push([a, b, c]);
      const next = current.next; remove(current); current = next; misses = 0;
    } else {
      current = current.next;
      if (++misses > count) throw invariantFailure('partition exact triangulation has no valid ear');
    }
  }
  if (count === 3) {
    const ring = [current.point, current.next.point, current.next.next.point], turn = orient(ring[0], ring[1], ring[2]);
    if (turn < 0n) throw invariantFailure('partition exact triangulation has an inverted final face');
    if (turn > 0n) result.push(ring);
  }
  return result;
}

export function triangulate(component: Region, pool: PointPool): Region {
  const vertices = component.flat(), views = component.map(ring => ring.map(point => new Vector2(...point.value)));
  const candidate = ShapeUtils.triangulateShape(views[0], views.slice(1)).map(triangle => triangle.map(index => vertices[index]));
  if (matchesBoundary(component, candidate, pool)) return candidate;
  const leftmost = (ring: Ring) => ring.reduce((a, b) => compare(a, b) < 0 ? a : b);
  const holes = component.slice(1).sort((a, b) => compare(leftmost(a), leftmost(b)));
  let outline = component[0];
  for (const hole of holes) outline = bridge(outline, hole, pool);
  const exact = exactEars(outline);
  if (!matchesBoundary(component, exact, pool)) throw invariantFailure('partition exact triangles do not conserve their boundary');
  return exact;
}
