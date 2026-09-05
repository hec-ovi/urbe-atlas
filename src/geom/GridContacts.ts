import { GridCellIndex } from './GridCellIndex';
import { interiorContact, pointKey } from './GridIntersections';
import { simpleCycles } from './SimpleCycles';
import type { GridPath } from './schema';

/** Node existing exact contacts without routing through neighbouring grid cells. */
export function nodeGridContacts(paths: GridPath[]): GridPath[] {
  const vertices = new Map(paths.flat().map((point) => [pointKey(point), point]));
  const index = new GridCellIndex([...vertices.values()]);
  let changed = false;
  const noded = paths.map((path) => path.flatMap((a, i) => {
    const b = path[(i + 1) % path.length];
    const contacts = index.near(a, b).filter((point) => interiorContact(point, { a, b }));
    if (contacts.length === 0) return [a];
    changed = true;
    const axis = a.x === b.x ? 'y' : 'x';
    const direction = Math.sign(b[axis] - a[axis]);
    contacts.sort((p, q) => direction * (p[axis] - q[axis]));
    return [a, ...contacts];
  }));
  return changed ? noded.flatMap(simpleCycles) : paths;
}
