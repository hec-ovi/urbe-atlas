import { GridCellIndex } from './GridCellIndex';
import { interiorContact, pointKey, type PointKey } from './GridIntersections';
import { simpleCycles } from './SimpleCycles';
import type { GridPath, GridPoint } from './schema';

/**
 * Node existing exact contacts without routing through neighbouring grid cells.
 * A path with no contact keeps its own array, so the usual clean input copies nothing.
 */
export function nodeGridContacts(paths: GridPath[]): GridPath[] {
  const vertices = new Map<PointKey, GridPoint>();
  for (const path of paths) for (const point of path) vertices.set(pointKey(point), point);
  const index = new GridCellIndex([...vertices.values()]);
  let changed = false;
  const contacts: GridPoint[] = [];
  const noded = paths.map((path) => {
    let noded: GridPath | null = null;
    for (let i = 0; i < path.length; i++) {
      const a = path[i];
      const b = path[i + 1 === path.length ? 0 : i + 1];
      if (noded) noded.push(a);
      contacts.length = 0;
      index.forEachNear(a, b, (point) => {
        if (interiorContact(point, a, b)) contacts.push(point);
      });
      if (contacts.length === 0) continue;
      if (!noded) noded = path.slice(0, i + 1);
      changed = true;
      const alongY = a.x === b.x;
      const direction = Math.sign((alongY ? b.y : b.x) - (alongY ? a.y : a.x));
      contacts.sort((p, q) => direction * ((alongY ? p.y : p.x) - (alongY ? q.y : q.x)));
      for (const contact of contacts) noded.push(contact);
    }
    return noded ?? path;
  });
  return changed ? noded.flatMap(simpleCycles) : paths;
}
