/** Dark 2D blueprint renderer with exact filters, pan, zoom and feature inspection. */
import type { CityBlueprint, HighwayStructure, Parcel, Polygon, Polyline, Station, StreetEdge, Vec2 } from '../../../schema/blueprint';
import {
  BOUNDARY_COLOR,
  DIAGNOSTIC_COLORS,
  DISTRICT_OUTLINE,
  FURNITURE_COLORS,
  GROUND_COLORS,
  TRANSIT_COLORS,
  parcelColor,
  streetColor,
} from '../components/colors';
import { defaultFilters, type Filters } from './filters';

export interface Layers {
  ground: boolean;
  zones: boolean;
  streets: boolean;
  transit: boolean;
  districts: boolean;
}

export type MapHit =
  | { kind: 'parcel'; parcel: Parcel }
  | { kind: 'street'; edge: StreetEdge; structure?: HighwayStructure }
  | { kind: 'station'; station: Station; mode: 'train' | 'subway' };

export const DEFAULT_LAYERS: Layers = { ground: true, zones: true, streets: true, transit: true, districts: false };
const HIT_RADIUS_PX = 9;

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private blueprint: CityBlueprint | null = null;
  private filters: Filters = defaultFilters();
  private interiorParcels = new Set<string>();
  private selected: MapHit | null = null;
  private scale = 0.25;
  private offsetX = 0;
  private offsetZ = 0;
  private dragging = false;
  private lastX = 0;
  private lastZ = 0;

  constructor(
    private readonly onSelect?: (hit: MapHit) => void,
    private readonly onHover?: (hit: MapHit | null) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-view';
    this.canvas.setAttribute('aria-label', '2D city blueprint. Drag to pan, use the wheel to zoom, and right-click to inspect.');
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastZ = event.clientY;
      this.canvas.classList.add('dragging');
    });
    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const hit = this.hitAtEvent(event);
      if (!hit) return;
      this.selected = hit;
      this.render();
      this.onSelect?.(hit);
    });
    this.canvas.addEventListener('mousemove', (event) => {
      if (this.dragging) return;
      const hit = this.hitAtEvent(event);
      this.canvas.classList.toggle('inspectable', hit !== null);
      this.onHover?.(hit);
    });
    this.canvas.addEventListener('mouseleave', () => this.onHover?.(null));
    window.addEventListener('mouseup', () => {
      this.dragging = false;
      this.canvas.classList.remove('dragging');
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.dragging) return;
      this.offsetX += event.clientX - this.lastX;
      this.offsetZ += event.clientY - this.lastZ;
      this.lastX = event.clientX;
      this.lastZ = event.clientY;
      this.render();
    });
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const z = event.clientY - rect.top;
      const nextScale = clamp(this.scale * factor, 0.02, 80);
      const applied = nextScale / this.scale;
      this.offsetX = x - (x - this.offsetX) * applied;
      this.offsetZ = z - (z - this.offsetZ) * applied;
      this.scale = nextScale;
      this.render();
    }, { passive: false });
  }

  setBlueprint(blueprint: CityBlueprint): void {
    this.blueprint = blueprint;
    this.selected = null;
    this.resetView();
  }

  setFilters(filters: Filters): void {
    this.filters = { ...filters };
    this.render();
  }

  /** Exact parcel ids whose interiors exist in the assembled world manifest. */
  setInteriorParcels(parcelIds: readonly string[]): void {
    this.interiorParcels = new Set(parcelIds);
    this.render();
  }

  clearSelection(): void {
    this.selected = null;
    this.render();
  }

  /** Compatibility for callers that only know the five coarse groups. */
  setLayers(layers: Layers): void {
    for (const key of Object.keys(this.filters) as (keyof Filters)[]) {
      if (key.startsWith('ground.')) this.filters[key] = layers.ground;
      else if (key.startsWith('zone.')) this.filters[key] = layers.zones;
      else if (key.startsWith('street.')) this.filters[key] = layers.streets;
      else if (key.startsWith('transit.')) this.filters[key] = layers.transit;
    }
    this.filters.districts = layers.districts;
    this.render();
  }

  resetView(): void {
    if (!this.blueprint) return;
    const { min, max } = this.blueprint.meta.bounds;
    const width = this.canvas.width || 1;
    const height = this.canvas.height || 1;
    this.scale = Math.min(width / (max[0] - min[0]), height / (max[1] - min[1])) * 0.9;
    this.offsetX = (width - (max[0] + min[0]) * this.scale) / 2;
    this.offsetZ = (height - (max[1] + min[1]) * this.scale) / 2;
    this.render();
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.resetView();
  }

  render(): void {
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#080c11';
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.blueprint) return;
    const blueprint = this.blueprint;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    this.polygon(context, blueprint.meta.boundary, '#0f1821', BOUNDARY_COLOR, 1.5);
    for (const ground of blueprint.volumetric.ground) {
      if (this.filters[`ground.${ground.surface}`]) this.polygon(context, ground.polygon, GROUND_COLORS[ground.surface]);
    }
    for (const parcel of blueprint.parcels) {
      if (this.filters[`zone.${parcel.type}`] && this.parcelVisible(parcel)) {
        this.polygon(context, parcel.lot, parcelColor(parcel.type, parcel.tier), '#0b1118', 0.5);
      }
    }
    for (const edge of blueprint.streets.edges) {
      if (!this.filters[`street.${edge.class}`]) continue;
      const structure = edge.class === 'highway'
        ? blueprint.streets.highwayStructures.find((item) => item.edgeIds.includes(edge.id))
        : undefined;
      const width = structure?.width ?? (edge.class === 'alley' ? edge.sidewalk.left + edge.sidewalk.right : edge.width);
      this.line(context, edge.path, streetColor(edge.class), Math.max(width * this.scale, 1.2));
    }
    if (blueprint.streets.edges.some((edge) => this.filters[`street.${edge.class}`])) {
      for (const crossing of blueprint.streets.crossings) {
        for (const segment of crossing.segments) this.line(context, [segment.from, segment.to], '#f4f7fa', 1.3);
      }
    }
    if (this.filters.districts) {
      context.setLineDash([7, 5]);
      for (const district of blueprint.districts) this.polygon(context, district.boundary, null, DISTRICT_OUTLINE, 2);
      context.setLineDash([]);
    }
    this.drawTransit(context, blueprint);
    this.drawFurniture(context, blueprint);
    this.drawDiagnostics(context, blueprint);
    this.drawSelection(context);
  }

  private drawTransit(context: CanvasRenderingContext2D, blueprint: CityBlueprint): void {
    if (this.filters['transit.bus']) {
      const edges = new Map(blueprint.streets.edges.map((edge) => [edge.id, edge]));
      for (const route of blueprint.transit.busRoutes) {
        for (const edgeId of route.edgeIds) {
          const edge = edges.get(edgeId);
          if (edge) this.line(context, edge.path, TRANSIT_COLORS.busRoute, 2.2);
        }
      }
      for (const stop of blueprint.transit.busStops) this.dot(context, stop.position, 3, TRANSIT_COLORS.busStop, '#07110b');
    }
    if (this.filters['transit.subway']) {
      context.setLineDash([7, 4]);
      for (const line of blueprint.transit.subwayLines) this.line(context, line.path, TRANSIT_COLORS.subway, 3);
      context.setLineDash([]);
      for (const station of blueprint.transit.subwayStations) this.dot(context, station.position, 5, TRANSIT_COLORS.subwayStation, '#351126');
    }
    if (this.filters['transit.train']) {
      for (const line of blueprint.transit.trainLines) this.line(context, line.path, TRANSIT_COLORS.train, 4);
      for (const station of blueprint.transit.trainStations) this.square(context, station.position, 5, TRANSIT_COLORS.trainStation, '#082534');
    }
  }

  private drawFurniture(context: CanvasRenderingContext2D, blueprint: CityBlueprint): void {
    if (this.filters['furniture.signal']) {
      for (const signal of blueprint.streets.signals) this.square(context, signal.position, 2, FURNITURE_COLORS.signal);
    }
    for (const item of blueprint.streets.planting) {
      if (this.filters[`furniture.${item.kind}`]) this.dot(context, item.position, item.kind === 'tree' ? 2.2 : 1.5, FURNITURE_COLORS[item.kind]);
    }
  }

  private drawDiagnostics(context: CanvasRenderingContext2D, blueprint: CityBlueprint): void {
    if (this.filters['diagnostic.highwayCenterlines']) {
      context.setLineDash([10, 5]);
      for (const structure of blueprint.streets.highwayStructures) this.line(context, structure.path, DIAGNOSTIC_COLORS.highwayCenterlines, 2);
      context.setLineDash([]);
    }
    if (this.filters['diagnostic.highwaySupports']) {
      for (const structure of blueprint.streets.highwayStructures) {
        for (const support of structure.supports) this.polygon(context, support.footprint, null, DIAGNOSTIC_COLORS.highwaySupports, 2);
      }
    }
    if (this.filters['diagnostic.stationAccess']) {
      for (const station of blueprint.transit.subwayStations) {
        for (const access of station.accessPaths) {
          for (const segment of access.segments) {
            this.line(context, segment.path.map(([x, , z]) => [x, z]), DIAGNOSTIC_COLORS.stationAccess, 2);
          }
        }
      }
    }
  }

  private drawSelection(context: CanvasRenderingContext2D): void {
    if (!this.selected) return;
    if (this.selected.kind === 'parcel') {
      if (!this.filters[`zone.${this.selected.parcel.type}`] || !this.parcelVisible(this.selected.parcel)) return;
      this.polygon(context, this.selected.parcel.lot, null, '#ffffff', 3);
    } else if (this.selected.kind === 'street') {
      if (!this.filters[`street.${this.selected.edge.class}`]) return;
      this.line(context, this.selected.edge.path, '#ffffff', Math.max(4, this.selected.edge.width * this.scale + 4));
      this.line(context, this.selected.edge.path, streetColor(this.selected.edge.class), Math.max(1.5, this.selected.edge.width * this.scale));
    } else {
      if (!this.filters[`transit.${this.selected.mode}`]) return;
      this.polygon(context, this.selected.station.platform, null, '#ffffff', 3);
    }
  }

  private hitAtEvent(event: MouseEvent): MapHit | null {
    const rect = this.canvas.getBoundingClientRect();
    return this.featureAt(this.world(event.clientX - rect.left, event.clientY - rect.top));
  }

  private featureAt(point: Vec2): MapHit | null {
    if (!this.blueprint) return null;
    const tolerance = HIT_RADIUS_PX / Math.max(this.scale, 0.001);
    if (this.filters['transit.subway']) {
      for (const station of this.blueprint.transit.subwayStations) {
        if (distance(point, station.position) <= tolerance) return { kind: 'station', station, mode: 'subway' };
      }
    }
    if (this.filters['transit.train']) {
      for (const station of this.blueprint.transit.trainStations) {
        if (distance(point, station.position) <= tolerance) return { kind: 'station', station, mode: 'train' };
      }
    }
    const orderedEdges = [...this.blueprint.streets.edges].sort((a, b) => Number(b.class === 'highway') - Number(a.class === 'highway'));
    for (const edge of orderedEdges) {
      if (!this.filters[`street.${edge.class}`]) continue;
      const halfWidth = Math.max(edge.width / 2, tolerance);
      if (distanceToPolyline(point, edge.path) > halfWidth) continue;
      const structure = edge.class === 'highway'
        ? this.blueprint.streets.highwayStructures.find((item) => item.edgeIds.includes(edge.id))
        : undefined;
      return { kind: 'street', edge, ...(structure ? { structure } : {}) };
    }
    for (const parcel of this.blueprint.parcels) {
      if (this.filters[`zone.${parcel.type}`] && this.parcelVisible(parcel) && contains(point, parcel.lot)) {
        return { kind: 'parcel', parcel };
      }
    }
    return null;
  }

  private parcelVisible(parcel: Parcel): boolean {
    return !this.filters.interiorsOnly || this.interiorParcels.has(parcel.id);
  }

  private tx(point: Vec2): [number, number] {
    return [point[0] * this.scale + this.offsetX, point[1] * this.scale + this.offsetZ];
  }

  private world(x: number, z: number): Vec2 {
    return [(x - this.offsetX) / this.scale, (z - this.offsetZ) / this.scale];
  }

  private polygon(context: CanvasRenderingContext2D, polygon: Polygon, fill: string | null, stroke?: string, strokeWidth = 1): void {
    if (polygon.length < 3) return;
    context.beginPath();
    const [x0, z0] = this.tx(polygon[0]);
    context.moveTo(x0, z0);
    for (let index = 1; index < polygon.length; index++) {
      const [x, z] = this.tx(polygon[index]);
      context.lineTo(x, z);
    }
    context.closePath();
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = strokeWidth; context.stroke(); }
  }

  private line(context: CanvasRenderingContext2D, path: Polyline, color: string, width: number): void {
    if (path.length < 2) return;
    context.beginPath();
    const [x0, z0] = this.tx(path[0]);
    context.moveTo(x0, z0);
    for (let index = 1; index < path.length; index++) {
      const [x, z] = this.tx(path[index]);
      context.lineTo(x, z);
    }
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke();
  }

  private dot(context: CanvasRenderingContext2D, point: Vec2, radius: number, color: string, stroke?: string): void {
    const [x, z] = this.tx(point);
    context.beginPath();
    context.arc(x, z, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = 1; context.stroke(); }
  }

  private square(context: CanvasRenderingContext2D, point: Vec2, radius: number, color: string, stroke?: string): void {
    const [x, z] = this.tx(point);
    context.fillStyle = color;
    context.fillRect(x - radius, z - radius, radius * 2, radius * 2);
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = 1; context.strokeRect(x - radius, z - radius, radius * 2, radius * 2); }
  }
}

function contains(point: Vec2, ring: Polygon): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if (a[1] > point[1] !== b[1] > point[1]
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function distanceToPolyline(point: Vec2, path: Polyline): number {
  let nearest = Infinity;
  for (let index = 1; index < path.length; index++) nearest = Math.min(nearest, distanceToSegment(point, path[index - 1], path[index]));
  return nearest;
}

function distanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return distance(point, start);
  const t = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared, 0, 1);
  return distance(point, [start[0] + dx * t, start[1] + dz * t]);
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
