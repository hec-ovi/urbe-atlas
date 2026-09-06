/** Completed pipeline stages, independent of elapsed time. */
export interface GenerationProgress {
  completed: number;
  total: number;
  phase: string;
}
export type ProgressObserver = (progress: GenerationProgress) => void;
