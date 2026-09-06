import type { PavingDesign } from '../../streets/construction/paving/schema';
import creation from '../../cities/forms/creation.json';

/** Creation presets select fitted slabs on the shared metre station grid. */
export const DEFAULT_PAVING = creation.values.pavingDesign as unknown as PavingDesign;
