/**
 * The blueprint in three dimensions: every parcel as its envelope stacked
 * floor by floor in the type's colour, ground cover as plates, streets as
 * ribbons at their level (a highway on its deck), rail as ribbons at their
 * level (a subway under the ground, drawn through it), stations as blocks.
 * Drag orbits, wheel zooms, a click on a building reports its parcel.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CityBlueprint, Parcel, Polygon, Polyline, StreetEdge } from '../../../schema/blueprint';
import { GROUND_COLORS, TRANSIT_COLORS, parcelColor, streetColor } from '../components/colors';
import type { Layers } from './MapView';
import { DEFAULT_LAYERS } from './MapView';

const SKY = 0x0e1117;
const FLOOR_GAP = 0.08;
const RIBBON_LIFT = 0.04;
const STATION_SIZE = 6;

export class Map3DView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 1, 20000);
  private controls: OrbitControls | null = null;
  private readonly groups: Record<keyof Layers, THREE.Group> = {
    ground: new THREE.Group(), zones: new THREE.Group(), streets: new THREE.Group(), transit: new THREE.Group(), districts: new THREE.Group(),
  };
  private readonly parcelOf = new Map<THREE.Object3D, Parcel>();
  private layers: Layers = { ...DEFAULT_LAYERS };
  private frame = 0;

  constructor(private readonly onParcelClick?: (parcel: Parcel) => void) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-view map-view-3d';
    this.scene.background = new THREE.Color(SKY);
    this.scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x2a2622, 1.5), new THREE.DirectionalLight(0xffffff, 1.1).translateY(400).translateX(150));
    for (const g of Object.values(this.groups)) this.scene.add(g);
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
    for (const g of Object.values(this.groups)) g.clear();
    this.parcelOf.clear();
    this.buildGround(bp);
    this.buildParcels(bp);
    this.buildStreets(bp);
    this.buildTransit(bp);
    this.buildDistricts(bp);
    this.resetView();
    this.render();
  }

  setLayers(layers: Layers): void {
    this.layers = { ...layers };
    for (const key of Object.keys(this.groups) as (keyof Layers)[]) this.groups[key].visible = this.layers[key];
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
    const box = new THREE.Box3().setFromObject(this.groups.ground);
    if (box.isEmpty()) box.setFromObject(this.groups.zones);
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

  private buildGround(bp: CityBlueprint): void {
    for (const cover of bp.volumetric.ground) {
      if (cover.polygon.length < 3) continue;
      const y = cover.surface === 'roadway' ? 0 : 0.05;
      const mesh = new THREE.Mesh(plate(cover.polygon, y), new THREE.MeshLambertMaterial({ color: GROUND_COLORS[cover.surface] }));
      this.groups.ground.add(mesh);
    }
  }

  private buildParcels(bp: CityBlueprint): void {
    const byId = new Map(bp.parcels.map((p) => [p.id, p]));
    for (const volume of bp.volumetric.buildings) {
      const parcel = byId.get(volume.parcelId);
      if (!parcel || volume.footprint.length < 3) continue;
      const floors = Math.max(1, Math.round(volume.height / parcel.envelope.floorHeight));
      const floorHeight = volume.height / floors;
      const tone = new THREE.Color(parcelColor(parcel.type, parcel.tier));
      const shape = shapeOf(volume.footprint);
      const group = new THREE.Group();
      for (let i = 0; i < floors; i++) {
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.05, floorHeight - FLOOR_GAP), bevelEnabled: false })
          .rotateX(-Math.PI / 2).translate(0, i * floorHeight, 0);
        const shade = tone.clone().multiplyScalar(i % 2 ? 0.92 : 1);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: shade }));
        group.add(mesh);
        this.parcelOf.set(mesh, parcel);
      }
      this.groups.zones.add(group);
    }
  }

  private buildStreets(bp: CityBlueprint): void {
    for (const edge of bp.streets.edges) {
      const width = Math.max(1.5, edge.width + edge.sidewalk.left + edge.sidewalk.right);
      const mesh = new THREE.Mesh(ribbon(edge.path, width, edge.level + RIBBON_LIFT), new THREE.MeshLambertMaterial({ color: streetColor(edge.class) }));
      this.groups.streets.add(mesh);
      if (edge.level > 0) this.groups.streets.add(piers(edge, width));
    }
  }

  private buildTransit(bp: CityBlueprint): void {
    const t = bp.transit;
    const rail = (path: Polyline, level: number, color: string) => {
      const under = level < 0;
      const material = new THREE.MeshLambertMaterial({ color, transparent: under, opacity: under ? 0.55 : 1, depthTest: !under });
      const mesh = new THREE.Mesh(ribbon(path, 4, level + RIBBON_LIFT), material);
      mesh.renderOrder = under ? 2 : 0;
      this.groups.transit.add(mesh);
    };
    for (const line of t.trainLines) rail(line.path, line.level, TRANSIT_COLORS.train);
    for (const line of t.subwayLines) rail(line.path, line.level, TRANSIT_COLORS.subway);
    const station = (position: [number, number], level: number, color: string) => {
      const under = level < 0;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(STATION_SIZE, 3, STATION_SIZE), new THREE.MeshLambertMaterial({ color, depthTest: !under }));
      mesh.position.set(position[0], level + 1.5, position[1]);
      mesh.renderOrder = under ? 3 : 0;
      this.groups.transit.add(mesh);
    };
    for (const s of t.trainStations) station(s.position, s.level, TRANSIT_COLORS.trainStation);
    for (const s of t.subwayStations) station(s.position, s.level, TRANSIT_COLORS.subwayStation);
    for (const stop of t.busStops) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2.5, 2), new THREE.MeshLambertMaterial({ color: TRANSIT_COLORS.busStop }));
      mesh.position.set(stop.position[0], 1.25, stop.position[1]);
      this.groups.transit.add(mesh);
    }
  }

  private buildDistricts(bp: CityBlueprint): void {
    for (const d of bp.districts) {
      const points = d.boundary.map(([x, z]) => new THREE.Vector3(x, 0.3, z));
      points.push(points[0]!.clone());
      this.groups.districts.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x222222 })));
    }
    this.groups.districts.visible = this.layers.districts;
  }

  private pick(event: MouseEvent): void {
    if (!this.onParcelClick || !this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const hit = raycaster.intersectObjects(this.groups.zones.children, true).find((h) => this.parcelOf.has(h.object));
    if (hit) this.onParcelClick(this.parcelOf.get(hit.object)!);
  }
}

function shapeOf(polygon: Polygon): THREE.Shape {
  return new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
}

/** A flat polygon at height y, facing up. */
function plate(polygon: Polygon, y: number): THREE.BufferGeometry {
  return new THREE.ShapeGeometry(shapeOf(polygon)).rotateX(-Math.PI / 2).translate(0, y, 0);
}

