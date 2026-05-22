// ── Vertical transforms (split from formations.js) ──────────
import * as THREE from 'three';
import { state } from '../state.js';

const SAT_RAW_Z = 55;

/**
 * Get vertical offset for exploded view.
 * Each layer gets pushed down by explode * order * spacing.
 * Spacing of 150m per layer step gives good visual separation.
 * @param {number} formationOrder
 * @returns {number}
 */
export function getExplodeOffset(formationOrder) {
    return state.currentExplode / 100 * formationOrder * -150;
}

// ── Combined vertical transform (exag + explode) ────
export function applyVerticalTransform() {
    const ve = state.currentVertExag;

    // Formation meshes
    for (const mesh of state.formationGroup.children) {
        const rawY = mesh.userData.rawY;
        if (!rawY) continue;
        const order = state.metadata.formations.findIndex(f => f.code === mesh.userData.code);
        const explodeOff = getExplodeOffset(order >= 0 ? order : 0);
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < rawY.length; i++) {
            pos.array[i * 3 + 1] = (rawY[i] + explodeOff) * ve;
        }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
    }

    // Fault meshes (no explode)
    for (const mesh of state.faultGroup.children) {
        const rawY = mesh.userData.rawY;
        if (!rawY) continue;
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < rawY.length; i++) {
            pos.array[i * 3 + 1] = rawY[i] * ve;
        }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
    }

    // Boreholes + markers (InstancedMesh + individual contact rings)
    for (const obj of state.boreholeGroup.children) {
        if (obj.isInstancedMesh && obj.userData.instances) {
            const dummy = new THREE.Object3D();
            const instances = obj.userData.instances;
            const isSeg = obj.userData.type === 'borehole_instanced';
            const isCollar = obj.userData.type === 'bh_collar_instanced';
            const isCap = obj.userData.type === 'bh_cap_instanced';
            for (let i = 0; i < instances.length; i++) {
                const d = instances[i];
                dummy.rotation.set(0, 0, 0);
                if (isSeg) {
                    dummy.position.set(d.baseX, (d.rawTopZ - d.rawHeight / 2) * ve, d.baseZ);
                    dummy.scale.set(d.radius, d.rawHeight * ve, d.radius);
                } else if (isCollar) {
                    dummy.position.set(d.baseX, (d.rawTopZ - d.rawHeight / 2) * ve, d.baseZ);
                    dummy.scale.set(1, ve, 1);
                } else if (isCap) {
                    dummy.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
                    dummy.rotation.x = -Math.PI / 2;
                    dummy.scale.set(1, 1, 1);
                } else {
                    dummy.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
                    dummy.scale.set(1, 1, 1);
                }
                dummy.updateMatrix();
                obj.setMatrixAt(i, dummy.matrix);
            }
            obj.instanceMatrix.needsUpdate = true;
        } else {
            const d = obj.userData;
            if (d.isBHContact) {
                obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
            } else if (d.rawHeight) {
                obj.scale.y = ve;
                obj.position.set(d.baseX, (d.rawTopZ - d.rawHeight / 2) * ve, d.baseZ);
            } else if (d.rawTopZ !== undefined) {
                obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
            }
        }
    }

    // SRSC marker
    for (const obj of state.srscGroup.children) {
        const d = obj.userData;
        if (d.isSRSCPin) {
            obj.scale.y = ve;
            obj.position.set(d.baseX, (d.rawBaseZ + d.rawHeight / 2) * ve, d.baseZ);
        } else if (d.isSRSCSphere) {
            obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
        } else if (d.isSRSCRing) {
            obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
        }
    }

    // Satellite / terrain mesh
    if (state.satellitePlane) {
        if (state.satellitePlane.userData.rawElevations) {
            const pos = state.satellitePlane.geometry.attributes.position;
            const rawElev = state.satellitePlane.userData.rawElevations;
            for (let i = 0; i < pos.count; i++) {
                pos.setZ(i, rawElev[i] * ve);
            }
            pos.needsUpdate = true;
        } else {
            state.satellitePlane.position.y = SAT_RAW_Z * ve;
        }
    }

    // Edge box
    state.worldGroup.children.forEach(c => {
        if (c.userData.isEdgeBox) {
            c.position.y = c.userData.rawCenterY * ve;
            c.scale.y = ve;
        }
    });

    // Depth slice tiles
    for (const tile of state.depthSliceGroup.children) {
        if (tile.userData.rawY !== undefined) {
            tile.position.y = tile.userData.rawY * ve;
        }
    }

    // SRSC column boxes
    for (const box of state.srscColumnGroup.children) {
        const d = box.userData;
        if (d.rawCenterY !== undefined) {
            const explodeOff = d.fmOrder !== undefined ? getExplodeOffset(d.fmOrder) : 0;
            box.position.set(d.baseX, (d.rawCenterY + explodeOff) * ve, d.baseZ);
            if (!d.isBoundary) box.scale.y = ve;
        }
    }

    // Proposed BHE site footprint and subsurface design envelope
    for (const obj of state.proposedSiteGroup.children) {
        const d = obj.userData;
        if (d.isProposedSiteVolume && d.rawCenterY !== undefined) {
            obj.position.set(d.baseX, d.rawCenterY * ve, d.baseZ);
            obj.scale.y = ve;
        } else if (d.rawTopZ !== undefined) {
            obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
        }
    }

    // GSI karst features
    for (const obj of state.karstGroup.children) {
        const d = obj.userData;
        if (d.isKarstRisk) {
            obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
        } else if (d.rawTopZ !== undefined) {
            obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
        }
    }

    // GSI dye traces
    for (const obj of state.dyeTraceGroup.children) {
        const d = obj.userData;
        if (d.isDyeEnd) {
            obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
        } else if (d.rawY && obj.geometry) {
            const pos = obj.geometry.attributes.position;
            for (let i = 0; i < d.rawY.length && i < pos.count; i++) {
                pos.array[i * 3 + 1] = d.rawY[i] * ve;
            }
            pos.needsUpdate = true;
        }
    }

    // GSI wells
    for (const obj of state.gsiWellGroup.children) {
        const d = obj.userData;
        if (d.isWellRing) {
            obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
        } else if (d.rawHeight !== undefined) {
            obj.scale.y = ve;
            obj.position.set(d.baseX, (d.rawTopZ - d.rawHeight / 2) * ve, d.baseZ);
        } else if (d.rawTopZ !== undefined) {
            obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
        }
    }

    // Geotech sites
    for (const obj of state.geotechGroup.children) {
        const d = obj.userData;
        if (d.rawTopZ !== undefined) {
            obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
        }
    }

    // Structural measurements
    for (const obj of state.structuralGroup.children) {
        const d = obj.userData;
        if (d.rawTopZ !== undefined) {
            obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
        } else if (d.rawY && obj.geometry) {
            const pos = obj.geometry.attributes.position;
            for (let i = 0; i < d.rawY.length && i < pos.count; i++) {
                pos.array[i * 3 + 1] = d.rawY[i] * ve;
            }
            pos.needsUpdate = true;
        }
    }

    // Above-surface point markers
    for (const grp of [state.thermalCondGroup, state.bedrockGeolGroup, state.landslideLocsGroup, state.histInvGroup, state.geminiMarkerGroup, state.heatFlowGroup]) {
        for (const obj of grp.children) {
            const d = obj.userData;
            if (d.rawTopZ !== undefined) {
                obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
            }
        }
    }
    // InstancedMesh mineral markers
    for (const obj of state.mineralsGroup.children) {
        if (obj.isInstancedMesh && obj.userData.instances) {
            const dummy = new THREE.Object3D();
            for (let i = 0; i < obj.userData.instances.length; i++) {
                const inst = obj.userData.instances[i];
                dummy.position.set(inst.baseX, inst.rawTopZ * ve, inst.baseZ);
                dummy.updateMatrix();
                obj.setMatrixAt(i, dummy.matrix);
            }
            obj.instanceMatrix.needsUpdate = true;
        } else if (obj.userData.rawTopZ !== undefined) {
            obj.position.set(obj.userData.baseX, obj.userData.rawTopZ * ve, obj.userData.baseZ);
        }
    }

    // Above-surface cylinders
    for (const grp of [state.tempDepthGroup, state.bedrockBhGroup, state.bedrockBhUnverifiedGroup]) {
        for (const obj of grp.children) {
            const d = obj.userData;
            if (d.rawHeight !== undefined) {
                obj.position.set(d.baseX, (d.rawTopZ - d.rawHeight / 2) * ve, d.baseZ);
            } else if (d.rawTopZ !== undefined) {
                obj.position.set(d.baseX, d.rawTopZ * ve, d.baseZ);
            }
        }
    }

    // Surface connection lines
    for (const obj of [...state.karstConnGroup.children, ...state.bedrockCrossSectionGroup.children]) {
        const d = obj.userData;
        if (d.rawY && obj.geometry) {
            const pos = obj.geometry.attributes.position;
            for (let i = 0; i < d.rawY.length && i < pos.count; i++) {
                pos.array[i * 3 + 1] = d.rawY[i] * ve;
            }
            pos.needsUpdate = true;
            obj.geometry.computeBoundingSphere();
        }
    }

    // Surface overlays
    for (const grp of [state.vulnerabilityGroup, state.subsoilGroup, state.aquiferGroup, state.gshpClosedGroup, state.gshpOpenDomGroup, state.gshpOpenComGroup, state.quaternaryGroup, state.hydrostratGroup, state.landslideSuscGroup, state.geoheritageGroup, state.rechargeGroup, state.sourceProtectionGroup, state.epaGwStatusGroup]) {
        for (const obj of grp.children) {
            if (obj.userData.drapedSurface && obj.geometry?.attributes?.rawElev) {
                const pos = obj.geometry.attributes.position;
                const rawElev = obj.geometry.attributes.rawElev;
                for (let i = 0; i < pos.count; i++) {
                    pos.setZ(i, rawElev.getX(i) * ve);
                }
                pos.needsUpdate = true;
                obj.geometry.computeVertexNormals();
                obj.geometry.computeBoundingSphere();
            } else if (obj.userData.rawTopZ !== undefined) {
                obj.position.y = obj.userData.rawTopZ * ve;
            }
        }
    }

    // SRTM terrain surface
    for (const mesh of state.terrainGroup.children) {
        if (mesh.userData.isTerrainSurface && mesh.userData.rawElev) {
            const pos = mesh.geometry.attributes.position;
            const rawElev = mesh.userData.rawElev;
            for (let i = 0; i < pos.count; i++) {
                pos.setY(i, rawElev[i] * ve);
            }
            pos.needsUpdate = true;
            mesh.geometry.computeVertexNormals();
            mesh.geometry.computeBoundingSphere();
        }
    }
}

