import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { arc, clipCell, CORNER_ANGLES, DIMENSIONS as D, insetBody, prism, rectangle, ringPart, transform } from './Geometry';
import type { ModuleDefinition, ModulePrism, SidewalkWidth } from './schema';
import { straightEdge } from './Straight';
import { measure, moduleId, moduleSizing } from './Format';

export function corner(panelWidth: SidewalkWidth, panelDepth: SidewalkWidth, sizing = moduleSizing()): ModuleDefinition {
  const width = measure(panelWidth + sizing.separator), depth = measure(panelDepth + sizing.separator);
  const radius = sizing.format === 'district' ? width : D.radius;
  const parts: ModulePrism[] = [];
  const sector: Polygon = [...arc(radius, CORNER_ANGLES, radius), [radius, radius]];
  if (sizing.format === 'district') parts.push(prism('joint', sector, 0, D.bedTop));
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      const cell = x < radius && z < radius ? clipCell(sector, x, z)
        : rectangle(x, z, measure(Math.min(1, width - x)), measure(Math.min(1, depth - z)));
      if (cell.length < 3) continue;
      if (sizing.format === 'source') parts.push(prism('joint', cell, 0, D.bedTop));
      parts.push(prism('panel', insetBody(cell), D.bedTop, D.pavedTop));
    }
  }
  // The same angular supports cut every curb, gutter and lip part.
  const jointAngle = D.joint / (2 * (radius + D.curb));
  for (let i = 0; i < CORNER_ANGLES.length - 1; i++) {
    const angles = [CORNER_ANGLES[i], CORNER_ANGLES[i + 1]];
    parts.push(
      prism('joint', ringPart(radius, radius + D.curb, angles, 0, radius), -0.03, D.bedTop),
      prism('curb', ringPart(radius, radius + D.curb, angles, jointAngle, radius), D.bedTop, D.pavedTop),
      prism('joint', ringPart(radius + D.curb, radius + D.curb + sizing.gutter, angles, 0, radius), -0.03, -0.008),
      prism('gutter', ringPart(radius + D.curb, radius + D.curb + sizing.gutter - D.lip, angles, jointAngle, radius), -0.008, 0),
      prism('gutter-lip', ringPart(radius + D.curb + sizing.gutter - D.lip, radius + D.curb + sizing.gutter, angles, jointAngle, radius), -0.008, D.lip),
    );
  }
  const rim = measure(D.curb + sizing.gutter);
  const roadCorner: Polygon = [[-rim, -rim], ...arc(radius + rim, CORNER_ANGLES, radius).reverse()];
  parts.push(prism('roadway', roadCorner, -0.2, 0));
  for (const part of straightEdge(measure(width - radius), sizing)) {
    parts.push({ ...part, polygon: part.polygon.map(p => transform(p, [radius, 0], 0)) });
  }
  for (const part of straightEdge(measure(depth - radius), sizing)) {
    parts.push({ ...part, polygon: part.polygon.map<Vec2>(([x, z]) => [z, x + radius]).reverse() });
  }
  return { id: moduleId(`corner:${panelWidth}:${panelDepth}`, sizing), parts,
    ...(sizing.format === 'district' ? { partitionedBeds: true as const } : {}) };
}