/** A flat strip of one width along a polyline at height y, facing up. */
function ribbon(path: Polyline, width: number, y: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const half = width / 2;
  for (let i = 0; i < path.length; i++) {
    const [x, z] = path[i]!;
    const [px, pz] = path[Math.max(0, i - 1)]!;
    const [nx, nz] = path[Math.min(path.length - 1, i + 1)]!;
    const dx = nx - px, dz = nz - pz;
    const len = Math.hypot(dx, dz) || 1;
    const ox = (-dz / len) * half, oz = (dx / len) * half;
    positions.push(x + ox, y, z + oz, x - ox, y, z - oz);
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

/** Columns under an elevated deck, one every 30 m along its path. */
function piers(edge: StreetEdge, width: number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0x4a4f57 });
  let carry = 0;
  for (let i = 1; i < edge.path.length; i++) {
    const [ax, az] = edge.path[i - 1]!;
    const [bx, bz] = edge.path[i]!;
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 30 - carry; d < len; d += 30) {
      const t = d / len;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2, width / 3), edge.level, Math.min(2, width / 3)), material);
      pier.position.set(ax + (bx - ax) * t, edge.level / 2, az + (bz - az) * t);
      group.add(pier);
    }
    carry = (carry + len) % 30;
  }
  return group;
}
