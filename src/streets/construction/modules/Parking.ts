import type { Polygon } from '../../../../schema/blueprint';
import { DIMENSIONS as D, insetBody, jointedBand, prism, rectangle } from './Geometry';
import type { ModuleDefinition, ModulePrism, SidewalkWidth } from './schema';
import { straight } from './Straight';

/** A fixed two-station return, with full panels and shared orthogonal curb offsets. */
function terminal(width: SidewalkWidth): ModulePrism[] {
  const parts: ModulePrism[] = [];
  for (let x = 0; x < 2; x++) {
    for (let z = x === 0 ? 0 : 2; z < width; z++) {
      const cell = rectangle(x, z, 1, 1);
      parts.push(prism('joint', cell, 0, D.bedTop), prism('panel', insetBody(cell), D.bedTop, D.pavedTop));
    }
  }
  const contour = (offset: number): Polygon => [[0, -offset], [1 + offset, -offset], [1 + offset, 2 - offset], [2, 2 - offset]];
  const band = (inner: number, outer: number, segment: number): Polygon => {
    const a = contour(inner), b = contour(outer);
    return [a[segment], b[segment], b[segment + 1], a[segment + 1]];
  };
  for (let segment = 0; segment < 3; segment++) {
    const curb = band(0, D.curb, segment);
    const gutter = band(D.curb, D.curb + D.gutter - D.lip, segment);
    const lip = band(D.curb + D.gutter - D.lip, D.curb + D.gutter, segment);
    parts.push(
      prism('joint', curb, -0.03, D.bedTop), prism('curb', jointedBand(curb), D.bedTop, D.pavedTop),
      prism('joint', band(D.curb, D.curb + D.gutter, segment), -0.03, -0.008),
      prism('gutter', jointedBand(gutter), -0.008, 0), prism('gutter-lip', jointedBand(lip), -0.008, D.lip),
    );
  }
  parts.push(prism('roadway', rectangle(1.5, -0.5, 0.5, 2), -0.2, 0));
  return parts;
}

export function parking(width: SidewalkWidth, slots: number, centerDouble: boolean): ModuleDefinition {
  const length = 4 + slots * 4;
  const entry = terminal(width);
  const parts = [...entry, ...entry.map(part => ({ ...part,
    polygon: part.polygon.map(([x, z]): [number, number] => [length - x, z]).reverse(),
  }))];
  const back = straight((width - 2) as SidewalkWidth, centerDouble);
  for (let station = 2; station < length - 2; station += 2) {
    for (const part of back.parts) parts.push({ ...part,
      polygon: part.polygon.map(([x, z]) => [x + station, z + 2]),
    });
    parts.push(prism('roadway', rectangle(station, -0.5, 2, 2), -0.2, 0));
  }
  for (let slot = 0; slot <= slots; slot++) {
    parts.push(prism('marking', rectangle(2 + slot * 4 - 0.04, -0.35, 0.08, 1.55), 0, 0.004));
  }
  return { id: `parking:${width}:${slots}:${centerDouble ? 'middle' : 'unit'}`, parts };
}
