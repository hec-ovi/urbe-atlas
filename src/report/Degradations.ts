/**
 * One element never kills a plan.
 *
 * When a walking strip, a crossing, a lot or a station fails its own check, it
 * is published in its simplest valid form and listed here. The blueprint
 * carries the list as `report.degraded`. E_INVARIANT is left for a plan with no
 * valid form at all.
 */
import type { DegradedElement, DegradedKind } from '../../schema/blueprint';
import { AtlasError } from '../errors';

export class Degradations {
  private readonly entries: DegradedElement[] = [];

  /** Records one element that lost a feature, with the reason in plain words. */
  add(kind: DegradedKind, id: string, reason: string): void {
    this.entries.push({ id, kind, reason });
  }

  /** Builds one element; a failed check degrades it to `simplest` instead of throwing. */
  attempt<T>(kind: DegradedKind, id: string, build: () => T, simplest: T): T {
    try {
      return build();
    } catch (error) {
      if (!(error instanceof AtlasError) || error.code === 'E_INVALID_PARAMS') throw error;
      this.add(kind, id, error.message);
      return simplest;
    }
  }

  /** In generation order, which is deterministic. */
  published(): DegradedElement[] {
    return this.entries.map(entry => ({ ...entry }));
  }
}
