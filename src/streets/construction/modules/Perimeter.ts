import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { intersection, offset } from '../../../geom/clip';
import { CORNER_ANGLES, DIMENSIONS as D, prism, rectangle } from './Geometry';
import type { ModuleDefinition, ModulePrism, SidewalkWidth } from './schema';
import { measure, moduleId, moduleSizing } from './Format';

/** Fixed outward road corner, with fitted terminal rows and one formed curb cap. */
export function perimeterCorner(width: SidewalkWidth, sizing = moduleSizing()): ModuleDefinition {
  const rim = measure(sizing.curb + sizing.gutter), size = measure(width + sizing.separator + rim);
  const parts: ModulePrism[] = [];
  const paving = [rectangle(-size, -size, size - rim, size), rectangle(-rim, -size, rim, size - rim)];
  for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) {
    const cell = rectangle(measure(x - size), measure(z - size), measure(Math.min(1, size - x)), measure(Math.min(1, size - z)));
    for (const piece of intersection([cell], paving)) {
      parts.push(prism('joint', piece, 0, D.bedTop));
      for (const body of offset([piece], -D.joint / 2)) parts.push(prism('panel', body, D.bedTop, D.pavedTop));
    }
  }
  const arc = (radius: number): Polygon => CORNER_ANGLES.map((angle, index): Vec2 =>
    index === 0 ? [-radius, 0] : index === CORNER_ANGLES.length - 1 ? [0, -radius]
      : [radius * Math.cos(angle), radius * Math.sin(angle)]);
  const curb: Polygon = [[-rim, -rim], [0, -rim], ...arc(sizing.gutter).reverse(), [-rim, 0]];
  const gutter: Polygon = [...arc(sizing.gutter), [0, 0]];
  const cuts = [rectangle(-size, -size, size - D.joint / 2, size - D.joint / 2)];
  const bodies = (role: 'curb' | 'gutter' | 'gutter-lip', polygon: Polygon, bottom: number, top: number) =>
    intersection([polygon], cuts).map(polygon => prism(role, polygon, bottom, top));
  parts.push(prism('joint', curb, -0.03, D.bedTop), ...bodies('curb', curb, D.bedTop, D.pavedTop),
    prism('joint', gutter, -0.03, -0.008),
    ...bodies('gutter', [...arc(sizing.gutter), ...arc(D.lip).reverse()], -0.008, 0),
    ...bodies('gutter-lip', [...arc(D.lip), [0, 0]], -0.008, D.lip));
  return { id: moduleId(`perimeter-corner:${width}`, sizing), parts };
}
