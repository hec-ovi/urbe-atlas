import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { intersection, offset } from '../../../geom/clip';
import { DIMENSIONS as D, prism, rectangle } from './Geometry';
import type { ModuleDefinition, ModulePrism } from './schema';

/** Source parking dimensions, with two metres of support beyond each diagonal end. */
export const NATIVE_PARKING = { slotLength: 6, depth: 2.5, endRun: 2, apron: 2 } as const;

export class NativeParking {
  static length(slots: number): number { return slots * NATIVE_PARKING.slotLength + NATIVE_PARKING.endRun * 2; }

  static footprint(slots: number): Polygon {
    const end = this.length(slots);
    return [[0, -0.5], [end, -0.5], [end - 2, 2], [2, 2]];
  }

  static build(slots: number): ModuleDefinition {
    const length = this.length(slots) + 4;
    const road: Polygon = [[0, -0.5], [2, -0.5], [4, 2], [length - 4, 2], [length - 2, -0.5], [length, -0.5]];
    const curbFront = this.parallel(road, D.gutter), pavedFront = this.parallel(road, D.gutter + D.curb);
    const band = (first: Polygon, last: Polygon): Polygon => [...first, ...[...last].reverse()];
    const gutter = band(road, curbFront), curb = band(curbFront, pavedFront);
    const paved: Polygon = [...pavedFront, [length, 6], [0, 6]];
    const parts: ModulePrism[] = [
      prism('roadway', this.footprint(slots).map(([x, z]) => [x + 2, z]), -0.2, 0),
      prism('joint', gutter, -0.03, -0.008), prism('gutter', gutter, -0.008, 0),
      prism('joint', curb, -0.03, D.bedTop), prism('curb', curb, D.bedTop, D.pavedTop),
      prism('joint', paved, 0, D.bedTop),
    ];
    // The saved module remains a complete physical compatibility surface. Streets owns native panel fitting.
    for (let x = 0; x < length; x++) for (let z = 0; z < 6; z++) {
      const cells = intersection([paved], [rectangle(x, z, 1, 1)]);
      for (const body of offset(cells, -D.joint / 2)) parts.push(prism('panel', body, D.bedTop, D.pavedTop));
    }
    return { id: `parking-native:6:${slots}`, partitionedBeds: true, parts };
  }

  /** Shared authored offset vertices, never independently clipped on each side of a band. */
  private static parallel(path: Polygon, width: number): Polygon {
    const normals = path.slice(1).map((point, i): Vec2 => {
      const dx = point[0] - path[i][0], dz = point[1] - path[i][1], length = Math.hypot(dx, dz);
      return [-dz / length, dx / length];
    });
    return path.map((point, i): Vec2 => {
      const a = normals[Math.max(0, i - 1)], b = normals[Math.min(i, normals.length - 1)];
      const gain = width / (1 + a[0] * b[0] + a[1] * b[1]);
      return [Math.round((point[0] + (a[0] + b[0]) * gain) * 1000) / 1000,
        Math.round((point[1] + (a[1] + b[1]) * gain) * 1000) / 1000];
    });
  }
}
