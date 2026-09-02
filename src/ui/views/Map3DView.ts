/**
 * The blueprint in three dimensions: every parcel as one envelope prism with
 * its floor elevations traced on the facade, ground cover as plates, streets as
 * ribbons under the ground plate at grade (they show when the ground is
 * hidden) and as decks with piers where a highway runs above it, rail as
 * tracks at grade and tunnels under it, stations as platforms with entrance
 * posts at the surface. Geometry merges per colour, so the city is a few
 * dozen draw calls. Drag orbits, wheel zooms, and right-click inspects a
 * building.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CityBlueprint, ElevationPoint, Parcel, PlantingKind, Polygon, Polyline, Station, StreetEdge, TrafficSignal, Vec2 } from '../../../schema/blueprint';
import { DIAGNOSTIC_COLORS, FURNITURE_COLORS, GROUND_COLORS, TRANSIT_COLORS, parcelHsl, streetColor } from '../components/colors';
import { defaultFilters, type FilterKey, type Filters } from './filters';
import { streetSurfaceRegions } from './StreetSurfaceRegions';

const SKY = 0x0e1117;
const FLOOR_GAP = 0.08;
const ROADWAY_BASE = -0.02;
const STREET_SURFACE = 0.01;
const PLATFORM_THICKNESS = 1;
const HEADHOUSE_HEIGHT = 3.2;
const SIGNAL = { poleHeight: 6, poleSize: 0.28, mastSize: 0.2, headHeight: 0.9, headSize: 0.32 };
const TREE = { trunk: 0.3, trunkHeight: 2.4, crown: 2.2, crownHeight: 3.6 };
const LAMP = { height: 8, size: 0.24, headLength: 1.4 };
const BIN = { size: 0.7, height: 1 };
const GROUND_SEE_THROUGH = 0.7;
const EARTH_DEPTH = 30;

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

  constructor(
    private readonly onParcelClick?: (parcel: Parcel) => void,
    private readonly onParcelInspect?: (parcel: Parcel) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-view map-view-3d';
    this.canvas.setAttribute('aria-label', '3D city blueprint. Drag to orbit, use the wheel to zoom, and right-click a building to inspect.');
    this.canvas.tabIndex = 0;
    this.scene.background = new THREE.Color(SKY);
    this.scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x2a2622, 1.5), new THREE.DirectionalLight(0xffffff, 1.1).translateY(400).translateX(150));
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.pick(e); });
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
    this.buildFurniture(bp);
    this.buildDistricts(bp);
    this.buildDiagnostics(bp);
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
    // the ground goes translucent while the subway shows, so the tunnels read as under it, not floating
    const seeThrough = this.filters['transit.subway'];
    for (const [key, group] of this.layers) {
      if (!key.startsWith('ground.')) continue;
      group.traverse((node) => {
        const material = (node as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if (!material?.isMaterial) return;
        material.transparent = seeThrough;
        material.opacity = seeThrough ? GROUND_SEE_THROUGH : 1;
        material.needsUpdate = true;
      });
    }
  }

  /** Merged mesh of many geometries in one colour, into one layer. */
  private merged(key: FilterKey, parts: THREE.BufferGeometry[], material: THREE.Material): void {
    if (parts.length === 0) return;
    const hasIndex = parts.some((part) => part.index !== null);
    const hasNoIndex = parts.some((part) => part.index === null);
    const converted: THREE.BufferGeometry[] = [];
    const compatible = hasIndex && hasNoIndex
      ? parts.map((part) => {
          if (part.index === null) return part;
          const flat = part.toNonIndexed();
          converted.push(flat);
          return flat;
        })
      : parts;
    const geometry = mergeGeometries(compatible, false);
    parts.forEach((p) => p.dispose());
    converted.forEach((part) => part.dispose());
    if (geometry) this.layer(key).add(new THREE.Mesh(geometry, material));
  }

  private buildGround(bp: CityBlueprint): void {
    const parts: Record<string, THREE.BufferGeometry[]> = { roadway: [], curb: [], sidewalk: [], block: [], open: [] };
    for (const cover of bp.volumetric.ground) {
      if (cover.polygon.length < 3) continue;
      parts[cover.surface]!.push(plate(cover.polygon, cover.surface === 'roadway' ? ROADWAY_BASE : 0.05));
    }
    for (const surface of Object.keys(parts) as (keyof typeof GROUND_COLORS)[]) {
      this.merged(`ground.${surface}`, parts[surface]!, new THREE.MeshLambertMaterial({ color: GROUND_COLORS[surface] }));
    }
  }

  private buildParcels(bp: CityBlueprint): void {
    const byId = new Map(bp.parcels.map((p) => [p.id, p]));
    const buckets = new Map<string, { key: FilterKey; color: THREE.Color; parts: THREE.BufferGeometry[] }>();
    const floorLines = new Map<FilterKey, THREE.Vector3[]>();
    for (const volume of bp.volumetric.buildings) {
      const parcel = byId.get(volume.parcelId);
      if (!parcel || volume.footprint.length < 3) continue;
      const floors = Math.max(1, Math.round(volume.height / parcel.envelope.floorHeight));
      const floorHeight = volume.height / floors;
      const id = `${parcel.type}/${parcel.tier}`;
      let bucket = buckets.get(id);
      if (!bucket) {
        const [h, s, l] = parcelHsl(parcel.type, parcel.tier);
        bucket = {
          key: `zone.${parcel.type}`,
          color: new THREE.Color().setHSL(h / 360, s / 100, l / 100),
          parts: [],
        };
        buckets.set(id, bucket);
      }
      bucket.parts.push(prism(volume.footprint, 0, Math.max(0.05, volume.height - FLOOR_GAP)));
      const key: FilterKey = `zone.${parcel.type}`;
      const points = floorLines.get(key) ?? [];
      for (let floor = 1; floor < floors; floor++) {
        const y = floor * floorHeight;
        for (let i = 0; i < volume.footprint.length; i++) {
          const a = volume.footprint[i];
          const b = volume.footprint[(i + 1) % volume.footprint.length];
          points.push(new THREE.Vector3(a[0], y, a[1]), new THREE.Vector3(b[0], y, b[1]));
        }
      }
      floorLines.set(key, points);
    }
    for (const bucket of buckets.values()) this.merged(bucket.key, bucket.parts, new THREE.MeshLambertMaterial({ color: bucket.color }));
    for (const [key, points] of floorLines) {
      if (points.length === 0) continue;
      const lines = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0x1b1d22, transparent: true, opacity: 0.32 }),
      );
      lines.name = 'floor-elevations';
      this.layer(key).add(lines);
    }
  }

  private buildStreets(bp: CityBlueprint): void {
    const parts: Record<string, THREE.BufferGeometry[]> = { street: [], road: [], highway: [], alley: [] };
    const piers: THREE.BufferGeometry[] = [];
    const surfaces = streetSurfaceRegions(bp);
    parts.street.push(...surfaces.street.map((polygon) => plate(polygon, STREET_SURFACE)));
    parts.road.push(...surfaces.road.map((polygon) => plate(polygon, STREET_SURFACE)));
    for (const edge of bp.streets.edges) {
      if (edge.class !== 'alley') continue;
      const width = Math.max(1.5, edge.sidewalk.left + edge.sidewalk.right);
      parts.alley.push(ribbon(edge.path, width, STREET_SURFACE));
    }
    // One deck per highway run, not per edge: a route is continuous through its
    // junctions and ramps to the ground only at a terminus, where it leaves the city.
    for (const structure of bp.streets.highwayStructures) {
      parts.highway!.push(deck(
        structure.path,
        structure.width,
        structure.elevationProfile,
        structure.deckThickness,
      ));
      piers.push(...structure.supports.map((support) =>
        prism(support.footprint, support.bottom, support.top - support.bottom)));
    }
    for (const cls of Object.keys(parts) as (keyof typeof parts)[]) {
      this.merged(`street.${cls as StreetEdge['class']}`, parts[cls]!, new THREE.MeshLambertMaterial({ color: streetColor(cls as StreetEdge['class']) }));
    }
    this.merged('street.highway', piers, new THREE.MeshLambertMaterial({ color: 0x4a4f57 }));
  }

  private buildTransit(bp: CityBlueprint): void {
    const t = bp.transit;
    const under = (level: number) => level < 0;
    const rail = (key: FilterKey, path: Polyline, level: number, width: number, color: string) => {
      if (under(level)) {
        this.layer(key).add(new THREE.Mesh(tunnel(path, width / 2, level), new THREE.MeshLambertMaterial({ color })));
      } else {
        this.layer(key).add(new THREE.Mesh(ribbon(path, width, level + 0.06), new THREE.MeshLambertMaterial({ color })));
      }
    };
    // the earth the tunnels run through: a dark translucent slab under the whole city
    if (t.subwayLines.length > 0) {
      const b = boundsOf(bp.meta.boundary);
      const earth = new THREE.Mesh(
        new THREE.BoxGeometry(b.max[0] - b.min[0], EARTH_DEPTH, b.max[1] - b.min[1]),
        new THREE.MeshLambertMaterial({ color: 0x2b2420, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      earth.position.set((b.min[0] + b.max[0]) / 2, -EARTH_DEPTH / 2, (b.min[1] + b.max[1]) / 2);
      this.layer('transit.subway').add(earth);
    }
    for (const line of t.trainLines) rail('transit.train', line.path, line.level, line.width, TRANSIT_COLORS.train);
    for (const line of t.subwayLines) rail('transit.subway', line.path, line.level, line.width, TRANSIT_COLORS.subway);

    this.merged('transit.train', t.trainStations.flatMap(stationParts), new THREE.MeshLambertMaterial({ color: TRANSIT_COLORS.trainStation }));
    this.merged('transit.subway', t.subwayStations.flatMap(stationParts), new THREE.MeshLambertMaterial({ color: TRANSIT_COLORS.subwayStation }));
    const stops: THREE.BufferGeometry[] = [];
    for (const stop of t.busStops) stops.push(new THREE.BoxGeometry(2, 2.5, 2).translate(stop.position[0], 1.25, stop.position[1]));
    this.merged('transit.bus', stops, new THREE.MeshLambertMaterial({ color: TRANSIT_COLORS.busStop }));
  }

  /** Signals on their masts and the furnishing strip: a tree, a lamp or a bin per point. */
  private buildFurniture(bp: CityBlueprint): void {
    this.merged(
      'furniture.signal',
      bp.streets.signals.flatMap(signalParts),
      new THREE.MeshLambertMaterial({ color: FURNITURE_COLORS.signal }),
    );
    const byKind: Record<PlantingKind, THREE.BufferGeometry[]> = { tree: [], pole: [], bin: [] };
    for (const point of bp.streets.planting) byKind[point.kind]?.push(...plantingParts(point.kind, point.position));
    for (const kind of Object.keys(byKind) as PlantingKind[]) {
      this.merged(`furniture.${kind}`, byKind[kind], new THREE.MeshLambertMaterial({ color: FURNITURE_COLORS[kind] }));
    }
  }

  private buildDistricts(bp: CityBlueprint): void {
    for (const d of bp.districts) {
      const points = d.boundary.map(([x, z]) => new THREE.Vector3(x, 0.3, z));
      points.push(points[0]!.clone());
      this.layer('districts').add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x222222 })));
    }
  }

  /** Bright optional overlays expose the arithmetic without changing city geometry. */
  private buildDiagnostics(bp: CityBlueprint): void {
    for (const structure of bp.streets.highwayStructures) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(profilePoints(structure.path, structure.elevationProfile, 0.35)),
        new THREE.LineBasicMaterial({ color: DIAGNOSTIC_COLORS.highwayCenterlines }),
      );
      this.layer('diagnostic.highwayCenterlines').add(line);
    }
    const supports = bp.streets.highwayStructures.flatMap((structure) => structure.supports.map((support) =>
      prism(support.footprint, support.bottom, support.top - support.bottom)));
    this.merged(
      'diagnostic.highwaySupports',
      supports,
      new THREE.MeshBasicMaterial({ color: DIAGNOSTIC_COLORS.highwaySupports, wireframe: true }),
    );
    for (const station of bp.transit.subwayStations) {
      for (const access of station.accessPaths) {
        for (const segment of access.segments) {
          const points = segment.path.map(([x, y, z]) => new THREE.Vector3(x, y + 0.2, z));
          this.layer('diagnostic.stationAccess').add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: DIAGNOSTIC_COLORS.stationAccess }),
          ));
        }
      }
    }
  }

  private popupNode: HTMLElement | null = null;

  private popup(parcel: Parcel, x: number, y: number): void {
    this.popupNode?.remove();
    const node = popupFor(parcel, x, y, () => this.onParcelClick?.(parcel));
    this.popupNode = node;
    this.canvas.parentElement?.append(node);
    const dismiss = (e: Event) => { if (e.target !== node && !node.contains(e.target as Node)) { node.remove(); document.removeEventListener('pointerdown', dismiss); } };
    setTimeout(() => document.addEventListener('pointerdown', dismiss), 0);
  }

  /** The parcel under the pointer, offered in a popup; left clicks only orbit. */
  private pick(event: MouseEvent): void {
    if ((!this.onParcelClick && !this.onParcelInspect) || !this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const zones = [...this.layers.entries()].filter(([key, g]) => key.startsWith('zone.') && g.visible).map(([, g]) => g);
    const hit = raycaster.intersectObjects(zones, true)[0];
    if (!hit) return;
    // the merged mesh does not know its parcels; the footprint under the hit does
    const parcel = this.parcels.find((p) => pointInPolygon([hit.point.x, hit.point.z], p.footprint));
    if (parcel) {
      this.onParcelInspect?.(parcel);
      if (this.onParcelClick) this.popup(parcel, event.clientX, event.clientY);
    }
  }
}

