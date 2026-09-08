import type { Polygon } from '../../../../../schema/blueprint';
import { snap } from '../../../../geom/clip';
import { DIMENSIONS as D, prism, rectangle } from '../Geometry';
import type { ModulePrism, ModuleRole } from '../schema';
import { rectangles } from './Rectangles';

export function panels(polygons: Polygon[]): ModulePrism[] {
  const parts: ModulePrism[] = [], half = D.joint / 2;
  for (const rect of rectangles(polygons)) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      for (let z = rect.z; z < rect.z + rect.depth; z++) {
        parts.push(prism('panel', rectangle(x + half, z + half, 1 - D.joint, 1 - D.joint), D.bedTop, D.pavedTop));
      }
    }
  }
  return parts;
}

/** Station joints run across each narrow band, preserving its full width. */
export function bandBodies(polygons: Polygon[], role: ModuleRole, bottom: number, top: number): ModulePrism[] {
  const parts: ModulePrism[] = [], half = D.joint / 2;
  for (const rect of rectangles(polygons)) {
    const horizontal = rect.width >= rect.depth;
    const start = horizontal ? rect.x : rect.z;
    const end = start + (horizontal ? rect.width : rect.depth);
    for (let station = Math.floor(start / 2) * 2; station < end; station += 2) {
      const low = Math.max(start, station + half), high = Math.min(end, station + 2 - half);
      if (high <= low) continue;
      const polygon = horizontal ? rectangle(low, rect.z, high - low, rect.depth)
        : rectangle(rect.x, low, rect.width, high - low);
      parts.push(prism(role, polygon.map(([x, z]) => [snap(x), snap(z)]), bottom, top));
    }
  }
  return parts;
}
