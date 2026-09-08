import type { Polygon } from '../../../../../schema/blueprint';
import { invalidParams, invariantFailure } from '../../../../errors';
import { difference, intersection, offset, union } from '../../../../geom/clip';
import { corner } from '../Corner';
import { DIMENSIONS as D, prism, rectangle, transform } from '../Geometry';
import { bandBodies, panels } from './Bodies';
import type { UnderpassInput, UnderpassTemplate } from './schema';

export class UnderpassModule {
  static build(input: UnderpassInput): UnderpassTemplate {
    if (!input || ![input.startWidth, input.endWidth, input.startReturn, input.endReturn].every(value => [2, 4, 6].includes(value))
      || !Number.isSafeInteger(input.span) || input.span <= 0) {
      throw invalidParams('underpass requires 2/4/6 m widths and returns and a positive whole metre span');
    }
    const { startWidth, endWidth, startReturn, endReturn, span } = input;
    const length = startReturn + span + 1 + endReturn;
    if (!Number.isSafeInteger(length)) throw invalidParams('underpass length must be a safe whole metre dimension');
    const width = Math.min(startWidth, endWidth), rim = D.curb + D.gutter;
    const owner = union([
      rectangle(0, -rim, startReturn + rim, startWidth + rim),
      rectangle(startReturn + rim, -rim, span, width + 2 * rim),
      rectangle(length - endReturn - rim, -rim, endReturn + rim, endWidth + rim),
    ]);
    if (owner.length !== 1) throw invariantFailure('underpass must have one connected owner');
    const cornerBeds = (definition: ReturnType<typeof corner>, origin: [number, number], turn: 0 | 1): Polygon[] =>
      definition.parts.filter(part => part.role === 'joint' && part.bottom === 0)
        .map(part => part.polygon.map(point => transform(point, origin, turn)));
    const paved = union([
      ...cornerBeds(corner(startWidth, startReturn), [startReturn, 0], 1),
      ...cornerBeds(corner(endReturn, endWidth), [length - endReturn, 0], 0),
      rectangle(0, 0, length, width),
    ]);
    const curbOuter = intersection(offset(paved, D.curb), owner);
    const gutterOuter = intersection(offset(paved, rim), owner);
    const curb = difference(curbOuter, paved), gutter = difference(gutterOuter, curbOuter);
    const lip = difference(gutterOuter, offset(paved, rim - D.lip));
    const parts = [
      ...difference(owner, gutterOuter).map(polygon => prism('roadway', polygon, -0.2, 0)),
      ...paved.map(polygon => prism('joint', polygon, 0, D.bedTop)),
      ...curb.map(polygon => prism('joint', polygon, -0.03, D.bedTop)),
      ...gutter.map(polygon => prism('joint', polygon, -0.03, -0.008)),
      ...panels(paved),
      ...bandBodies(curb, 'curb', D.bedTop, D.pavedTop),
      ...bandBodies(difference(gutter, lip), 'gutter', -0.008, 0),
      ...bandBodies(lip, 'gutter-lip', -0.008, D.lip),
    ];
    return { definition: { id: `underpass:${startWidth}:${endWidth}:${startReturn}:${endReturn}:${span}`, parts, partitionedBeds: true }, boundary: owner[0] };
  }
}
