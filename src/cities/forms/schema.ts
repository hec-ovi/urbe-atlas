/** Workspace form documents served by GET /api/forms/:name. */

export type FormName = 'creation' | 'visualization';

export interface FormOption {
  value: string;
  label: string;
}

export interface FormPreset {
  id: string;
  label: string;
  /** Paths kept from the live form when this preset applies. */
  keep?: string[];
  values: Record<string, unknown>;
}

export interface LayerItem {
  key: string;
  label: string;
  swatch: string;
  default: boolean;
}

export interface LayerGroup {
  id: string;
  title: string;
  description: string;
  open?: boolean;
  items: LayerItem[];
}

export interface FormWidget {
  type: string;
  id?: string;
  path?: string;
  /** Every value path one control writes, for a setting stored once per lane or per side. */
  paths?: string[];
  label?: string;
  text?: string;
  eyebrow?: string;
  description?: string;
  title?: string;
  style?: 'primary' | 'default' | 'danger';
  min?: number;
  max?: number;
  exactMin?: number;
  exactMax?: number;
  step?: number;
  /** Grid the value must land on, checked against typed input as well as the slider. */
  multipleOf?: number;
  /** Fixed sum the listed values must reach together. */
  total?: { paths: string[]; equals: number; message: string };
  unit?: string;
  integer?: boolean;
  required?: boolean;
  empty?: string;
  accept?: string;
  columns?: number;
  open?: boolean;
  options?: FormOption[];
  items?: FormWidget[] | FormPreset[] | LayerGroup[];
  keep?: string[];
  values?: Record<string, unknown>;
  constraint?: { path: string; label: string };
  actions?: string[];
}

export interface FormLayout {
  type: 'split';
  ratio: [number, number];
  items: string[];
}

export interface WorkspaceForm {
  id: FormName;
  title: string;
  layout: FormLayout;
  values: Record<string, unknown>;
  form: FormWidget[];
}

export interface FormList { forms: FormName[] }
