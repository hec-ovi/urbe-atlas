import { DIMENSIONS as D, insetBody, prism, rectangle } from './Geometry';
import type { ModuleDefinition, ModulePrism, SidewalkWidth } from './schema';

export function straight(width: SidewalkWidth, centerDouble: boolean): ModuleDefinition {
  const parts: ModulePrism[] = [prism('joint', rectangle(0, 0, 2, width), 0, D.bedTop)];
  const middle = centerDouble && width >= 4 ? (width - 2) / 2 : -1;
  for (let row = 0; row < width; row++) {
    if (row === middle) {
      parts.push(prism('panel', insetBody(rectangle(0, row, 2, 2)), D.bedTop, D.pavedTop));
      row++;
    } else {
      for (let column = 0; column < 2; column++) {
        parts.push(prism('panel', insetBody(rectangle(column, row, 1, 1)), D.bedTop, D.pavedTop));
      }
    }
  }
  parts.push(...straightEdge(2));
  return { id: `straight:${width}:${centerDouble ? 'middle' : 'unit'}`, parts };
}

/** Curb and gutter share the two-panel station endpoints. */
export function straightEdge(length: number): ModulePrism[] {
  const parts: ModulePrism[] = [];
  for (let station = 0; station < length; station += 2) {
    const half = D.joint / 2;
    parts.push(
      prism('joint', rectangle(station, -D.curb, 2, D.curb), -0.03, D.bedTop),
      prism('curb', rectangle(station + half, -D.curb, 2 - D.joint, D.curb), D.bedTop, D.pavedTop),
      prism('joint', rectangle(station, -D.curb - D.gutter, 2, D.gutter), -0.03, -0.008),
      prism('gutter', rectangle(station + half, -D.curb - D.gutter + D.lip, 2 - D.joint, D.gutter - D.lip), -0.008, 0),
      prism('gutter-lip', rectangle(station + half, -D.curb - D.gutter, 2 - D.joint, D.lip), -0.008, D.lip),
    );
  }
  return parts;
}

export function guardrail(): ModuleDefinition {
  return { id: 'guardrail:2', parts: [
    prism('guardrail', rectangle(0.08, 0.46, 0.08, 0.08), D.pavedTop, 1.2),
    prism('guardrail', rectangle(1.84, 0.46, 0.08, 0.08), D.pavedTop, 1.2),
    prism('guardrail', rectangle(0.16, 0.46, 1.68, 0.08), 1.12, 1.2),
    prism('guardrail', rectangle(0.16, 0.46, 1.68, 0.08), 0.68, 0.76),
  ] };
}
