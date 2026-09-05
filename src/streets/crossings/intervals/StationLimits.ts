import { Directed, type Range } from './Directed';
import type { StationInterval } from './schema';

/** Inverts the monotone rounded station encoding at each outward fraction bound. */
export class StationLimits {
  private readonly length: Range;
  private readonly halfWidth: Range;
  private readonly offset: Range;

  constructor(length: number, width: number, sourceOffset: number) {
    this.length = Directed.point(length);
    this.halfWidth = Directed.point(width / 2);
    this.offset = Directed.point(sourceOffset);
  }

  domain(): StationInterval {
    const lowerLocal = this.halfWidth[0];
    const upperLocal = Directed.subtract(this.length, this.halfWidth)[0];
    return { from: this.atLeast(lowerLocal), to: this.atMost(upperLocal) };
  }

  blocker(lowerFraction: number, upperFraction: number): StationInterval {
    const lowerDistance = Directed.multiply(Directed.point(lowerFraction), this.length)[0];
    const upperDistance = Directed.multiply(Directed.point(upperFraction), this.length)[1];
    const before = Directed.subtract(Directed.point(lowerDistance), this.halfWidth)[0];
    const after = Directed.add(Directed.point(upperDistance), this.halfWidth)[1];
    return { from: this.atMost(before), to: this.atLeast(after) };
  }

  private atMost(local: number): number {
    const encoded = Directed.add(Directed.point(local), this.offset)[0];
    return Directed.subtract(Directed.point(encoded), this.offset)[0];
  }

  private atLeast(local: number): number {
    const encoded = Directed.add(Directed.point(local), this.offset)[1];
    return Directed.subtract(Directed.point(encoded), this.offset)[1];
  }
}
