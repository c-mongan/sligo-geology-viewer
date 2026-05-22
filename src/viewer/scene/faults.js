// ── Faults module ───────────────────────────────────────
import * as THREE from 'three';
import { state } from '../state.js';
import { RENDER_ORDER } from '../config.js';

/**
 * Build fault meshes from fault data.
 * @param {Array} faults - Array of fault objects with vertices
 */
export function buildFaults(faults) {
    for (const fault of faults) {
        if (!fault.vertices || fault.vertices.length < 4) continue;
        const verts = fault.vertices;
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(verts.length * 3);
        const rawY = new Float32Array(verts.length);

        for (let i = 0; i < verts.length; i++) {
            positions[i * 3] = verts[i][0] - state.cx;
            positions[i * 3 + 1] = verts[i][2];
            positions[i * 3 + 2] = -(verts[i][1] - state.cy);
            rawY[i] = verts[i][2];
        }

        const indices = [];
        const nPairs = Math.floor(verts.length / 2);
        for (let i = 0; i < nPairs - 1; i++) {
            indices.push(i*2, (i+1)*2, i*2+1);
            indices.push(i*2+1, (i+1)*2, (i+1)*2+1);
        }

        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            color: 0xda3633, transparent: true, opacity: 0.3,
            side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
            clippingPlanes: [state.terrainClipPlane],
            polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = RENDER_ORDER.FORMATION;
        mesh.userData = { id: fault.id, type: 'fault', faultType: fault.type, rawY: rawY };
        state.faultGroup.add(mesh);
    }
    state._faultCount = state.faultGroup.children.length;
}
