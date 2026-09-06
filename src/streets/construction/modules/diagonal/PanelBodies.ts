import type { Polygon, Vec2 } from '../../../../../schema/blueprint';
import { difference, intersection, snapPoint } from '../../../../geom/clip';
import { bounds } from '../../../../geom/polygon';
import { DIMENSIONS as D, prism, rectangle } from '../Geometry';
import { straight } from '../Straight';
import type { ModulePrism, SidewalkWidth } from '../schema';
import { dot, insetVertex, type Side } from './Outline';

type Surface = 'sidewalk' | 'curb' | 'gutter' | 'lip';
export type Fields = Record<Surface, Polygon[]>;

/** Whole straight groups and the finite panel cells of their junction terminals. */
export function panelBodies(outlines: { sides: Side[]; tangents: number[] }[], fields: Fields): ModulePrism[] {
  const parts: ModulePrism[] = [];
  const claims: Fields = { sidewalk: [], curb: [], gutter: [], lip: [] };
  for (const outline of outlines) outline.sides.forEach((side, i, sides) => {
    const previous = sides[(i + sides.length - 1) % sides.length], next = sides[(i + 1) % sides.length];
    const innerStart = insetVertex(previous, side), innerEnd = insetVertex(side, next);
    const startBound = Math.max(dot(side.direction, side.start) + outline.tangents[i], dot(side.direction, innerStart));
    const endBound = Math.min(dot(side.direction, side.end) - outline.tangents[(i + 1) % sides.length], dot(side.direction, innerEnd));
    const phase = side.direction[0] === 0 || side.direction[1] === 0 ? 0.5 : 0;
    const start = phase + Math.ceil((startBound - phase) / 2) * 2;
    const end = phase + Math.floor((endBound - phase) / 2) * 2;
    if (end <= start) return;
    const at = (x: number, z: number): Vec2 => snapPoint([
      side.direction[0] * x + side.normal[0] * (side.offset + 0.5 + z),
      side.direction[1] * x + side.normal[1] * (side.offset + 0.5 + z),
    ]);
    const group = straight(side.width as SidewalkWidth, true);
    for (let station = start; station < end; station += 2) {
      parts.push(...group.parts.filter(part => part.role !== 'joint').map(part => ({ ...part,
        polygon: part.polygon.map(([x, z]) => at(station + x, z)) })));
    }
    const claim = (low: number, high: number) => [at(start - D.joint / 2, low), at(end + D.joint / 2, low),
      at(end + D.joint / 2, high), at(start - D.joint / 2, high)];
    claims.sidewalk.push(claim(0, side.width));
    claims.curb.push(claim(-D.curb, 0));
    claims.gutter.push(claim(-D.curb - D.gutter, -D.curb));
  });
  const cornerFields = {
    sidewalk: difference(fields.sidewalk, claims.sidewalk), curb: difference(fields.curb, claims.curb),
    gutter: difference(difference(fields.gutter, fields.lip), claims.gutter), lip: difference(fields.lip, claims.gutter),
  };
  const layers = {
    sidewalk: { role: 'panel', bottom: D.bedTop, top: D.pavedTop, pitch: 1 },
    curb: { role: 'curb', bottom: D.bedTop, top: D.pavedTop, pitch: 2 },
    gutter: { role: 'gutter', bottom: -0.008, top: 0, pitch: 2 },
    lip: { role: 'gutter-lip', bottom: -0.008, top: D.lip, pitch: 2 },
  } as const;
  for (const surface of Object.keys(layers) as Surface[]) {
    const layer = layers[surface], pitch = layer.pitch;
    for (const polygon of cornerFields[surface]) {
      const box = bounds(polygon);
      for (let x = Math.floor((box.min[0] - 0.5) / pitch); x < Math.ceil((box.max[0] - 0.5) / pitch); x++) {
        for (let z = Math.floor((box.min[1] - 0.5) / pitch); z < Math.ceil((box.max[1] - 0.5) / pitch); z++) {
          const cell = rectangle(x * pitch + 0.5 + D.joint / 2, z * pitch + 0.5 + D.joint / 2, pitch - D.joint, pitch - D.joint);
          parts.push(...intersection([polygon], [cell]).map(piece => prism(layer.role, piece, layer.bottom, layer.top)));
        }
      }
    }
  }
  return parts;
}
