import type { Polygon, Vec2 } from '../../../../../schema/blueprint';
import { difference, offset, snapPoint } from '../../../../geom/clip';
import { area } from '../../../../geom/polygon';
import { invalidParams, unsatisfiable } from '../../../../errors';
import { DIMENSIONS as D, prism, rectangle } from '../Geometry';
import { halfPlane, rounded, sides } from './Outline';
import { panelBodies } from './PanelBodies';
import { band } from './Bands';
import type { DiagonalBlockInput, DiagonalBlockTemplate } from './schema';

export class DiagonalBlock {
  static build(input: DiagonalBlockInput): DiagonalBlockTemplate {
    const { width, depth, angle, roadWidth, reach } = input;
    if (![width, depth].every(value => Number.isSafeInteger(value) && value >= 48)
      || ![30, 45].includes(angle) || !Number.isSafeInteger(roadWidth) || roadWidth < 3 || roadWidth > 8
      || !Number.isFinite(reach) || reach <= 0 || reach >= width
      || input.sidewalks.length !== 4 || ![...input.sidewalks, input.diagonalSidewalk].every(value => [2, 4, 6].includes(value))) {
      throw invalidParams('diagonal block requires whole dimensions, 30/45 degrees and supported sidewalk widths');
    }
    const radians = angle * Math.PI / 180;
    const normal: Vec2 = [Math.sin(radians), Math.cos(radians)];
    const axis = { normal, offset: normal[0] * reach };
    if (axis.offset / normal[1] >= depth) throw unsatisfiable('diagonal cut must join the south and west sides');
    const owner = rectangle(0, 0, width, depth);
    const pieces = [halfPlane(owner, normal, axis.offset + roadWidth / 2),
      halfPlane(owner, [-normal[0], -normal[1]], -axis.offset + roadWidth / 2)];
    const outlines = pieces.map(piece => {
      if (piece.length < 3) throw unsatisfiable('diagonal block has no land on one side');
      const source = sides(piece, direction => direction[1] === 0 ? input.sidewalks[direction[0] > 0 ? 0 : 2]
        : direction[0] === 0 ? input.sidewalks[direction[1] > 0 ? 1 : 3] : input.diagonalSidewalk);
      return { sides: source, ...rounded(source) };
    });
    const interiors = outlines.map(outline => {
      const polygon = outline.sides.reduce((land, side) => halfPlane(land, side.normal, side.offset + side.width + 0.5), owner);
      if (polygon.length < 3 || area(polygon) < 100) throw unsatisfiable('diagonal block lacks usable building land');
      return polygon.map(snapPoint);
    });
    const land = outlines.map(outline => outline.polygon);
    const curbOuter = land.map(polygon => offset([polygon], -D.gutter)[0]);
    const pavedOuter = land.map(polygon => offset([polygon], -D.gutter - D.curb)[0]);
    const fields = {
      sidewalk: pavedOuter.flatMap((polygon, i) => band(polygon, interiors[i])),
      curb: curbOuter.flatMap((polygon, i) => band(polygon, pavedOuter[i])),
      gutter: land.flatMap((polygon, i) => band(polygon, curbOuter[i])),
      lip: land.flatMap(polygon => band(polygon, offset([polygon], -D.lip)[0])),
    };
    const roadway = difference([owner], land);
    const id = `diagonal:${angle}:${width}:${depth}:${roadWidth}:${reach}:${input.sidewalks.join(':')}:${input.diagonalSidewalk}`;
    const parts = [
      ...roadway.map(polygon => prism('roadway', polygon, -0.2, 0)),
      ...fields.sidewalk.map(polygon => prism('joint', polygon, 0, D.bedTop)),
      ...fields.curb.map(polygon => prism('joint', polygon, -0.03, D.bedTop)),
      ...fields.gutter.map(polygon => prism('joint', polygon, -0.03, -0.008)),
      ...panelBodies(outlines, fields),
    ];
    return { definition: { id, parts, partitionedBeds: true }, interiors, axis };
  }
}
