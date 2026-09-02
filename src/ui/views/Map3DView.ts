/**
 * The blueprint in three dimensions: every parcel as its envelope stacked
 * floor by floor in its type colour, ground cover as plates, streets as
 * ribbons under the ground plate at grade (they show when the ground is
 * hidden) and as decks with piers where a highway runs above it, rail as
 * tracks at grade and tunnels under it, stations as platforms with entrance
 * posts at the surface. Geometry merges per colour, so the city is a few
 * dozen draw calls. Drag orbits, wheel zooms, a click on a building reports
 * its parcel.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CityBlueprint, Parcel, Polygon, Polyline, StreetEdge, Vec2 } from '../../../schema/blueprint';
import { GROUND_COLORS, TRANSIT_COLORS, parcelHsl, streetColor } from '../components/colors';
import { defaultFilters, type FilterKey, type Filters } from './filters';

const SKY = 0x0e1117;
const FLOOR_GAP = 0.08;
const UNDER_GROUND = -0.02;
const DECK_THICKNESS = 1.0;
const RAMP_LENGTH = 60;
const PIER_PITCH = 30;
const TUNNEL_RADIUS = 3;
const PLATFORM = { length: 24, width: 6, height: 1 };
const ENTRANCE = { size: 2, height: 3 };

export class Map3DView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 1, 20000);
  private controls: OrbitControls | null = null;
  private readonly layers = new Map<FilterKey, THREE.Group>();
  private parcels: Parcel[] = [];
  private filters: Filters = defaultFilters();
  private frame = 0;

  constructor(private readonly onParcelClick?: (parcel: Parcel) => void) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-view map-view-3d';
    this.scene.background = new THREE.Color(SKY);
    this.scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x2a2622, 1.5), new THREE.DirectionalLight(0xffffff, 1.1).translateY(400).translateX(150));
    this.canvas.addEventListener('click', (e) => this.pick(e));
  }

  /** Starts drawing; needs a WebGL2 context, so a page without one shows an empty canvas. */
  shown(): void {
    if (this.renderer) return;
    const gl = this.canvas.getContext('webgl2');
    if (!gl) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, context: gl });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.addEventListener('change', () => this.render());
    this.resetView();
    this.render();
  }

  setBlueprint(bp: CityBlueprint): void {
    for (const group of this.layers.values()) this.scene.remove(group);
    this.layers.clear();
    this.parcels = bp.parcels;
    this.buildGround(bp);
    this.buildParcels(bp);
    this.buildStreets(bp);
    this.buildTransit(bp);
    this.buildDistricts(bp);
    this.applyFilters();
    this.resetView();
    this.render();
  }

  setFilters(filters: Filters): void {
    this.filters = { ...filters };
    this.applyFilters();
    this.render();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(width, height, false);
    this.render();
  }

  /** The whole city in view from the south-east, high enough to read the districts. */
  resetView(): void {
    const box = new THREE.Box3();
    for (const group of this.layers.values()) box.expandByObject(group);
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 100);
    this.camera.position.set(centre.x + span * 0.55, span * 0.7, centre.z + span * 0.55);
    this.camera.far = span * 20;
    this.camera.updateProjectionMatrix();
    if (this.controls) { this.controls.target.copy(centre); this.controls.update(); }
  }

  render(): void {
    if (!this.renderer || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.renderer?.render(this.scene, this.camera); });
  }

  private layer(key: FilterKey): THREE.Group {
    let group = this.layers.get(key);
    if (!group) {
      group = new THREE.Group();
      group.name = key;
      this.layers.set(key, group);
      this.scene.add(group);
    }
    return group;
  }

  private applyFilters(): void {
    for (const [key, group] of this.layers) group.visible = this.filters[key] ?? true;
  }

  /** Merged mesh of many geometries in one colour, into one layer. */
  private merged(key: FilterKey, parts: THREE.BufferGeometry[], material: THREE.Material): void {
    if (parts.length === 0) return;
    const geometry = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    if (geometry) this.layer(key).add(new THREE.Mesh(geometry, material));
  }

  private buildGround(bp: CityBlueprint): void {
    const parts: Record<string, THREE.BufferGeometry[]> = { roadway: [], sidewalk: [], block: [], open: [] };
    for (const cover of bp.volumetric.ground) {
      if (cover.polygon.length < 3) continue;
      parts[cover.surface]!.push(plate(cover.polygon, cover.surface === 'roadway' ? 0 : 0.05));
    }
    for (const surface of Object.keys(parts) as (keyof typeof GROUND_COLORS)[]) {
      this.merged(`ground.${surface}`, parts[surface]!, new THREE.MeshLambertMaterial({ color: GROUND_COLORS[surface] }));
    }
  }

  private buildParcels(bp: CityBlueprint): void {
    const byId = new Map(bp.parcels.map((p) => [p.id, p]));
    const buckets = new Map<string, { key: FilterKey; color: THREE.Color; parts: THREE.BufferGeometry[] }>();
    for (const volume of bp.volumetric.buildings) {
      const parcel = byId.get(volume.parcelId);
      if (!parcel || volume.footprint.length < 3) continue;
      const floors = Math.max(1, Math.round(volume.height / parcel.envelope.floorHeight));
      const floorHeight = volume.height / floors;
      const shape = shapeOf(volume.footprint);
      for (let i = 0; i < floors; i++) {
        const id = `${parcel.type}/${parcel.tier}/${i % 2}`;
        let bucket = buckets.get(id);
        if (!bucket) {
          const [h, s, l] = parcelHsl(parcel.type, parcel.tier);
          const color = new THREE.Color().setHSL(h / 360, s / 100, l / 100).multiplyScalar(i % 2 ? 0.92 : 1);
          bucket = { key: `zone.${parcel.type}`, color, parts: [] };
          buckets.set(id, bucket);
        }
        bucket.parts.push(
          new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.05, floorHeight - FLOOR_GAP), bevelEnabled: false })
            .rotateX(-Math.PI / 2).translate(0, i * floorHeight, 0),
        );
      }
    }
    for (const bucket of buckets.values()) this.merged(bucket.key, bucket.parts, new THREE.MeshLambertMaterial({ color: bucket.color }));
  }

  private buildStreets(bp: CityBlueprint): void {
    const nodes = new Map(bp.streets.nodes.map((n) => [n.id, n]));
    const decks = highwayEnds(bp.streets.edges);
    const parts: Record<string, THREE.BufferGeometry[]> = { street: [], road: [], highway: [], alley: [] };
    const piers: THREE.BufferGeometry[] = [];
    for (const edge of bp.streets.edges) {
      const width = Math.max(1.5, edge.width + edge.sidewalk.left + edge.sidewalk.right);
      if (edge.level > 0) {
        // a deck with thickness, ramping to the ground where the highway ends
        const path = edge.path.map(([x, z]) => [x, z] as Vec2);
        const startRamp = decks.has(edge.from) ? RAMP_LENGTH : 0;
        const endRamp = decks.has(edge.to) ? RAMP_LENGTH : 0;
        parts[edge.class]!.push(deck(path, width, edge.level, DECK_THICKNESS, startRamp, endRamp));
        piers.push(...piersAlong(path, width, edge.level, startRamp, endRamp));
      } else {
        parts[edge.class]!.push(ribbon(edge.path, width, edge.level + UNDER_GROUND));
      }
      void nodes;
    }
    for (const cls of Object.keys(parts) as (keyof typeof parts)[]) {
      this.merged(`street.${cls as StreetEdge['class']}`, parts[cls]!, new THREE.MeshLambertMaterial({ color: streetColor(cls as StreetEdge['class']) }));
    }
    this.merged('street.highway', piers, new THREE.MeshLambertMaterial({ color: 0x4a4f57 }));
  }

  private buildTransit(bp: CityBlueprint): void {
    const t = bp.transit;
    const under = (level: number) => level < 0;
    const rail = (key: FilterKey, path: Polyline, level: number, color: string) => {
      if (under(level)) {
        const material = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.6, depthTest: false });
        const mesh = new THREE.Mesh(tunnel(path, TUNNEL_RADIUS, level), material);
        mesh.renderOrder = 2;
        this.layer(key).add(mesh);
      } else {
        this.layer(key).add(new THREE.Mesh(ribbon(path, 4, level + 0.06), new THREE.MeshLambertMaterial({ color })));
      }
    };
    for (const line of t.trainLines) rail('transit.train', line.path, line.level, TRANSIT_COLORS.train);
    for (const line of t.subwayLines) rail('transit.subway', line.path, line.level, TRANSIT_COLORS.subway);

    const station = (key: FilterKey, position: Vec2, level: number, entrances: Vec2[], color: string) => {
      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(PLATFORM.length, PLATFORM.height, PLATFORM.width),
        new THREE.MeshLambertMaterial({ color, transparent: under(level), opacity: under(level) ? 0.7 : 1, depthTest: !under(level) }),
      );
      platform.position.set(position[0], level + PLATFORM.height / 2, position[1]);
      platform.renderOrder = under(level) ? 3 : 0;
      this.layer(key).add(platform);
      // entrances stand on the sidewalk at grade, whatever the platform's level
      for (const [x, z] of entrances) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(ENTRANCE.size, ENTRANCE.height, ENTRANCE.size), new THREE.MeshLambertMaterial({ color }));
        post.position.set(x, ENTRANCE.height / 2, z);
        this.layer(key).add(post);
      }
    };
    for (const s of t.trainStations) station('transit.train', s.position, s.level, s.entrances, TRANSIT_COLORS.trainStation);
    for (const s of t.subwayStations) station('transit.subway', s.position, s.level, s.entrances, TRANSIT_COLORS.subwayStation);
    const stops: THREE.BufferGeometry[] = [];
    for (const stop of t.busStops) stops.push(new THREE.BoxGeometry(2, 2.5, 2).translate(stop.position[0], 1.25, stop.position[1]));
    this.merged('transit.bus', stops, new THREE.MeshLambertMaterial({ color: TRANSIT_COLORS.busStop }));
  }

  private buildDistricts(bp: CityBlueprint): void {
    for (const d of bp.districts) {
      const points = d.boundary.map(([x, z]) => new THREE.Vector3(x, 0.3, z));
      points.push(points[0]!.clone());
      this.layer('districts').add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x222222 })));
    }
  }

  private pick(event: MouseEvent): void {
    if (!this.onParcelClick || !this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const zones = [...this.layers.entries()].filter(([key, g]) => key.startsWith('zone.') && g.visible).map(([, g]) => g);
    const hit = raycaster.intersectObjects(zones, true)[0];
    if (!hit) return;
    // the merged mesh does not know its parcels; the footprint under the hit does
    const parcel = this.parcels.find((p) => pointInPolygon([hit.point.x, hit.point.z], p.footprint));
    if (parcel) this.onParcelClick(parcel);
  }
}

