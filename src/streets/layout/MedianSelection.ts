import type { Vec2 } from '../../../schema/blueprint';
import type { GridAxis } from './Axis';

/** Selects the closest interior grade avenue to each district center. */
export class MedianSelection {
  static select(x: GridAxis, z: GridAxis, centers: Vec2[]): { x: number[]; z: number[] } {
    const candidates = ([['x', x, 0], ['z', z, 1]] as const).flatMap(([axis, grid, coordinate]) =>
      grid.roads.flatMap((road, index) => index > 0 && index < grid.roads.length - 1
        && index !== grid.highwayIndex && road.profile.lanes.length === 4
        ? [{ axis, index, coordinate, position: road.position }] : []));
    const selected = { x: new Set<number>(), z: new Set<number>() };
    for (const center of centers) {
      const closest = [...candidates].sort((a, b) => Math.abs(a.position - center[a.coordinate]) - Math.abs(b.position - center[b.coordinate])
        || a.axis.localeCompare(b.axis) || a.index - b.index)[0];
      if (closest) selected[closest.axis].add(closest.index);
    }
    return { x: [...selected.x].sort((a, b) => a - b), z: [...selected.z].sort((a, b) => a - b) };
  }
}
