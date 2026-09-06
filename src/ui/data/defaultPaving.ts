import type { PavingDesign } from '../../streets/construction/paving/schema';
import creation from '../../cities/forms/creation.json';

/** Creation presets supply panel dimensions and finish choices. */
export const DEFAULT_PAVING = creation.values.pavingDesign as unknown as PavingDesign;