/** The popup a right click opens over a building: what it is, and a way into its own view. */
function popupFor(parcel: Parcel, x: number, y: number, open: () => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'parcel-popup';
  root.style.left = `${x}px`;
  root.style.top = `${y}px`;
  const title = document.createElement('div');
  title.className = 'parcel-popup-title';
  title.textContent = `${parcel.id} · ${parcel.type} ${parcel.tier} · block ${parcel.blockId}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.textContent = 'Open in new view';
  button.addEventListener('click', () => { open(); root.remove(); });
  root.append(title, button);
  return root;
}

function shapeOf(polygon: Polygon): THREE.Shape {
  return new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
}

/** A signal: the pole on the kerb, the mast reaching over the lanes, the head hanging off its end. */
function signalParts(signal: TrafficSignal): THREE.BufferGeometry[] {
  const [x, z] = signal.position;
  const { poleHeight, poleSize, mastSize, headHeight, headSize } = SIGNAL;
  const [dx, dz] = signal.mast.direction;
  const reach = signal.mast.length;
  const mast = new THREE.BoxGeometry(reach, mastSize, mastSize)
    .rotateY(-Math.atan2(dz, dx))
    .translate(x + (dx * reach) / 2, poleHeight - mastSize / 2, z + (dz * reach) / 2);
  return [
    new THREE.BoxGeometry(poleSize, poleHeight, poleSize).translate(x, poleHeight / 2, z),
    mast,
    new THREE.BoxGeometry(headSize, headHeight, headSize)
      .translate(x + dx * reach, poleHeight - mastSize - headHeight / 2, z + dz * reach),
  ];
}

/** What stands at a planting point: a tree, a street lamp or a bin. */
function plantingParts(kind: PlantingKind, [x, z]: Vec2): THREE.BufferGeometry[] {
  if (kind === 'tree') {
    return [
      new THREE.CylinderGeometry(TREE.trunk / 2, TREE.trunk / 2, TREE.trunkHeight, 5).translate(x, TREE.trunkHeight / 2, z),
      new THREE.ConeGeometry(TREE.crown / 2, TREE.crownHeight, 6).translate(x, TREE.trunkHeight + TREE.crownHeight / 2, z),
    ];
  }
  if (kind === 'pole') {
    return [
      new THREE.BoxGeometry(LAMP.size, LAMP.height, LAMP.size).translate(x, LAMP.height / 2, z),
      new THREE.BoxGeometry(LAMP.headLength, LAMP.size, LAMP.size).translate(x, LAMP.height, z),
    ];
  }
  return [new THREE.BoxGeometry(BIN.size, BIN.height, BIN.size).translate(x, BIN.height / 2, z)];
}

/**
 * A station from the street down: a headhouse on the sidewalk over the shaft
 * through the earth, the passage and the platform at the line's level. A
 * station at grade has no shaft, so its entrances are posts on the sidewalk.
 */
function stationParts(s: Station): THREE.BufferGeometry[] {
  const parts = [prism(s.platform, s.level, PLATFORM_THICKNESS)];
  for (const shaft of s.shafts) {
    if (shaft.passage.length >= 3) parts.push(prism(shaft.passage, s.level, PLATFORM_THICKNESS));
    parts.push(prism(shaft.footprint, shaft.bottom, shaft.top - shaft.bottom));
    parts.push(prism(shaft.footprint, shaft.top, HEADHOUSE_HEIGHT));
  }
  if (s.shafts.length === 0) {
    for (const [x, z] of s.entrances) {
      parts.push(new THREE.BoxGeometry(2, HEADHOUSE_HEIGHT, 2).translate(x, HEADHOUSE_HEIGHT / 2, z));
    }
  }
  return parts;
}

/** A polygon extruded upward from `base`. */
function prism(polygon: Polygon, base: number, height: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shapeOf(polygon), { depth: Math.max(0.05, height), bevelEnabled: false })
    .rotateX(-Math.PI / 2)
    .translate(0, base, 0);
}

/** A flat polygon at height y, facing up. */
function plate(polygon: Polygon, y: number): THREE.BufferGeometry {
  return new THREE.ShapeGeometry(shapeOf(polygon)).rotateX(-Math.PI / 2).translate(0, y, 0);
}

/** Unit direction of a segment. */
function direction(a: Vec2, b: Vec2): Vec2 {
  return normalize([b[0] - a[0], b[1] - a[1]]);
}

/**
 * A flat strip along a polyline at height y, facing up: one quad per segment,
 * exactly half the width to each side, plus a round joint at every bend so
 * the strip never reaches past its own width on a corner.
 */
function ribbon(path: Polyline, width: number, y: number): THREE.BufferGeometry {
  return strip(path, width, () => y, () => y);
}

/** Joint fans and segment quads shared by ribbons and decks: heights come from `top` and `bottom` per distance along. */
function strip(path: Polyline, width: number, top: (along: number) => number, bottom: (along: number) => number): THREE.BufferGeometry {
  const half = width / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const push = (x: number, yy: number, z: number): number => { positions.push(x, yy, z); return positions.length / 3 - 1; };
  const quad = (p: number, q: number, r: number, s: number) => indices.push(p, q, r, p, r, s);
  let along = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = dist(a, b);
    if (len < 1e-6) continue;
    const d = direction(a, b);
    const n: Vec2 = [-d[1] * half, d[0] * half];
    const a0 = along;
    const a1 = along + len;
    const closed = top(a0) !== bottom(a0) || top(a1) !== bottom(a1);
    // top face
    const tl0 = push(a[0] + n[0], top(a0), a[1] + n[1]);
    const tr0 = push(a[0] - n[0], top(a0), a[1] - n[1]);
    const tl1 = push(b[0] + n[0], top(a1), b[1] + n[1]);
    const tr1 = push(b[0] - n[0], top(a1), b[1] - n[1]);
    quad(tl0, tl1, tr1, tr0);
    if (closed) {
      // sides and bottom of a slab
      const bl0 = push(a[0] + n[0], bottom(a0), a[1] + n[1]);
      const br0 = push(a[0] - n[0], bottom(a0), a[1] - n[1]);
      const bl1 = push(b[0] + n[0], bottom(a1), b[1] + n[1]);
      const br1 = push(b[0] - n[0], bottom(a1), b[1] - n[1]);
      quad(tr0, tr1, br1, br0);
      quad(bl0, bl1, tl1, tl0);
      quad(br0, br1, bl1, bl0);
    }
    // round joint at the far end of every inner segment
    if (i < path.length - 1) {
      const c = push(b[0], top(a1), b[1]);
      const ring: number[] = [];
      for (let k = 0; k <= JOINT_SEGMENTS; k++) {
        const t = (k / JOINT_SEGMENTS) * Math.PI * 2;
        ring.push(push(b[0] + Math.cos(t) * half, top(a1), b[1] + Math.sin(t) * half));
      }
      for (let k = 0; k < JOINT_SEGMENTS; k++) indices.push(c, ring[k + 1]!, ring[k]!);
      if (closed) {
        const cb = push(b[0], bottom(a1), b[1]);
        const ringB: number[] = [];
        for (let k = 0; k <= JOINT_SEGMENTS; k++) {
          const t = (k / JOINT_SEGMENTS) * Math.PI * 2;
          ringB.push(push(b[0] + Math.cos(t) * half, bottom(a1), b[1] + Math.sin(t) * half));
        }
        for (let k = 0; k < JOINT_SEGMENTS; k++) {
          indices.push(cb, ringB[k]!, ringB[k + 1]!);
          quad(ring[k]!, ring[k + 1]!, ringB[k + 1]!, ringB[k]!);
        }
      }
    }
    along = a1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const JOINT_SEGMENTS = 12;

/** A closed slab along a path whose height is read from the blueprint profile. */
function deck(path: Polyline, width: number, profile: ElevationPoint[], thickness: number): THREE.BufferGeometry {
  const profiledPath = pathWithBreakpoints(path, profile);
  const top = (along: number) => profileLevel(profile, along);
  return strip(profiledPath, width, top, (along) => Math.max(0, top(along) - thickness));
}

function profileLevel(profile: ElevationPoint[], distanceAlong: number): number {
  if (profile.length === 0) return 0;
  if (distanceAlong <= profile[0]!.distance) return profile[0]!.level;
  for (let index = 1; index < profile.length; index++) {
    const before = profile[index - 1]!;
    const after = profile[index]!;
    if (distanceAlong > after.distance) continue;
    const span = after.distance - before.distance;
    const t = span > 0 ? (distanceAlong - before.distance) / span : 0;
    return before.level + (after.level - before.level) * t;
  }
  return profile[profile.length - 1]!.level;
}

/** Path vertices plus profile breakpoints, so every ramp transition remains visible. */
function profilePoints(path: Polyline, profile: ElevationPoint[], lift: number): THREE.Vector3[] {
  const pathDistances: number[] = [0];
  for (let index = 1; index < path.length; index++) {
    pathDistances.push(pathDistances[index - 1]! + dist(path[index - 1]!, path[index]!));
  }
  const distances = [...new Set([...pathDistances, ...profile.map((point) => point.distance)])].sort((a, b) => a - b);
  return distances.map((distanceAlong) => {
    const [x, z] = pointAlong(path, pathDistances, distanceAlong);
    return new THREE.Vector3(x, profileLevel(profile, distanceAlong) + lift, z);
  });
}

function pathWithBreakpoints(path: Polyline, profile: ElevationPoint[]): Polyline {
  const pathDistances: number[] = [0];
  for (let index = 1; index < path.length; index++) {
    pathDistances.push(pathDistances[index - 1]! + dist(path[index - 1]!, path[index]!));
  }
  const distances = [...new Set([...pathDistances, ...profile.map((point) => point.distance)])].sort((a, b) => a - b);
  return distances.map((distanceAlong) => pointAlong(path, pathDistances, distanceAlong));
}

function pointAlong(path: Polyline, distances: number[], target: number): Vec2 {
  if (target <= 0) return path[0]!;
  for (let index = 1; index < path.length; index++) {
    if (target > distances[index]!) continue;
    const startDistance = distances[index - 1]!;
    const span = distances[index]! - startDistance;
    const t = span > 0 ? (target - startDistance) / span : 0;
    return [
      path[index - 1]![0] + (path[index]![0] - path[index - 1]![0]) * t,
      path[index - 1]![1] + (path[index]![1] - path[index - 1]![1]) * t,
    ];
  }
  return path[path.length - 1]!;
}

/** A round tunnel along a path at a level below the ground. */
function tunnel(path: Polyline, radius: number, level: number): THREE.BufferGeometry {
  const points = path.map(([x, z]) => new THREE.Vector3(x, level, z));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.1), Math.max(8, path.length * 4), radius, 8, false);
}

function normalize([x, z]: Vec2): Vec2 {
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
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

function boundsOf(polygon: Polygon): { min: Vec2; max: Vec2 } {
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  return { min: [Math.min(...xs), Math.min(...zs)], max: [Math.max(...xs), Math.max(...zs)] };
}
