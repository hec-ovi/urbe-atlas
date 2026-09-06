// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { moduleBlueprint } from './fixtures/moduleBlueprint';
import { Map3DView } from './views/Map3DView';
import { MapView } from './views/MapView';
import { defaultFilters } from './views/filters';
import { GROUND_COLORS } from './components/colors';

afterEach(() => vi.restoreAllMocks());

it('renders metre-sized module bodies with shared geometry and exact repeated quarter turns', () => {
  const view = new Map3DView();
  const blueprint = moduleBlueprint();
  view.setBlueprint(blueprint);
  const layers = (view as unknown as { layers: Map<string, THREE.Group> }).layers;
  const meshes = [...layers.values()].flatMap(group => group.children) as THREE.InstancedMesh[];
  expect(meshes).toHaveLength(8);
  expect(meshes.every(mesh => mesh.isInstancedMesh && mesh.count === 8)).toBe(true);
  const panel = meshes.find(mesh => mesh.userData.role === 'panel')!;
  const box = new THREE.Box3().setFromBufferAttribute(panel.geometry.getAttribute('position') as THREE.BufferAttribute);
  expect(box.min.x).toBeCloseTo(0.006);
  expect(box.max.x).toBeCloseTo(0.994);
  expect(box.min.y).toBeCloseTo(0.18);
  expect(box.max.y).toBeCloseTo(0.2);
  expect(panel.geometry.getAttribute('uv').count).toBe(panel.geometry.getAttribute('position').count);
  const matrix = new THREE.Matrix4();
  const origins = [[20, 30], [22, 30], [20, 30], [20, 32], [20, 30], [18, 30], [20, 30], [20, 28]];
  origins.forEach(([x, z], index) => {
    panel.getMatrixAt(index, matrix);
    expect(new THREE.Vector3().applyMatrix4(matrix).toArray()).toEqual([x, 0, z]);
    const point = new THREE.Vector3(1, 0.2, 2).applyMatrix4(matrix);
    const offsets = [[1, 2], [-2, 1], [-1, -2], [2, -1]][Math.floor(index / 2)];
    expect(point.toArray()).toEqual([x + offsets[0], 0.2, z + offsets[1]]);
  });
  expect((panel.material as THREE.MeshLambertMaterial).opacity).toBe(1);
  expect(layers.get('ground.gutter')!.children).toHaveLength(2);
  expect(layers.get('furniture.guardrail')!.visible).toBe(true);
  view.setFilters({ ...defaultFilters(), 'ground.gutter': false, 'furniture.guardrail': false });
  expect(layers.get('ground.gutter')!.visible).toBe(false);
  expect(layers.get('ground.sidewalk')!.visible).toBe(true);
  expect(layers.get('furniture.guardrail')!.visible).toBe(false);
  const disposed = vi.spyOn(panel, 'dispose');
  const geometryDisposed = vi.spyOn(panel.geometry, 'dispose');
  delete blueprint.streets.construction;
  view.setBlueprint(blueprint);
  expect(disposed).toHaveBeenCalledOnce();
  expect(geometryDisposed).toHaveBeenCalledOnce();
  expect(layers.get('ground.sidewalk')!.children[0]).toBeInstanceOf(THREE.Mesh);
  expect((layers.get('ground.sidewalk')!.children[0] as THREE.InstancedMesh).isInstancedMesh).toBeUndefined();
});

it('draws coarse gutters on the 2D map and respects their ground filter', () => {
  const view = new MapView();
  const context = { fillStyle: '', fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    closePath: vi.fn(), stroke: vi.fn(), arc: vi.fn(), strokeRect: vi.fn(), setLineDash: vi.fn(),
    fill: vi.fn(function (this: { fillStyle: string }) { return this.fillStyle; }) };
  vi.spyOn(view.canvas, 'getContext').mockReturnValue(context as never);
  view.setBlueprint(moduleBlueprint());
  expect(context.fill.mock.results.some(result => result.value === GROUND_COLORS.gutter)).toBe(true);
  context.fill.mockClear();
  view.setFilters({ ...defaultFilters(), 'ground.gutter': false });
  expect(context.fill.mock.results.some(result => result.value === GROUND_COLORS.gutter)).toBe(false);
});