function shapeOf(polygon: Polygon): THREE.Shape {
  return new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
}

/** A flat polygon at height y, facing up. */
function plate(polygon: Polygon, y: number): THREE.BufferGeometry {
  return new THREE.ShapeGeometry(shapeOf(polygon)).rotateX(-Math.PI / 2).translate(0, y, 0);
}

/** The offset points of a path: left and right of every vertex, mitred at joins with the mitre length capped. */
function offsets(path: Polyline, half: number): { left: Vec2[]; right: Vec2[] } {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < path.length; i++) {
    const [x, z] = path[i]!;
    const [px, pz] = path[Math.max(0, i - 1)]!;
    const [nx, nz] = path[Math.min(path.length - 1, i + 1)]!;
    const d1 = normalize([x - px, z - pz]);
    const d2 = normalize([nx - x, nz - z]);
    const t = normalize([d1[0] + d2[0], d1[1] + d2[1]]);
    const n: Vec2 = [-t[1], t[0]];
    // the mitre grows as the bend sharpens; cap it at twice the half width so a tight bend never spikes
    const cos = Math.max(0.5, n[0] * -d1[1] + n[1] * d1[0]);
    const m = half / cos;
    left.push([x + n[0] * m, z + n[1] * m]);
    right.push([x - n[0] * m, z - n[1] * m]);
  }
  return { left, right };
}

