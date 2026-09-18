import type { Polygon, Vec2 } from '../../../../schema/blueprint';
import { intersection } from '../../../geom/clip';
import { area } from '../../../geom/polygon';
import { PolygonIndex } from '../../../geom/PolygonIndex';
import { bandBody, DIMENSIONS as D, insetBody, prism, rectangle, transform } from './Geometry';
import type { ModuleDefinition, ModulePrism, PerimeterModuleInput, QuarterTurn, SidewalkWidth } from './schema';
import { measure, moduleId, moduleSizing, type ModuleSizing } from './Format';

/** A unit overlapping excluded land by less than this is touching its outline, not standing in it. */
const CONTACT_AREA = 1e-9;

/** One placeable stretch of the ring: whole 2 m units, then an optional shorter tail unit. */
export interface PerimeterRun {
  /** Station from the side's start corner. */
  start: number;
  end: number;
  units: number;
  /** Length of the trailing short unit, 0 when the run ends on a whole unit. */
  tail: number;
}

export interface PerimeterSide {
  side: QuarterTurn;
  /** Module station origin and its quarter turn. */
  origin: Vec2;
  turn: QuarterTurn;
  /** Road-facing corner points, station 0 at start. */
  start: Vec2;
  end: Vec2;
  length: number;
  runs: PerimeterRun[];
}

export interface PerimeterCorner {
  origin: Vec2;
  /** A corner stands only on dry land between two placed neighbours. */
  placed: boolean;
}

export interface PerimeterSections {
  sides: PerimeterSide[];
  corners: PerimeterCorner[];
}

/**
 * Splits the ring into its placeable units and drops every unit that stands in excluded land
 * (water reaching the city boundary), so the ring stops at the shoreline instead of crossing it.
 */
export function perimeterSections(input: PerimeterModuleInput, sizing: Readonly<ModuleSizing> = moduleSizing()): PerimeterSections {
  const rim = measure(sizing.curb + sizing.gutter);
  const reach = measure(input.width + sizing.separator + rim);
  const { min, max } = input.bounds;
  const spans = [measure(max[0] - min[0]), measure(max[1] - min[1])];
  const origins: Vec2[] = [[max[0], min[1] - rim], [max[0] + rim, max[1]], [min[0], max[1] + rim], [min[0] - rim, min[1]]];
  const points: Vec2[] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
  const turns: QuarterTurn[] = [2, 3, 0, 1];
  const excluded = input.exclusions?.length ? new PolygonIndex(input.exclusions) : undefined;
  const wet = (polygon: Polygon): boolean => {
    if (!excluded) return false;
    const near = excluded.near(polygon);
    return near.length > 0 && intersection([polygon], near).some(piece => area(piece) > CONTACT_AREA);
  };
  const band = (side: number, start: number, span: number): Polygon =>
    rectangle(start, -rim, span, reach).map(point => transform(point, origins[side], turns[side]));

  const sides = turns.map((turn, side): PerimeterSide => {
    const length = spans[side % 2];
    const whole = Math.floor(length / 2), tail = measure(length % 2);
    const units = Array.from({ length: whole }, (_, index) => ({ start: index * 2, span: 2 }));
    if (tail) units.push({ start: whole * 2, span: tail });
    // One test per side keeps a dry side at its original single run.
    const dry = wet(band(side, 0, length)) ? units.map(unit => !wet(band(side, unit.start, unit.span))) : units.map(() => true);
    const runs: PerimeterRun[] = [];
    units.forEach((unit, index) => {
      if (!dry[index]) return;
      const end = measure(unit.start + unit.span);
      const open = dry[index - 1] ? runs.at(-1) : undefined;
      if (!open) runs.push({ start: unit.start, end, units: unit.span === 2 ? 1 : 0, tail: unit.span === 2 ? 0 : unit.span });
      else if (unit.span === 2) { open.end = end; open.units++; }
      else { open.end = end; open.tail = unit.span; }
    });
    return { side: side as QuarterTurn, origin: origins[side], turn, start: points[(side + 1) % 4], end: points[side], length, runs };
  });
  const corners = points.map((origin, side): PerimeterCorner => ({
    origin,
    placed: sides[side].runs.at(-1)?.end === sides[side].length && sides[(side + 3) % 4].runs[0]?.start === 0
      && !wet(rectangle(-reach, -reach, reach, reach).map(point => transform(point, origin, side as QuarterTurn))),
  }));
  return { sides, corners };
}

/** The square outward road corner of the ring: two paving rectangles, then the curb and gutter that square it off. */
export function perimeterCorner(width: SidewalkWidth, sizing = moduleSizing()): ModuleDefinition {
  const rim = measure(sizing.curb + sizing.gutter), size = measure(width + sizing.separator + rim);
  const parts: ModulePrism[] = [];
  const paving = [rectangle(-size, -size, measure(size - rim), size), rectangle(-rim, -size, rim, measure(size - rim))];
  for (const bed of paving) {
    parts.push(prism('joint', bed, 0, D.bedTop));
    const [x0, z0] = bed[0], [x1, z1] = bed[2];
    for (let x = x0; x < x1 - 1e-9; x++) {
      for (let z = z0; z < z1 - 1e-9; z++) {
        parts.push(prism('panel', insetBody(rectangle(x, z, measure(Math.min(1, x1 - x)), measure(Math.min(1, z1 - z)))), D.bedTop, D.pavedTop));
      }
    }
  }
  // The bands run the other way here: the corner point is the road side.
  const gutter = sizing.gutter;
  for (const leg of [rectangle(-rim, -rim, D.curb, rim), rectangle(measure(-gutter), -rim, gutter, D.curb)]) {
    parts.push(prism('joint', leg, -0.03, D.bedTop), prism('curb', bandBody(leg), D.bedTop, D.pavedTop));
  }
  parts.push(
    prism('joint', rectangle(measure(-gutter), measure(-gutter), gutter, gutter), -0.03, -0.008),
    prism('gutter', rectangle(measure(-gutter), measure(-gutter), measure(gutter - D.lip), measure(gutter - D.lip)), -0.008, 0),
    prism('gutter-lip', rectangle(measure(-D.lip), measure(-gutter), D.lip, gutter), -0.008, D.lip),
    prism('gutter-lip', rectangle(measure(-gutter), measure(-D.lip), measure(gutter - D.lip), D.lip), -0.008, D.lip),
  );
  return { id: moduleId(`perimeter-corner:${width}`, sizing), parts, partitionedBeds: true };
}
