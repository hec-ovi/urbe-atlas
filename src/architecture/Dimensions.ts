/**
 * Walking dimensions inside a corridor's reserved side width.
 *
 * The streets box builds the curb, gutter and paving inside the same width;
 * these numbers only decide where people walk.
 */

/** Held against the carriageway for the curb and gutter the streets box builds there. */
export const KERB_MARGIN = 0.5;

/** Held against the lot line, so a doorway never opens straight onto a walking centerline. */
export const FRONTAGE_MARGIN = 0.25;

/** Narrowest walking lane: two people pass. */
export const MIN_WALKING_WIDTH = 1.5;

/** Clear walking width per lane. A wider side carries another lane. */
export const WALKING_LANE_PITCH = 1.8;

/** Most walking lanes one side of one edge carries. */
export const MAX_WALKING_LANES = 3;

/** Driving lanes on an elevated highway, split evenly between both directions. */
export const HIGHWAY_LANES = 4;
