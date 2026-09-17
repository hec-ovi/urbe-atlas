/** Completed pipeline stages, independent of elapsed time. */
export interface GenerationProgress {
  completed: number;
  total: number;
  phase: string;
}
export type ProgressObserver = (progress: GenerationProgress) => void;

export interface GenerationStage {
  /** Stable key the generator reports with. */
  id: string;
  /** Label shown while the stage runs. */
  phase: string;
  /** What the stage leaves behind, in plain words. */
  produces: string;
}

/**
 * The pipeline in order. A stage's index is the number of stages completed
 * before it starts, and the last one completes when the blueprint is stored.
 */
export const GENERATION_STAGES = [
  { id: 'settings', phase: 'Checking settings',
    produces: 'The resolved parameters: your values plus every default, refused here if they cannot make a coherent city.' },
  { id: 'districts', phase: 'Planning districts',
    produces: 'The city rectangle, its water when you asked for a waterfront, and the district rectangles with their kind, wealth tier and floor cap.' },
  { id: 'grid', phase: 'Laying the street grid',
    produces: 'Every row and column of the grid with the road profile it takes, the highway run, and the panel blocks between them.' },
  { id: 'streets', phase: 'Dimensioning streets',
    produces: 'Each street edge with its class, carriageway width, per-side sidewalk width and height profile, so the highway rides its deck over the grade streets.' },
  { id: 'blocks', phase: 'Closing blocks',
    produces: 'Each block as land: its curb strip, its sidewalk ring and the interior left to build on.' },
  { id: 'parcels', phase: 'Cutting parcels',
    produces: 'Every block cut into standard lots and landmark plots, each parcel typed and tiered, with a footprint that hosts its core and a floor range.' },
  { id: 'transit', phase: 'Routing transit',
    produces: 'Subway lines, their platforms, and the street entrances with the sidewalk land each one reserves.' },
  { id: 'ground', phase: 'Partitioning ground',
    produces: 'The whole city floor divided once, with no gap or overlap: roadway, gutter, curb, sidewalk, block and open land.' },
  { id: 'crossings', phase: 'Fitting crossings',
    produces: 'A crossing on every junction arm that can carry one, the traffic signals around it, and the trees, lamp posts and bins that fit clear of both.' },
  { id: 'assembly', phase: 'Assembling the blueprint',
    produces: 'The movement plan (driving lanes, legal turns, walking lanes, highway ramps), the reserved widths and the population counts.' },
  { id: 'validation', phase: 'Checking the city holds together',
    produces: 'Proof of every invariant: a connected street graph, a sidewalk for every parcel, continuous sidewalks joined by crossings, connected subway lines, parcels that never overlap.' },
  { id: 'storage', phase: 'Writing the blueprint',
    produces: 'One JSON file on the server, saved and ready to open.' },
] as const satisfies readonly GenerationStage[];

export type GenerationStageId = (typeof GENERATION_STAGES)[number]['id'];

export const GENERATION_TOTAL = GENERATION_STAGES.length;

/** What a finished blueprint carries, and what it leaves to the stages that read it. */
export const GENERATION_RESULT = {
  contains: 'A finished blueprint is the city plan: districts, the street graph with its reserved widths and its lane and turn model, blocks, parcels with a footprint and a floor range, subway lines, and the ground partition with the street panels laid on it.',
  excludes: 'It contains no buildings. A parcel is a lot, a footprint and a height it may reach; the shells, the interiors, the names and the finishes come from separate stages that read this file.',
};
