// ── Formations module ───────────────────────────────────
import * as THREE from 'three';
import { state } from '../state.js';
import { RENDER_ORDER, COLORS, NAMES, ROCK_TYPE } from '../config.js';
import { applyVerticalTransform, getExplodeOffset } from './transforms.js';

// Re-export transforms for backwards compatibility
export { applyVerticalTransform, getExplodeOffset, updateClipping } from './transforms.js';

/**
 * Build formation meshes from surface data.
 * @param {Object} surfaces - Surface data keyed by formation code
 */
export function buildFormations(surfaces) {
    for (const fm of state.metadata.formations) {
        const data = surfaces[fm.code];
        if (!data) continue;
        const verts = data.vertices;
        const faces = data.faces;

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
        for (const f of faces) {
            if (f.length >= 3) indices.push(f[0], f[1], f[2]);
        }

        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        geom.computeBoundsTree?.();

        const color = new THREE.Color(COLORS[fm.code] || fm.color).offsetHSL(0, 0.08, 0.08);
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: false,
            opacity: 1.0,
            side: THREE.FrontSide,
            depthWrite: true,
            clippingPlanes: [state.terrainClipPlane],
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
            toneMapped: false,
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData = {
            code: fm.code, name: NAMES[fm.code] || fm.name,
            type: 'formation', rawY: rawY,
            rockType: ROCK_TYPE[fm.code],
            conductivity: fm.conductivity,
            thickness: fm.thickness_typical,
        };
        mesh.receiveShadow = true;
        mesh.renderOrder = RENDER_ORDER.FORMATION;
        state.formationGroup.add(mesh);
        state.allFormationMeshes.push(mesh);
    }
}

/**
 * Update exploded layer view.
 * @param {number} amount - Explode amount (0-100)
 */
export function updateExplode(amount) {
    state.currentExplode = amount;
    // Re-apply vertical exag + explode
    applyVerticalTransform();
}

/**
 * Build depth slice from voxel data at given depth.
 * @param {number} depthM - Depth in metres
 */
export function buildDepthSlice(depthM) {
    // Clear previous
    while (state.depthSliceGroup.children.length > 0) {
        const c = state.depthSliceGroup.children[0];
        c.geometry.dispose();
        c.material.dispose();
        state.depthSliceGroup.remove(c);
    }

    if (!state.voxelData) return;

    const xg = state.voxelData.x_grid;
    const yg = state.voxelData.y_grid;
    const zg = state.voxelData.z_grid;
    const ids = state.voxelData.formation_ids;

    // Find nearest z index
    let zi = 0;
    let minDist = Infinity;
    for (let k = 0; k < zg.length; k++) {
        const d = Math.abs(zg[k] - depthM);
        if (d < minDist) { minDist = d; zi = k; }
    }

    const dx = xg.length > 1 ? xg[1] - xg[0] : 400;
    const dy = yg.length > 1 ? yg[1] - yg[0] : 400;
    const fmCodes = state.metadata.formations.map(f => f.code);

    for (let xi = 0; xi < xg.length; xi++) {
        for (let yi = 0; yi < yg.length; yi++) {
            const fid = ids[xi][yi][zi];
            if (fid < 0 || fid >= fmCodes.length) continue;

            const code = fmCodes[fid];
            const color = COLORS[code] || '#888';

            const geom = new THREE.PlaneGeometry(dx * 0.95, dy * 0.95);
            const mat = new THREE.MeshBasicMaterial({
                color: color, side: THREE.DoubleSide,
                transparent: true, opacity: 0.85,
            });
            const tile = new THREE.Mesh(geom, mat);
            tile.rotation.x = -Math.PI / 2;
            tile.position.set(
                xg[xi] - state.cx,
                depthM * state.currentVertExag,
                -(yg[yi] - state.cy)
            );
            tile.userData = {
                type: 'depthslice',
                formation: NAMES[code] || code,
                depth: depthM,
                rawY: depthM,
            };
            state.depthSliceGroup.add(tile);
        }
    }
    if (typeof state.invalidateRaycastCache === 'function') {
        state.invalidateRaycastCache();
    }
}

/**
 * Build SRSC borehole column showing all 7 formations
 * using published stratigraphic thicknesses.
 */
export function buildSRSCColumn() {
    // Clear previous
    while (state.srscColumnGroup.children.length > 0) {
        const c = state.srscColumnGroup.children[0];
        c.geometry.dispose();
        c.material.dispose();
        state.srscColumnGroup.remove(c);
    }

    const srscX = state.metadata.srsc_location.itm_x;
    const srscY = state.metadata.srsc_location.itm_y;

    const colX = srscX - state.cx; // centered on SRSC
    const colZ = -(srscY - state.cy);
    const colWidth = 200;

    const surfaceElev = 50;
    const modelFloor = state.metadata.extent.z_min; // -300
    let currentTop = surfaceElev;

    for (const fm of state.metadata.formations) {
        const code = fm.code;
        let bot = currentTop - fm.thickness_typical;
        // Clip to model floor
        if (bot < modelFloor) bot = modelFloor;
        if (currentTop <= modelFloor) break; // below model, stop
        const thickness = currentTop - bot;
        const centerY = (currentTop + bot) / 2;
        const color = COLORS[code] || '#888';

        const geom = new THREE.BoxGeometry(colWidth, thickness, colWidth);
        const mat = new THREE.MeshBasicMaterial({
            color: color, depthTest: false, transparent: true, opacity: 0.92,
        });
        const box = new THREE.Mesh(geom, mat);
        box.renderOrder = 999;
        box.userData = {
            type: 'srsc_column',
            formation: NAMES[code] || code,
            code: code,
            rockType: ROCK_TYPE[code],
            depthTop: currentTop,
            depthBot: bot,
            rawCenterY: centerY,
            baseX: colX,
            baseZ: colZ,
            fmOrder: fm.order,
        };
        state.srscColumnGroup.add(box);

        // White boundary line between formations
        if (fm.order > 0) {
            const lineGeom = new THREE.BoxGeometry(colWidth + 30, 3, colWidth + 30);
            const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
            const line = new THREE.Mesh(lineGeom, lineMat);
            line.renderOrder = 1000;
            line.userData = { rawCenterY: currentTop, baseX: colX, baseZ: colZ, isBoundary: true };
            state.srscColumnGroup.add(line);
        }

        currentTop = bot;
    }

    applyVerticalTransform();
}

/**
 * Update vertical exaggeration.
 * @param {number} ve - Vertical exaggeration factor
 */
export function updateVerticalExaggeration(ve) {
    state.currentVertExag = ve;
    // Keep the guard clip plane in sync with vertical exaggeration.
    state.terrainClipPlane.constant = (state.terrainClipElevation || 57) * ve;
    applyVerticalTransform();
}
