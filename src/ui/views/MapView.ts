/**
 * Canvas renderer for a CityBlueprint: pan (drag), zoom (wheel,
 * cursor-anchored), layer toggles, and a parcel pick on click.
 */
import type { CityBlueprint, Parcel, Polygon, Polyline, Vec2 } from '../../../schema/blueprint';
import {
  BOUNDARY_COLOR,
  DISTRICT_OUTLINE,
  GROUND_COLORS,
  TRANSIT_COLORS,
  parcelColor,
  streetColor,
} from '../components/colors';

export interface Layers {
  ground: boolean;
  zones: boolean;
  streets: boolean;
  transit: boolean;
  districts: boolean;
}

export const DEFAULT_LAYERS: Layers = { ground: true, zones: true, streets: true, transit: true, districts: false };

/** Pointer travel that turns a click into a pan, pixels. */
const DRAG_SLOP = 4;

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private blueprint: CityBlueprint | null = null;
  private layers: Layers = { ...DEFAULT_LAYERS };
  private scale = 0.25;
  private offsetX = 0;
  private offsetZ = 0;
  private dragging = false;
  private lastX = 0;
  private lastZ = 0;
  private travel = 0;

  constructor(onParcelClick?: (parcel: Parcel) => void) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-view';
    this.canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.travel = 0;
      this.lastX = e.clientX;
      this.lastZ = e.clientY;
    });
    this.canvas.addEventListener('click', (e) => {
      if (!onParcelClick || this.travel > DRAG_SLOP) return;
      const rect = this.canvas.getBoundingClientRect();
      const parcel = this.parcelAt(this.world(e.clientX - rect.left, e.clientY - rect.top));
      if (parcel) onParcelClick(parcel);
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.travel += Math.abs(e.clientX - this.lastX) + Math.abs(e.clientY - this.lastZ);
      this.offsetX += e.clientX - this.lastX;
      this.offsetZ += e.clientY - this.lastZ;
      this.lastX = e.clientX;
      this.lastZ = e.clientY;
      this.render();
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const mz = e.clientY - rect.top;
      this.offsetX = mx - (mx - this.offsetX) * factor;
      this.offsetZ = mz - (mz - this.offsetZ) * factor;
      this.scale *= factor;
      this.render();
    });
  }

  setBlueprint(bp: CityBlueprint): void {
    this.blueprint = bp;
    this.resetView();
  }

  setLayers(layers: Layers): void {
    this.layers = { ...layers };
    this.render();
  }

  resetView(): void {
    if (!this.blueprint) return;
    const { min, max } = this.blueprint.meta.bounds;
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;
    this.scale = Math.min(w / (max[0] - min[0]), h / (max[1] - min[1])) * 0.92;
    this.offsetX = (w - (max[0] + min[0]) * this.scale) / 2;
    this.offsetZ = (h - (max[1] + min[1]) * this.scale) / 2;
    this.render();
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.resetView();
  }

  private tx(p: Vec2): [number, number] {
    return [p[0] * this.scale + this.offsetX, p[1] * this.scale + this.offsetZ];
  }

  /** Canvas pixels back to city meters. */
  private world(x: number, z: number): Vec2 {
    return [(x - this.offsetX) / this.scale, (z - this.offsetZ) / this.scale];
  }

  private parcelAt(point: Vec2): Parcel | null {
    if (!this.blueprint) return null;
    for (const parcel of this.blueprint.parcels) {
      if (contains(point, parcel.lot)) return parcel;
    }
    return null;
  }

  render(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || !this.blueprint) return;
    const bp = this.blueprint;
    ctx.fillStyle = '#f3f1ec';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.polygon(ctx, bp.meta.boundary, '#eae7df', BOUNDARY_COLOR, 1.5);

    if (this.layers.ground) {
      for (const g of bp.volumetric.ground) {
        if (g.surface === 'block') continue; // parcels draw on top in the zones layer
        this.polygon(ctx, g.polygon, GROUND_COLORS[g.surface]);
      }
    }

    if (this.layers.zones) {
      for (const p of bp.parcels) {
        this.polygon(ctx, p.lot, parcelColor(p.type, p.tier));
      }
    }

    if (this.layers.streets) {
      for (const e of bp.streets.edges) {
        // an alley has no carriageway: its width is the sidewalk pair
        const width = e.class === 'alley' ? e.sidewalk.left + e.sidewalk.right : e.width;
        this.line(ctx, e.path, streetColor(e.class), Math.max(width * this.scale * 0.35, 0.6));
      }
    }

    if (this.layers.districts) {
      ctx.setLineDash([6, 4]);
      for (const d of bp.districts) {
        this.polygon(ctx, d.boundary, null, DISTRICT_OUTLINE, 1.5);
      }
      ctx.setLineDash([]);
    }

    if (this.layers.transit) {
      for (const r of bp.transit.busRoutes) {
        const stops = r.stopIds
          .map((id) => bp.transit.busStops.find((s) => s.id === id))
          .filter((s): s is NonNullable<typeof s> => s !== undefined);
        this.line(ctx, stops.map((s) => s.position), TRANSIT_COLORS.busRoute, 1);
      }
      for (const s of bp.transit.busStops) this.dot(ctx, s.position, 2.5, TRANSIT_COLORS.busStop);
      for (const l of bp.transit.subwayLines) this.line(ctx, l.path, TRANSIT_COLORS.subway, 2.5);
      for (const s of bp.transit.subwayStations) this.dot(ctx, s.position, 4, TRANSIT_COLORS.subwayStation);
      for (const l of bp.transit.trainLines) this.line(ctx, l.path, TRANSIT_COLORS.train, 3);
      for (const s of bp.transit.trainStations) this.square(ctx, s.position, 5, TRANSIT_COLORS.trainStation);
    }
  }

  private polygon(
    ctx: CanvasRenderingContext2D,
    poly: Polygon,
    fill: string | null,
    stroke?: string,
    strokeWidth = 1,
  ): void {
    if (poly.length < 3) return;
    ctx.beginPath();
    const [x0, z0] = this.tx(poly[0]);
    ctx.moveTo(x0, z0);
    for (let i = 1; i < poly.length; i++) {
      const [x, z] = this.tx(poly[i]);
      ctx.lineTo(x, z);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  private line(ctx: CanvasRenderingContext2D, path: Polyline, color: string, width: number): void {
    if (path.length < 2) return;
    ctx.beginPath();
    const [x0, z0] = this.tx(path[0]);
    ctx.moveTo(x0, z0);
    for (let i = 1; i < path.length; i++) {
      const [x, z] = this.tx(path[i]);
      ctx.lineTo(x, z);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  private dot(ctx: CanvasRenderingContext2D, p: Vec2, r: number, color: string): void {
    const [x, z] = this.tx(p);
    ctx.beginPath();
    ctx.arc(x, z, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private square(ctx: CanvasRenderingContext2D, p: Vec2, r: number, color: string): void {
    const [x, z] = this.tx(p);
    ctx.fillStyle = color;
    ctx.fillRect(x - r, z - r, r * 2, r * 2);
  }
}

/** Ray cast: is the point inside the ring? */
function contains(p: Vec2, ring: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}
