import creation from './creation.json';
import visualization from './visualization.json';
import { CityApiError } from '../errors';
import type { FormName, WorkspaceForm } from './schema';

const FORMS: Record<FormName, WorkspaceForm> = {
  creation: creation as unknown as WorkspaceForm,
  visualization: visualization as unknown as WorkspaceForm,
};

/** Serves the workspace form documents the UI iterates. */
export class Forms {
  static names(): FormName[] {
    return ['creation', 'visualization'];
  }

  static get(name: string): WorkspaceForm {
    if (name !== 'creation' && name !== 'visualization') {
      throw new CityApiError('E_NOT_FOUND', 'Form not found.', 404);
    }
    return structuredClone(FORMS[name]);
  }
}