/**
 * Update clipping planes based on UI state.
 */
export function updateClipping() {
    const clipEW = document.getElementById('tog-clip').checked;
    const clipNS = document.getElementById('tog-clip-ns').checked;
    const pos = parseInt(document.getElementById('clip-pos').value);
    const clipVal = document.getElementById('clip-val');

    const sectionPlanes = [];

    if (clipEW) {
        const range = state.metadata.extent.y_max - state.metadata.extent.y_min;
        const clipY = state.metadata.extent.y_min + (pos / 100) * range;
        const planeZ = -(clipY - state.cy);
        state.clipPlaneEW = new THREE.Plane(new THREE.Vector3(0, 0, -1), planeZ);
        sectionPlanes.push(state.clipPlaneEW);
        clipVal.textContent = pos + '%';
    }
    if (clipNS) {
        const range = state.metadata.extent.x_max - state.metadata.extent.x_min;
        const clipX = state.metadata.extent.x_min + (pos / 100) * range;
        const planeX = clipX - state.cx;
        state.clipPlaneNS = new THREE.Plane(new THREE.Vector3(-1, 0, 0), planeX);
        sectionPlanes.push(state.clipPlaneNS);
        clipVal.textContent = pos + '%';
    }

    if (!clipEW && !clipNS) {
        clipVal.textContent = 'Off';
    }

    state.renderer.clippingPlanes = sectionPlanes;
    const materialPlanes = state.terrainClipPlane ? [state.terrainClipPlane, ...sectionPlanes] : sectionPlanes;

    // Keep the terrain clip active so interpreted geology and faults do not
    // protrude through the above-ground terrain view.
    const allMeshes = [...state.formationGroup.children, ...state.faultGroup.children];
    for (const m of allMeshes) {
        m.material.clippingPlanes = materialPlanes.length > 0 ? materialPlanes : null;
        m.material.clipShadows = true;
        m.material.needsUpdate = true;
    }
}
