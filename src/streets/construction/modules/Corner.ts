import type { Polygon } from '../../../../schema/blueprint';
import { DIMENSIONS as D, bandBody, insetBody, prism, rectangle, roadLip } from './Geometry';
import type { ModuleDefinition, ModulePrism, SidewalkWidth } from './schema';
import { measure, moduleId, moduleSizing } from './Format';

/**
 * The square corner where two sidewalk runs meet: the paving square, with the
 * curb and the gutter turning around it as two rectangles each. Streets are
 * straight runs between rectangular junction boxes, so nothing here curves.
 */
export function corner(panelWidth: SidewalkWidth, panelDepth: SidewalkWidth, sizing = moduleSizing()): ModuleDefinition {
  const width = measure(panelWidth + sizing.separator), depth = measure(panelDepth + sizing.separator);
  const parts: ModulePrism[] = [prism('joint', rectangle(0, 0, width, depth), 0, D.bedTop)];
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      parts.push(prism('panel', insetBody(rectangle(x, z, measure(Math.min(1, width - x)), measure(Math.min(1, depth - z)))), D.bedTop, D.pavedTop));
    }
  }
  // Each band turns the corner as one long leg plus the piece that squares it off.
  const legs = (inner: number, band: number): Polygon[] => [
    rectangle(measure(-inner - band), measure(-inner - band), band, measure(depth + inner + band)),
    rectangle(measure(-inner), measure(-inner - band), measure(width + inner), band),
  ];
  for (const leg of legs(0, D.curb)) {
    parts.push(prism('joint', leg, -0.03, D.bedTop), prism('curb', bandBody(leg), D.bedTop, D.pavedTop));
  }
  for (const leg of legs(D.curb, sizing.gutter)) {
    parts.push(prism('joint', leg, -0.03, -0.008),
      prism('gutter', bandBody(leg, D.lip), -0.008, 0),
      prism('gutter-lip', roadLip(leg), -0.008, D.lip));
  }
  return { id: moduleId(`corner:${panelWidth}:${panelDepth}`, sizing), parts, partitionedBeds: true };
}