/** A flat strip of one width along a polyline at height y, facing up. */
function ribbon(path: Polyline, width: number, y: number): THREE.BufferGeometry {
  const { left, right } = offsets(path, width / 2);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < path.length; i++) {
    positions.push(left[i]![0], y, left[i]![1], right[i]![0], y, right[i]![1]);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** The deck's height along the path: level in the middle, falling to the ground over a ramp at an open end. */
function deckHeight(along: number, total: number, level: number, startRamp: number, endRamp: number): number {
  let h = level;
  if (startRamp > 0 && along < startRamp) h = Math.min(h, (level * along) / startRamp);
  if (endRamp > 0 && total - along < endRamp) h = Math.min(h, (level * (total - along)) / endRamp);
  return h;
}

/** A closed slab along a path: top, bottom and both side faces, height following the ramps. */
function deck(path: Polyline, width: number, level: number, thickness: number, startRamp: number, endRamp: number): THREE.BufferGeometry {
  const { left, right } = offsets(path, width / 2);
  const total = pathLength(path);
  const tops: number[] = [];
  let along = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) along += dist(path[i - 1]!, path[i]!);
    tops.push(deckHeight(along, total, level, startRamp, endRamp));
  }
  const positions: number[] = [];
  const indices: number[] = [];
  // four rings of vertices per station: top-left, top-right, bottom-right, bottom-left
  for (let i = 0; i < path.length; i++) {
    const y1 = tops[i]!;
    const y0 = Math.max(0, y1 - thickness);
    positions.push(left[i]![0], y1, left[i]![1], right[i]![0], y1, right[i]![1], right[i]![0], y0, right[i]![1], left[i]![0], y0, left[i]![1]);
    if (i > 0) {
      const a = (i - 1) * 4;
      const b = i * 4;
      const quad = (p: number, q: number, r: number, s: number) => indices.push(p, q, r, p, r, s);
      quad(a, b, b + 1, a + 1); // top
      quad(a + 1, b + 1, b + 2, a + 2); // right side
      quad(a + 2, b + 2, b + 3, a + 3); // bottom
      quad(a + 3, b + 3, b, a); // left side
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Columns under a deck, one every PIER_PITCH metres, none where it has ramped to the ground. */
function piersAlong(path: Polyline, width: number, level: number, startRamp: number, endRamp: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const total = pathLength(path);
  const size = Math.min(2, width / 3);
  for (let along = PIER_PITCH / 2; along < total; along += PIER_PITCH) {
    const h = deckHeight(along, total, level, startRamp, endRamp) - DECK_THICKNESS;
    if (h < 1) continue;
    const [x, z] = pointAlong(path, along);
    out.push(new THREE.BoxGeometry(size, h, size).translate(x, h / 2, z));
  }
  return out;
}

/** A round tunnel along a path at a level below the ground. */
function tunnel(path: Polyline, radius: number, level: number): THREE.BufferGeometry {
  const points = path.map(([x, z]) => new THREE.Vector3(x, level, z));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.1), Math.max(8, path.length * 4), radius, 8, false);
}

/** The nodes where a highway ends: one highway edge only, so the deck ramps down there. */
function highwayEnds(edges: StreetEdge[]): Set<string> {
  const count = new Map<string, number>();
  for (const e of edges) {
    if (e.class !== 'highway') continue;
    count.set(e.from, (count.get(e.from) ?? 0) + 1);
    count.set(e.to, (count.get(e.to) ?? 0) + 1);
  }
  return new Set([...count.entries()].filter(([, n]) => n === 1).map(([id]) => id));
}

function normalize([x, z]: Vec2): Vec2 {
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function pathLength(path: Polyline): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1]!, path[i]!);
  return total;
}

function pointAlong(path: Polyline, along: number): Vec2 {
  let left = along;
  for (let i = 1; i < path.length; i++) {
    const d = dist(path[i - 1]!, path[i]!);
    if (left <= d || i === path.length - 1) {
      const t = d === 0 ? 0 : Math.min(1, left / d);
      return [path[i - 1]![0] + (path[i]![0] - path[i - 1]![0]) * t, path[i - 1]![1] + (path[i]![1] - path[i - 1]![1]) * t];
    }
    left -= d;
  }
  return path[0]!;
}

function pointInPolygon([px, pz]: Vec2, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
