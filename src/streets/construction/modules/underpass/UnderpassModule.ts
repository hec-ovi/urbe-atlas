import type { Polygon } from '../../../../../schema/blueprint';
import { invalidParams, invariantFailure } from '../../../../errors';
import { difference, intersection, offset, union } from '../../../../geom/clip';
import { corner } from '../Corner';
import { DIMENSIONS as D, prism, rectangle, transform } from '../Geometry';
import { measure, moduleId, moduleSizing, onGrid } from '../Format';
import type { SidewalkWidth } from '../schema';
import { bandBodies, panels } from './Bodies';
import type { UnderpassInput, UnderpassTemplate } from './schema';

export class UnderpassModule {
  static build(input: UnderpassInput): UnderpassTemplate {
    if (!input) throw invalidParams('underpass requires physical corner dimensions');
    const sizing = moduleSizing(input.format), district = sizing.format === 'district';
    if (![input.startWidth, input.endWidth, input.startReturn, input.endReturn].every(value => (district ? [4.2] : [2, 4, 6]).includes(value))
      || !(district ? onGrid(input.span, 0.2) : Number.isSafeInteger(input.span)) || input.span <= 0) {
      throw invalidParams('underpass dimensions must match the source or district construction format');
    }
    const { startWidth, endWidth, startReturn, endReturn, span } = input;
    const width = Math.min(startWidth, endWidth), rim = measure(sizing.curb + sizing.gutter);
    const length = measure(startReturn + span + 2 * rim + endReturn);
    if (!Number.isSafeInteger(length * (district ? 1000 : 1))) throw invalidParams('underpass length exceeds its construction grid');
    const owner = union([
      rectangle(0, -rim, startReturn + rim, startWidth + rim),
      rectangle(startReturn + rim, -rim, span, width + 2 * rim),
      rectangle(length - endReturn - rim, -rim, endReturn + rim, endWidth + rim),
    ]);
    if (owner.length !== 1) throw invariantFailure('underpass must have one connected owner');
    const cornerBeds = (definition: ReturnType<typeof corner>, origin: [number, number], turn: 0 | 1): Polygon[] =>
      definition.parts.filter(part => part.role === 'joint' && part.bottom === 0)
        .map(part => part.polygon.map(point => transform(point, origin, turn)));
    const panelsFor = (width: number): SidewalkWidth => district ? 4 : width as SidewalkWidth;
    const paved = union([
      ...cornerBeds(corner(panelsFor(startWidth), panelsFor(startReturn), sizing), [startReturn, 0], 1),
      ...cornerBeds(corner(panelsFor(endReturn), panelsFor(endWidth), sizing), [length - endReturn, 0], 0),
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
    return { definition: { id: moduleId(`underpass:${startWidth}:${endWidth}:${startReturn}:${endReturn}:${span}`, sizing), parts, partitionedBeds: true }, boundary: owner[0] };
  }
}
