import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { intersection } from '../../../geom/clip';
import { CORNER_ANGLES, DIMENSIONS as D, insetBody, prism, rectangle } from './Geometry';
import type { ModuleDefinition, ModulePrism, SidewalkWidth } from './schema';

/** Fixed outward road corner, with half-panel terminal rows and one formed curb cap. */
export function perimeterCorner(width: SidewalkWidth): ModuleDefinition {
  const size = width + 0.5;
  const parts: ModulePrism[] = [];
  for (let x = 0; x <= width; x++) for (let z = 0; z <= width; z++) {
    if (x === width && z === width) continue;
    const cell = rectangle(x - size, z - size, x === width ? 0.5 : 1, z === width ? 0.5 : 1);
    parts.push(prism('joint', cell, 0, D.bedTop), prism('panel', insetBody(cell), D.bedTop, D.pavedTop));
  }
  const arc = (radius: number): Polygon => CORNER_ANGLES.map((angle, index): Vec2 =>
    index === 0 ? [-radius, 0] : index === CORNER_ANGLES.length - 1 ? [0, -radius]
      : [radius * Math.cos(angle), radius * Math.sin(angle)]);
  const curb: Polygon = [[-0.5, -0.5], [0, -0.5], ...arc(D.gutter).reverse(), [-0.5, 0]];
  const gutter: Polygon = [...arc(D.gutter), [0, 0]];
  const cuts = [rectangle(-size, -size, size - D.joint / 2, size - D.joint / 2)];
  const bodies = (role: 'curb' | 'gutter' | 'gutter-lip', polygon: Polygon, bottom: number, top: number) =>
    intersection([polygon], cuts).map(polygon => prism(role, polygon, bottom, top));
  parts.push(prism('joint', curb, -0.03, D.bedTop), ...bodies('curb', curb, D.bedTop, D.pavedTop),
    prism('joint', gutter, -0.03, -0.008),
    ...bodies('gutter', [...arc(D.gutter), ...arc(D.lip).reverse()], -0.008, 0),
    ...bodies('gutter-lip', [...arc(D.lip), [0, 0]], -0.008, D.lip));
  return { id: `perimeter-corner:${width}`, parts };
}
