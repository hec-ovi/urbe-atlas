/** Presentation client for the Engine exterior job contract. */
import type { CityBlueprint, Parcel } from '../../../schema/blueprint';
import { blueprintIdentity } from '../components/blueprintIdentity';
import { readExteriorJob, type ExteriorJob } from '../components/exteriorJob';
import { el } from '../components/dom';
import type { ParcelDestination } from './ParcelLink';

const API = '/api/exteriors';
const VIEWER = import.meta.env.VITE_ENGINE_PREVIEW_URL || 'http://localhost:5306/';

export class ExteriorPreview {
  readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly status: HTMLElement;
  private blueprint: CityBlueprint | null = null;
  private job: ExteriorJob | null = null;
  private available = false;
  private busy = false;
  private epoch = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly changed: () => void, private readonly error: (message: string) => void) {
    this.button = el('button', { type: 'button', text: 'Generate exteriors', disabled: '' });
    this.status = el('p', { class: 'hint', role: 'status', text: 'Load a city to check exterior generation.' });
    this.root = el('section', { class: 'exterior-preview', 'aria-label': 'Exterior generation' }, [this.button, this.status]);
    this.button.addEventListener('click', () => void this.generate());
  }

  setBlueprint(blueprint: CityBlueprint): void {
    this.blueprint = blueprint;
    this.job = null;
    this.available = false;
    this.busy = false;
    clearTimeout(this.timer);
    const epoch = ++this.epoch;
    this.update('Checking exterior generation service…');
    void this.checkCapability(epoch);
  }

  destinationFor(parcel: Parcel): ParcelDestination {
    if (!this.job || this.job.state !== 'succeeded' || !this.job.completedParcels.includes(parcel.id)) {
      return { error: 'Exterior assets for this exact blueprint are not ready. Generate exteriors before opening a building.' };
    }
    try {
      const url = new URL(VIEWER, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      url.searchParams.set('mode', 'building');
      url.searchParams.set('parcel', parcel.id);
      url.searchParams.set('out', this.job.out);
      return { url: url.href };
    } catch {
      return { error: 'The configured exterior viewer URL is invalid.' };
    }
  }

  private update(message: string): void {
    this.status.textContent = message;
    this.button.disabled = !this.available || this.busy || !this.blueprint?.parcels.length;
    this.button.textContent = this.busy ? 'Generating exteriors…' : 'Generate exteriors';
    this.changed();
  }

  private async checkCapability(epoch: number): Promise<void> {
    try {
      const value = await this.request(API);
      if (epoch !== this.epoch) return;
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid exterior capability response');
      const capability = value as Record<string, unknown>;
      if (capability.contractVersion !== '1.0' || typeof capability.available !== 'boolean'
        || (capability.reason !== null && typeof capability.reason !== 'string')
        || Object.keys(capability).some((key) => !['contractVersion', 'available', 'reason'].includes(key))) {
        throw new Error('Invalid exterior capability response');
      }
      this.available = capability.available;
      this.update(this.available ? 'Generate shell assets for this exact city.' : String(capability.reason || 'Exterior generation is unavailable.'));
    } catch (error) {
      if (epoch === this.epoch) this.update(`Exterior generation unavailable: ${message(error)}`);
    }
  }

  private async generate(): Promise<void> {
    if (!this.available || this.busy || !this.blueprint?.parcels.length) return;
    const blueprint = this.blueprint;
    const epoch = this.epoch;
    this.busy = true;
    this.job = null;
    this.update('Identifying the exact displayed blueprint…');
    try {
      const hash = await blueprintIdentity(blueprint);
      if (epoch !== this.epoch) return;
      const value = await this.request(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blueprint }) });
      if (epoch !== this.epoch) return;
      this.accept(readExteriorJob(value, blueprint, hash), blueprint, hash, epoch);
    } catch (error) {
      if (epoch === this.epoch) this.fail(error);
    }
  }

  private accept(job: ExteriorJob, blueprint: CityBlueprint, hash: string, epoch: number): void {
    this.job = job;
    if (job.state === 'succeeded') {
      this.busy = false;
      this.update(`${job.completed} exterior previews ready. Click a building to open its details.`);
    } else if (job.state === 'failed') {
      this.fail(new Error(`${job.error!.code}: ${job.error!.message}`));
    } else {
      this.update(`${job.state}: ${job.completed} of ${job.total} exteriors ready`);
      this.timer = setTimeout(async () => {
        try {
          const value = await this.request(`${API}/${encodeURIComponent(job.id)}`);
          if (epoch !== this.epoch) return;
          this.accept(readExteriorJob(value, blueprint, hash, job), blueprint, hash, epoch);
        } catch (error) {
          if (epoch === this.epoch) this.fail(error);
        }
      }, 1500);
    }
  }

  private fail(error: unknown): void {
    this.busy = false;
    this.job = null;
    this.update(`Exterior generation failed: ${message(error)}`);
    this.error(message(error));
  }

  private async request(url: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(url, { ...init, mode: 'same-origin', redirect: 'error' });
    const value = await response.json();
    if (!response.ok) {
      const detail = value && typeof value === 'object' && 'message' in value ? String(value.message) : `HTTP ${response.status}`;
      throw new Error(detail);
    }
    return value;
  }
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
