import type { Polygon } from '../../../../schema/blueprint';
import { bandBody, DIMENSIONS as D, prism, rectangle, roadLip } from './Geometry';
import type { ModuleDefinition, ModulePrism } from './schema';
import { measure, moduleId, moduleSizing } from './Format';

/** Source parking dimensions, with two metres of support beyond each end of the bay. */
export const NATIVE_PARKING = { slotLength: 6, depth: 2.5, endRun: 2, apron: 2 } as const;

/**
 * A parking bay is a rectangular notch in the sidewalk: the carriageway keeps
 * its straight edge, the curb and gutter turn square around the bay, and the
 * paving takes what is left. The bay drawn inside that notch returns 45 degrees
 * over the end run at each end, so a car enters and leaves on the diagonal.
 */
export class NativeParking {
  static length(slots: number): number { return slots * NATIVE_PARKING.slotLength + NATIVE_PARKING.endRun * 2; }

  /** The bay a car sees: full length at the kerb, returning 45 degrees over the end run at each end. */
  static footprint(slots: number, sizing = moduleSizing()): Polygon {
    const rim = measure(sizing.curb + sizing.gutter), run = NATIVE_PARKING.endRun;
    const length = this.length(slots), back = measure(sizing.parkingDepth - rim);
    return [[0, -rim], [length, -rim], [measure(length - run), back], [run, back]];
  }

  static build(slots: number, sizing = moduleSizing(), panelWidth = 6): ModuleDefinition {
    const apron = NATIVE_PARKING.apron, bay = this.length(slots), length = bay + apron * 2;
    const rim = measure(sizing.curb + sizing.gutter), rear = measure(sizing.parkingDepth - rim);
    const width = measure(panelWidth + sizing.separator), gutter = sizing.gutter;
    // Each band runs in at its distance from the carriageway, up the end of
    // the notch, along its back and out again: five rectangles.
    const notch = (from: number, to: number): Polygon[] => {
      const [low, high] = [measure(apron - to), measure(apron + bay + from)];
      const z0 = measure(-rim + from);
      const wall = measure(rear + to - z0);
      return [
        rectangle(0, z0, low, measure(to - from)),
        rectangle(low, z0, measure(to - from), wall),
        rectangle(measure(apron - from), measure(rear + from), measure(bay + from * 2), measure(to - from)),
        rectangle(high, z0, measure(to - from), wall),
        rectangle(measure(high + to - from), z0, measure(length - high - to + from), measure(to - from)),
      ];
    };
    const parts: ModulePrism[] = [prism('roadway', rectangle(apron, -rim, bay, measure(sizing.parkingDepth)), -0.2, 0)];
    notch(gutter, rim).forEach((leg) => {
      parts.push(prism('joint', leg, -0.03, D.bedTop), prism('curb', bandBody(leg), D.bedTop, D.pavedTop));
    });
    notch(0, gutter).forEach((leg, index) => {
      const alongRoad = index !== 1 && index !== 3;
      parts.push(prism('joint', leg, -0.03, -0.008),
        prism('gutter', alongRoad ? bandBody(leg, D.lip) : bandBody(leg), -0.008, 0));
      if (alongRoad) parts.push(prism('gutter-lip', roadLip(leg), -0.008, D.lip));
    });
    const paved = [
      rectangle(0, 0, measure(apron - rim), width),
      rectangle(measure(apron - rim), measure(rear + rim), measure(bay + rim * 2), measure(width - rear - rim)),
      rectangle(measure(apron + bay + rim), 0, measure(apron - rim), width),
    ];
    for (const bed of paved) {
      parts.push(prism('joint', bed, 0, D.bedTop));
      const [x0, z0] = bed[0], [x1, z1] = bed[2];
      for (let x = x0; x < x1 - 1e-9; x++) {
        for (let z = z0; z < z1 - 1e-9; z++) {
          const cell = rectangle(x + D.joint / 2, z + D.joint / 2,
            measure(Math.min(1, x1 - x) - D.joint), measure(Math.min(1, z1 - z) - D.joint));
          parts.push(prism('panel', cell, D.bedTop, D.pavedTop));
        }
      }
    }
    return { id: moduleId(`parking-native:${panelWidth}:${slots}`, sizing), partitionedBeds: true, parts };
  }
}
