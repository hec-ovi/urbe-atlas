import type { Polygon } from '../../../../schema/blueprint';
import type { ModuleDefinition, ModulePrism } from '../../construction/modules/schema';
import { bandBody, prism, rectangle } from '../../construction/modules/Geometry';
import { measure } from '../../construction/modules/Format';

/** The island at half-width `radius`: a rectangle centred on the avenue axis. */
export function outline(length: number, radius: number): Polygon {
  return rectangle(measure(-radius + 1.7), -radius, measure(length - 3.4 + radius * 2), measure(radius * 2));
}

/** The ring between two half-widths, as the four rectangles that make it. */
function bands(length: number, inner: number, outer: number): Polygon[] {
  const [start, end] = [measure(1.7 - inner), measure(length - 1.7 + inner)];
  const band = measure(outer - inner);
  return [
    rectangle(start, inner, measure(end - start), band),
    rectangle(start, -outer, measure(end - start), band),
    rectangle(measure(start - band), -outer, band, measure(outer * 2)),
    rectangle(end, -outer, band, measure(outer * 2)),
  ];
}

export class MedianIsland {
  static build(length: number): ModuleDefinition {
    const paved = outline(length, 1), curb = bands(length, 1, 1.2), gutter = bands(length, 1.2, 1.7);
    const parts: ModulePrism[] = [prism('joint', paved, 0, 0.18), prism('panel', outline(length, 0.994), 0.18, 0.2)];
    for (const polygon of curb) parts.push(prism('joint', polygon, -0.03, 0.18), prism('curb', bandBody(polygon), 0.18, 0.2));
    for (const polygon of gutter) parts.push(prism('joint', polygon, -0.03, -0.008), prism('gutter', bandBody(polygon), -0.008, 0));
    return { id: `median:${length}`, partitionedBeds: true, parts };
  }
}
