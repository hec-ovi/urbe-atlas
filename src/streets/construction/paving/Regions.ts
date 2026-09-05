import type { GroundSurface } from '../../../../schema/blueprint';
import type { Field } from './Ownership';
import type { PavingConstruction, PavingDesign, PavingFrame, PavingLayout, PavingRegion } from './schema';

export class Regions {
  readonly construction: Extract<PavingConstruction, { version: '1.1.0' }>;
  private readonly layouts: Map<string, PavingLayout>;
  private readonly frames = new Map<string, PavingFrame>();
  private readonly regions = new Map<string, PavingRegion & { sourceId: string }>();

  constructor(design: PavingDesign) {
    this.layouts = new Map(design.layouts.map(layout => [layout.id, layout]));
    this.construction = { version: '1.1.0', roadwayLayoutId: design.roadwayLayoutId ?? design.defaultLayoutId,
      layouts: design.layouts, sources: [], frames: [], regions: [] };
  }

  source(source: Pick<GroundSurface, 'surface' | 'bottom' | 'top'>): string {
    const id = `pgs${this.construction.sources.length}`;
    this.construction.sources.push({ id, surface: source.surface, bottom: source.bottom, top: source.top });
    return id;
  }

  resolve(source: Pick<GroundSurface, 'surface'>, sourceId: string, field: Field, layoutId: string) {
    const band = source.surface === 'curb' ? 'curb' : field.band;
    const layout = this.layouts.get(layoutId)!;
    const setting = layout.bands[band === 'circulation' ? 'walking' : band];
    const module = layout.modules.find(candidate => candidate.id === setting.moduleId)!;
    const definition = structuredClone(field.frame);
    if (field.across) {
      const available = Math.max(0, field.across.width - 2 * setting.borderWidth);
      const rows = Math.floor(available / module.pitch[1]);
      const margin = field.across.direction * (field.across.width - rows * module.pitch[1]) / 2;
      definition.origin[0] -= definition.u[1] * margin;
      definition.origin[1] += definition.u[0] * margin;
    }
    const frameKey = JSON.stringify(definition);
    let frame = this.frames.get(frameKey);
    if (!frame) {
      frame = { id: `pf${this.frames.size}`, ...definition };
      this.frames.set(frameKey, frame);
      this.construction.frames.push(frame);
    }
    const regionKey = JSON.stringify([sourceId, field.owner, band, layoutId, frame.id]);
    let region = this.regions.get(regionKey);
    if (!region) {
      region = { id: `pr${this.regions.size}`, sourceId, owner: field.owner, band, layoutId, frameId: frame.id };
      this.regions.set(regionKey, region);
      this.construction.regions.push(region);
    }
    const grouping = setting.grouping && { setting: setting.grouping,
      module: layout.modules.find(candidate => candidate.id === setting.grouping!.moduleId)! };
    return { region, frame, module, grouping, borderWidth: setting.borderWidth };
  }
}
