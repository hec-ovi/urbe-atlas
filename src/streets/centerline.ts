/**
 * Rules a street centerline must satisfy, shared by the tracer that draws
 * them, the graph builder that cuts them into edges, and the invariants.
 *
 * A centerline is rendered as a carriageway plus sidewalk bands, so a vertex
 * that turns the line back on itself puts those bands on top of the roadway
 * they belong to. Widest half-width is about 10 m (12 m carriageway plus a
 * 4 m sidewalk). At a 120 degree turn the two arms leave the vertex 60
 * degrees apart, so 20 m along one arm already clears the other by 17 m:
 * the corner reads as a corner. Sharper than that and the bands merge.
 */
import type { Polyline } from '../../schema/blueprint';
import { doubleBackAt, removeDoubleBacks } from '../geom/polyline';

/** Sharpest turn a centerline vertex may make, degrees. */
export const MAX_TURN_DEG = 120;

export const MAX_TURN_COS = Math.cos((MAX_TURN_DEG * Math.PI) / 180);

/** First vertex where the centerline folds back on itself, or -1. */
export const foldAt = (path: Polyline): number => doubleBackAt(path, MAX_TURN_COS);

/** Drop folds and repeated points; endpoints (the edge's nodes) are kept. */
export const cleanCenterline = (path: Polyline): Polyline => removeDoubleBacks(path, MAX_TURN_COS);
