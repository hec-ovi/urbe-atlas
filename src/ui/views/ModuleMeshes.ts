import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ModuleConstruction, ModulePlacement, ModuleRole } from '../../streets/construction/modules/schema';
import { FURNITURE_COLORS, GROUND_COLORS } from '../components/colors';
import type { FilterKey } from './filters';

const appearance: Record<ModuleRole, { layer: FilterKey; color: string }> = {
  panel: { layer: 'ground.sidewalk', color: GROUND_COLORS.sidewalk },
  joint: { layer: 'ground.sidewalk', color: '#303b46' },
  curb: { layer: 'ground.curb', color: GROUND_COLORS.curb },
  gutter: { layer: 'ground.gutter', color: GROUND_COLORS.gutter },
  'gutter-lip': { layer: 'ground.gutter', color: GROUND_COLORS.curb },
  guardrail: { layer: 'furniture.guardrail', color: FURNITURE_COLORS.guardrail },
  roadway: { layer: 'ground.roadway', color: GROUND_COLORS.roadway },
  marking: { layer: 'ground.roadway', color: '#d8d1bb' },
};

/** One local mesh per template role, shared by every placed repetition. */
export class ModuleMeshes {
  static build(construction: ModuleConstruction, layer: (key: FilterKey) => THREE.Group): void {
    const placements = new Map<string, ModulePlacement[]>();
    for (const placement of construction.placements) {
      const bucket = placements.get(placement.moduleId) ?? [];
      bucket.push(placement);
      placements.set(placement.moduleId, bucket);
    }
    for (const definition of construction.definitions) {
      const placed = placements.get(definition.id);
      if (!placed?.length) continue;
      const count = placed.reduce((total, placement) => total + placement.count, 0);
      const roles = new Map<ModuleRole, THREE.BufferGeometry[]>();
      for (const part of definition.parts) {
        const shape = new THREE.Shape(part.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: part.top - part.bottom, bevelEnabled: false, steps: 1 })
          .rotateX(-Math.PI / 2).translate(0, part.bottom, 0);
        const bucket = roles.get(part.role) ?? [];
        bucket.push(geometry);
        roles.set(part.role, bucket);
      }
      for (const [role, parts] of roles) {
        const geometry = mergeGeometries(parts, false)!;
        parts.forEach(part => part.dispose());
        const style = appearance[role];
        const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: style.color }), count);
        mesh.name = `module:${definition.id}:${role}`;
        mesh.userData.moduleId = definition.id;
        mesh.userData.role = role;
        const matrix = new THREE.Matrix4();
        let instance = 0;
        for (const placement of placed) {
          const c = [1, 0, -1, 0][placement.turn];
          const s = [0, 1, 0, -1][placement.turn];
          for (let repeat = 0; repeat < placement.count; repeat++) {
            const distance = repeat * placement.step;
            matrix.set(c, 0, -s, placement.origin[0] + c * distance,
              0, 1, 0, 0, s, 0, c, placement.origin[1] + s * distance, 0, 0, 0, 1);
            mesh.setMatrixAt(instance++, matrix);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        layer(style.layer).add(mesh);
      }
    }
  }
}
