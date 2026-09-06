/** AtlasParams form: iterates the creation workspace document. */
import type { AtlasParams } from '../../../schema/params';
import type { WorkspaceForm } from '../../cities/forms/schema';
import creation from '../../cities/forms/creation.json';
import { Form } from '../components/Form';

export interface ParamsPanelEvents {
  onGenerate: (params: AtlasParams) => void;
}

export class ParamsPanel {
  readonly root: HTMLElement;
  private readonly form: Form;

  constructor(events: ParamsPanelEvents, schema: WorkspaceForm = creation as unknown as WorkspaceForm) {
    this.form = new Form(schema, {
      onAction: (id, values) => {
        if (id === 'random-seed') {
          this.form.set('seed', makeSeed());
          return;
        }
        const params = values as unknown as AtlasParams;
        if (id === 'generate') events.onGenerate(params);
      },
    });
    this.root = this.form.root;
    this.newSeed();
  }

  newSeed(): void { this.form.set('seed', makeSeed()); }

  read(): AtlasParams {
    return this.form.read() as unknown as AtlasParams;
  }

  setParams(params: AtlasParams): void {
    this.form.setValues(params as unknown as Record<string, unknown>);
  }

  setStatus(text: string): void {
    this.form.setStatus(text);
  }

  setBusy(busy: boolean): void {
    this.form.setBusy(busy);
  }
}

function makeSeed(): string {
  const values = new Uint32Array(2);
  globalThis.crypto.getRandomValues(values);
  return `city-${values[0]!.toString(36)}${values[1]!.toString(36)}`;
}
