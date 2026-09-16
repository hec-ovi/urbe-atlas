import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import type { ModuleDefinition, ModulePrism } from '../../construction/modules/schema';
import { prism, rectangle } from '../../construction/modules/Geometry';
import { measure } from '../../construction/modules/Format';

const steps = 12;

/** All adjacent bands share these exact cap stations. */
function cap(center: number, radius: number, start: number): Polygon {
  return Array.from({ length: steps + 1 }, (_, i): Vec2 => {
    const angle = start + Math.PI * i / steps;
    return [measure(center + radius * Math.cos(angle)), measure(radius * Math.sin(angle))];
  });
}

export function outline(length: number, radius: number): Polygon {
  return [...cap(1.7, radius, Math.PI / 2), ...cap(length - 1.7, radius, Math.PI * 1.5)];
}

function bands(length: number, inner: number, outer: number): Polygon[] {
  const rings: Polygon[] = [rectangle(1.7, inner, length - 3.4, outer - inner),
    rectangle(1.7, -outer, length - 3.4, outer - inner)];
  for (const [center, angle] of [[1.7, Math.PI / 2], [length - 1.7, Math.PI * 1.5]]) {
    const inside = cap(center, inner, angle), outside = cap(center, outer, angle);
    for (let i = 0; i < steps; i++) rings.push([outside[i], outside[i + 1], inside[i + 1], inside[i]]);
  }
  return rings;
}

export class MedianIsland {
  static build(length: number): ModuleDefinition {
    const paved = outline(length, 1), curb = bands(length, 1, 1.2), gutter = bands(length, 1.2, 1.7);
    const parts: ModulePrism[] = [prism('joint', paved, 0, 0.18), prism('panel', outline(length, 0.994), 0.18, 0.2)];
    for (const polygon of curb) parts.push(prism('joint', polygon, -0.03, 0.18), prism('curb', polygon, 0.18, 0.2));
    for (const polygon of gutter) parts.push(prism('joint', polygon, -0.03, -0.008), prism('gutter', polygon, -0.008, 0));
    return { id: `median:${length}`, partitionedBeds: true, parts };
  }
}
