// ── Markers module ──────────────────────────────────────
import * as THREE from 'three';
import { state } from '../state.js';
import { COLORS, NAMES } from '../config.js';
import { itmToModel, modelExtentAccuracyNote } from '../utils.js';

function coordMetaFromItm(itmX, itmY, source = 'official ITM coordinate', accuracy = null) {
    return { itmX, itmY, coordSource: source, coordAccuracy: accuracy || modelExtentAccuracyNote(itmX, itmY) };
}

// ── Build boreholes (InstancedMesh for GPU performance) ──
const _boreholeMaterialCache = new Map();

function surfaceZAtModel(modelX, modelZ, fallback = 57) {
    const terrain = state.terrainData;
    if (!terrain?.elevations?.length) return fallback;
    const itmX = modelX + state.cx;
    const itmY = -modelZ + state.cy;
    const rows = terrain.resolution?.[0] || terrain.elevations.length;
    const cols = terrain.resolution?.[1] || terrain.elevations[0]?.length || 0;
    if (rows < 2 || cols < 2) return fallback;
    const u = (itmX - terrain.x_min) / (terrain.x_max - terrain.x_min);
    const v = (itmY - terrain.y_min) / (terrain.y_max - terrain.y_min);
    if (u < 0 || u > 1 || v < 0 || v > 1) return fallback;
    const x = u * (cols - 1);
    const y = v * (rows - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, cols - 1);
    const y1 = Math.min(y0 + 1, rows - 1);
    const tx = x - x0;
    const ty = y - y0;
    const e00 = terrain.elevations[y0]?.[x0];
    const e10 = terrain.elevations[y0]?.[x1];
    const e01 = terrain.elevations[y1]?.[x0];
    const e11 = terrain.elevations[y1]?.[x1];
    if (![e00, e10, e01, e11].every(Number.isFinite)) return fallback;
    const top = e00 * (1 - tx) + e10 * tx;
    const bottom = e01 * (1 - tx) + e11 * tx;
    return top * (1 - ty) + bottom * ty;
}

function makeSiteLabelTexture(lines) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(13, 17, 23, 0.88)';
    ctx.strokeStyle = 'rgba(63, 185, 80, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 16);
    } else {
        ctx.rect(10, 10, canvas.width - 20, canvas.height - 20);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#7ee787';
    ctx.font = '600 30px Inter, system-ui, sans-serif';
    ctx.fillText(lines[0], 34, 58);
    ctx.fillStyle = '#e6edf3';
    ctx.font = '500 24px Inter, system-ui, sans-serif';
    ctx.fillText(lines[1], 34, 100);
    ctx.fillStyle = '#8b949e';
    ctx.font = '400 20px Inter, system-ui, sans-serif';
    ctx.fillText(lines[2], 34, 138);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function sampleFormationSurfaceZ(code, modelX, modelZ) {
    const mesh = state.allFormationMeshes.find(m => m.userData.code === code);
    const pos = mesh?.geometry?.attributes?.position;
    const rawY = mesh?.userData?.rawY;
    const index = mesh?.geometry?.index;
    if (!pos || !rawY || !index) return null;

    let sampled = null;
    const ix = index.array;
    for (let i = 0; i < ix.length; i += 3) {
        const a = ix[i];
        const b = ix[i + 1];
        const c = ix[i + 2];
        const ax = pos.getX(a);
        const az = pos.getZ(a);
        const bx = pos.getX(b);
        const bz = pos.getZ(b);
        const cx = pos.getX(c);
        const cz = pos.getZ(c);
        const denom = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(denom) < 1e-9) continue;

        const wa = ((bz - cz) * (modelX - cx) + (cx - bx) * (modelZ - cz)) / denom;
        const wb = ((cz - az) * (modelX - cx) + (ax - cx) * (modelZ - cz)) / denom;
        const wc = 1 - wa - wb;
        if (wa < -1e-5 || wb < -1e-5 || wc < -1e-5) continue;

        const z = rawY[a] * wa + rawY[b] * wb + rawY[c] * wc;
        if (sampled == null || z > sampled) sampled = z;
    }
    return sampled;
}

function buildLocalFormationLayers(modelX, modelZ, topZ, modelFloor) {
    const layers = [];
    const formations = state.metadata?.formations || [];
    let layerTop = topZ;

    for (let i = 0; i < formations.length; i++) {
        if (layerTop <= modelFloor) break;
        const fm = formations[i];
        const next = formations[i + 1];
        const sampledBottom = next ? sampleFormationSurfaceZ(next.code, modelX, modelZ) : null;
        const typicalBottom = layerTop - (fm.thickness_typical || 50);
        const usesSurface = Number.isFinite(sampledBottom) && sampledBottom < layerTop - 1;
        const rawBottom = usesSurface ? sampledBottom : typicalBottom;
        const layerBottom = Math.max(modelFloor, Math.min(layerTop - 1, rawBottom));
        const layerHeight = layerTop - layerBottom;
        if (layerHeight <= 0) continue;

        layers.push({
            fm,
            top: layerTop,
            bottom: layerBottom,
            height: layerHeight,
            source: usesSurface ? 'sampled 3D formation surface' : 'stratigraphic thickness fallback',
        });
        layerTop = layerBottom;
    }

    return layers;
}

export function getBoreholeMaterial(colorHex) {
    if (_boreholeMaterialCache.has(colorHex)) return _boreholeMaterialCache.get(colorHex);
    const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        transparent: true, opacity: 0.9,
        roughness: 0.5, metalness: 0.05,
    });
    _boreholeMaterialCache.set(colorHex, mat);
    return mat;
}

export function buildBoreholes() {
    const ve = state.currentVertExag;

    // First pass: collect per-instance data
    const segInstances = [];
    const collarInstances = [];
    const capInstances = [];
    const xs = [];
    const zs = [];

    for (const bh of state.boreholeData) {
        if (bh.specific_extraction_Wm == null) {
            bh.specific_extraction_Wm = (bh.heat_extraction_kW && bh.depth)
                ? (bh.heat_extraction_kW * 1000) / bh.depth
                : 0;
        }
        const { x, z } = itmToModel(bh.x, bh.y);
        xs.push(x);
        zs.push(z);
        const depth = bh.depth;
        const collarZ = surfaceZAtModel(x, z, bh.top_z);
        const formations = bh.formations?.length ? bh.formations : ['CDDART'];
        const segmentHeight = depth / formations.length;

        for (let fi = 0; fi < formations.length; fi++) {
            const fmCode = formations[fi];
            const fm = state.metadata.formations.find(f => f.code === fmCode);
            const fmColor = fm?.color || COLORS[fmCode] || '#888888';
            const conductivity = fm?.conductivity ?? 2.0;
            const radius = 10 + (conductivity - 1.5) * 10;
            const segTopZ = collarZ - fi * segmentHeight;

            segInstances.push({
                type: 'borehole', id: bh.id, depth: bh.depth,
                temp: bh.temp_at_bottom, kW: bh.heat_extraction_kW,
                risk: bh.karst_risk, formations: bh.formations,
                formationCode: fmCode,
                rawTopZ: segTopZ, rawHeight: segmentHeight,
                baseX: x, baseZ: z,
                radius, color: fmColor,
                ...coordMetaFromItm(bh.x, bh.y, 'synthetic design borehole coordinate', 'conceptual BHE layout'),
            });

            // Contact rings remain individual meshes (varying inner/outer ratio)
            if (fi > 0) {
                const ringGeom = new THREE.RingGeometry(Math.max(2, radius - 2), radius + 4, 16);
                const ringMat = new THREE.MeshBasicMaterial({
                    color: 0xe6edf3, side: THREE.DoubleSide,
                    transparent: true, opacity: 0.7,
                });
                const ring = new THREE.Mesh(ringGeom, ringMat);
                ring.rotation.x = -Math.PI / 2;
                ring.userData = {
                    rawTopZ: segTopZ,
                    baseX: x,
                    baseZ: z,
                    isBHContact: true,
                    ...coordMetaFromItm(bh.x, bh.y, 'synthetic design borehole coordinate', 'conceptual BHE layout'),
                };
                ring.visible = false;
                state.boreholeGroup.add(ring);
            }
        }

        collarInstances.push({
            type: 'bh_marker', id: bh.id,
            kW: (bh.heat_extraction_kW ?? 0).toFixed(1),
            Wm: (bh.specific_extraction_Wm ?? 0).toFixed(0),
            temp: (bh.temp_at_bottom ?? 0).toFixed(1),
            risk: bh.karst_risk,
            depth: bh.depth,
            formations: bh.formations,
            rawTopZ: collarZ + 1.5, rawHeight: 3,
            baseX: x, baseZ: z,
            ...coordMetaFromItm(bh.x, bh.y, 'synthetic design borehole coordinate', 'conceptual BHE layout'),
        });

        const riskColor = bh.karst_risk === 'high' ? 0xf85149 :
                          bh.karst_risk === 'medium' ? 0xd29922 : 0x3fb950;
        capInstances.push({
            type: 'bh_marker', id: bh.id,
            kW: (bh.heat_extraction_kW ?? 0).toFixed(1),
            Wm: (bh.specific_extraction_Wm ?? 0).toFixed(0),
            temp: (bh.temp_at_bottom ?? 0).toFixed(1),
            risk: bh.karst_risk,
            depth: bh.depth,
            formations: bh.formations,
            rawTopZ: collarZ + 2.5,
            baseX: x, baseZ: z,
            riskColor,
            ...coordMetaFromItm(bh.x, bh.y, 'synthetic design borehole coordinate', 'conceptual BHE layout'),
        });
    }

    // ── Formation segment InstancedMesh (unit cylinder scaled per instance) ──
    if (segInstances.length > 0) {
        const segGeom = new THREE.CylinderGeometry(1, 1, 1, 8);
        const segMat = new THREE.MeshStandardMaterial({
            transparent: true, opacity: 0.9,
            roughness: 0.5, metalness: 0.05,
        });
        const segInst = new THREE.InstancedMesh(segGeom, segMat, segInstances.length);
        segInst.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(segInstances.length * 3), 3
        );

        const dummy = new THREE.Object3D();
        const tmpColor = new THREE.Color();
        for (let i = 0; i < segInstances.length; i++) {
            const s = segInstances[i];
            dummy.position.set(s.baseX, (s.rawTopZ - s.rawHeight / 2) * ve, s.baseZ);
            dummy.scale.set(s.radius, s.rawHeight * ve, s.radius);
            dummy.updateMatrix();
            segInst.setMatrixAt(i, dummy.matrix);

            tmpColor.set(s.color);
            segInst.instanceColor.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
        }

        segInst.instanceMatrix.needsUpdate = true;
        segInst.instanceColor.needsUpdate = true;
        segInst.frustumCulled = false;
        segInst.userData = { type: 'borehole_instanced', instances: segInstances };
        segInst.visible = false;
        state.boreholeGroup.add(segInst);
    }

    // ── Design field envelope (makes the BHE array read as one design system) ──
    if (xs.length > 1 && zs.length > 1) {
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minZ = Math.min(...zs);
        const maxZ = Math.max(...zs);
        const pad = 18;
        const width = maxX - minX + pad * 2;
        const depth = maxZ - minZ + pad * 2;
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;

        const padPlaneGeom = new THREE.PlaneGeometry(width, depth);
        const padPlaneMat = new THREE.MeshBasicMaterial({
            color: 0x3fb950,
            transparent: true,
            opacity: 0.07,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const padPlane = new THREE.Mesh(padPlaneGeom, padPlaneMat);
        padPlane.rotation.x = -Math.PI / 2;
        padPlane.renderOrder = 2;
        const envelopeZ = surfaceZAtModel(cx, cz, 50) + 1;
        padPlane.userData = {
            type: 'bh_array_envelope',
            rawTopZ: envelopeZ,
            baseX: cx,
            baseZ: cz,
            boreholes: state.boreholeData.length,
            width: Math.round(width),
            depth: Math.round(depth),
            coordSource: 'synthetic design borehole field centroid',
            coordAccuracy: 'conceptual BHE layout',
        };
        state.boreholeGroup.add(padPlane);

        const edgeGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 1, depth));
        const edgeMat = new THREE.LineBasicMaterial({
            color: 0x3fb950,
            transparent: true,
            opacity: 0.55,
        });
        const edge = new THREE.LineSegments(edgeGeom, edgeMat);
        edge.userData = {
            type: 'bh_array_envelope',
            rawTopZ: envelopeZ + 0.5,
            baseX: cx,
            baseZ: cz,
            boreholes: state.boreholeData.length,
            width: Math.round(width),
            depth: Math.round(depth),
            coordSource: 'synthetic design borehole field centroid',
            coordAccuracy: 'conceptual BHE layout',
        };
        state.boreholeGroup.add(edge);
    }

    // ── Surface collars: low-profile design dots, not observed well posts ──
    if (collarInstances.length > 0) {
        const markerGeom = new THREE.CylinderGeometry(6, 6, 3, 16);
        const markerMat = new THREE.MeshStandardMaterial({
            color: 0x3fb950, emissive: 0x115511, emissiveIntensity: 0.15,
            roughness: 0.35, transparent: true, opacity: 0.9,
        });
        const markerInst = new THREE.InstancedMesh(markerGeom, markerMat, collarInstances.length);

        const dummy = new THREE.Object3D();
        for (let i = 0; i < collarInstances.length; i++) {
            const m = collarInstances[i];
            dummy.position.set(m.baseX, (m.rawTopZ - m.rawHeight / 2) * ve, m.baseZ);
            dummy.scale.set(1, ve, 1);
            dummy.updateMatrix();
            markerInst.setMatrixAt(i, dummy.matrix);
        }

        markerInst.instanceMatrix.needsUpdate = true;
        markerInst.frustumCulled = false;
        markerInst.userData = { type: 'bh_collar_instanced', instances: collarInstances };
        state.boreholeGroup.add(markerInst);
    }

    // ── Risk cap InstancedMesh (sphere with per-instance risk color) ──
    if (capInstances.length > 0) {
        const capGeom = new THREE.RingGeometry(7, 11, 20);
        const capMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
            roughness: 0.2,
        });
        const capInst = new THREE.InstancedMesh(capGeom, capMat, capInstances.length);
        capInst.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(capInstances.length * 3), 3
        );

        const dummy = new THREE.Object3D();
        const tmpColor = new THREE.Color();
        for (let i = 0; i < capInstances.length; i++) {
            const c = capInstances[i];
            dummy.position.set(c.baseX, c.rawTopZ * ve, c.baseZ);
            dummy.rotation.x = -Math.PI / 2;
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            capInst.setMatrixAt(i, dummy.matrix);

            tmpColor.setHex(c.riskColor);
            capInst.instanceColor.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
        }

        capInst.instanceMatrix.needsUpdate = true;
        capInst.instanceColor.needsUpdate = true;
        capInst.frustumCulled = false;
        capInst.userData = { type: 'bh_cap_instanced', instances: capInstances };
        state.boreholeGroup.add(capInst);
    }
}

export function buildProposedSiteVolume() {
    while (state.proposedSiteGroup.children.length > 0) {
        const child = state.proposedSiteGroup.children[0];
        child.geometry?.dispose?.();
        if (child.material?.map) child.material.map.dispose();
        child.material?.dispose?.();
        state.proposedSiteGroup.remove(child);
    }

    if (!state.boreholeData?.length) return;

    const points = state.boreholeData.map((bh) => {
        const { x, z } = itmToModel(bh.x, bh.y);
        return { x, z, depth: bh.depth || 200 };
    });
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minZ = Math.min(...points.map(p => p.z));
    const maxZ = Math.max(...points.map(p => p.z));
    const designDepth = Math.max(...points.map(p => p.depth));
    const pad = 28;
    const width = maxX - minX + pad * 2;
    const depth = maxZ - minZ + pad * 2;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const topZ = surfaceZAtModel(cx, cz, state.boreholeData[0]?.top_z ?? 50) + 2;
    const bottomZ = topZ - designDepth;
    const centerY = (topZ + bottomZ) / 2;
    const ve = state.currentVertExag;
    const count = state.boreholeData.length;
    const spacing = state.projectConfig?.design_assumptions?.borehole_spacing_m || 10;

    const footprintGeom = new THREE.PlaneGeometry(width, depth);
    const footprintMat = new THREE.MeshBasicMaterial({
        color: 0x3fb950,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const footprint = new THREE.Mesh(footprintGeom, footprintMat);
    footprint.rotation.x = -Math.PI / 2;
    footprint.position.set(cx, topZ * ve, cz);
    footprint.renderOrder = 80;
    footprint.userData = {
        type: 'proposed_site',
        rawTopZ: topZ,
        baseX: cx,
        baseZ: cz,
        title: 'Proposed Closed-Loop BHE Field',
        detail: `${count} boreholes, ${designDepth}m depth, ${spacing}m spacing`,
        coordSource: 'synthetic design borehole field envelope',
        coordAccuracy: 'conceptual BHE layout',
    };
    state.proposedSiteGroup.add(footprint);

    const volumeGeom = new THREE.BoxGeometry(width, designDepth, depth);
    const volumeMat = new THREE.MeshBasicMaterial({
        color: 0x58a6ff,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const volume = new THREE.Mesh(volumeGeom, volumeMat);
    volume.position.set(cx, centerY * ve, cz);
    volume.scale.y = ve;
    volume.renderOrder = 70;
    volume.userData = {
        type: 'proposed_site',
        isProposedSiteVolume: true,
        rawCenterY: centerY,
        rawHeight: designDepth,
        baseX: cx,
        baseZ: cz,
        title: 'Subsurface Design Envelope',
        detail: `Surface to ${designDepth}m below ground`,
        coordSource: 'synthetic design borehole field envelope',
        coordAccuracy: 'conceptual BHE layout',
    };
    state.proposedSiteGroup.add(volume);

    const edgeGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, designDepth, depth));
    const edgeMat = new THREE.LineBasicMaterial({
        color: 0x7ee787,
        transparent: true,
        opacity: 0.75,
    });
    const edges = new THREE.LineSegments(edgeGeom, edgeMat);
    edges.position.set(cx, centerY * ve, cz);
    edges.scale.y = ve;
    edges.renderOrder = 90;
    edges.userData = {
        type: 'proposed_site',
        isProposedSiteVolume: true,
        rawCenterY: centerY,
        rawHeight: designDepth,
        baseX: cx,
        baseZ: cz,
        title: 'Proposed Closed-Loop BHE Field',
        detail: `${count} boreholes inside design envelope`,
        coordSource: 'synthetic design borehole field envelope',
        coordAccuracy: 'conceptual BHE layout',
    };
    state.proposedSiteGroup.add(edges);

    const riskGeom = new THREE.RingGeometry(Math.max(width, depth) * 0.48, Math.max(width, depth) * 0.72, 72);
    const riskMat = new THREE.MeshBasicMaterial({
        color: 0xd29922,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const riskRing = new THREE.Mesh(riskGeom, riskMat);
    riskRing.rotation.x = -Math.PI / 2;
    riskRing.position.set(cx, (topZ + 4) * ve, cz);
    riskRing.renderOrder = 95;
    riskRing.userData = {
        type: 'proposed_site',
        rawTopZ: topZ + 4,
        baseX: cx,
        baseZ: cz,
        title: 'Karst / Vulnerability Flag',
        detail: 'Rkc aquifer and X vulnerability need GI/GPR confirmation',
        coordSource: 'GSI site classification plus design field centroid',
        coordAccuracy: 'screening-level risk context',
    };
    state.proposedSiteGroup.add(riskRing);

    const modelFloor = state.metadata?.extent?.z_min ?? -300;
    const curtainZ = cz + depth * 0.68;
    const curtainThickness = 5;
    const localLayers = buildLocalFormationLayers(cx, cz, topZ, modelFloor);
    for (const layer of localLayers) {
        const { fm, top, bottom, height, source } = layer;

        const layerGeom = new THREE.BoxGeometry(width, height, curtainThickness);
        const layerMat = new THREE.MeshBasicMaterial({
            color: COLORS[fm.code] || fm.color || 0x888888,
            transparent: true,
            opacity: 0.46,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const layerMesh = new THREE.Mesh(layerGeom, layerMat);
        layerMesh.position.set(cx, ((top + bottom) / 2) * ve, curtainZ);
        layerMesh.scale.y = ve;
        layerMesh.renderOrder = 82;
        layerMesh.userData = {
            type: 'proposed_site',
            isProposedSiteVolume: true,
            rawCenterY: (top + bottom) / 2,
            rawHeight: height,
            baseX: cx,
            baseZ: curtainZ,
            title: NAMES[fm.code] || fm.name,
            detail: `Local interpreted layer: ${Math.round(topZ - top)}-${Math.round(topZ - bottom)}m below ground`,
            coordSource: source,
            coordAccuracy: 'screening-level geology; confirm by GI',
        };
        state.proposedSiteGroup.add(layerMesh);

        const boundaryGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-width / 2, 0, 0),
            new THREE.Vector3(width / 2, 0, 0),
        ]);
        const boundaryMat = new THREE.LineBasicMaterial({
            color: 0xe6edf3,
            transparent: true,
            opacity: 0.55,
        });
        const boundary = new THREE.Line(boundaryGeom, boundaryMat);
        boundary.position.set(cx, bottom * ve, curtainZ + curtainThickness / 2 + 0.5);
        boundary.renderOrder = 88;
        boundary.userData = {
            type: 'proposed_site',
            rawTopZ: bottom,
            baseX: cx,
            baseZ: curtainZ + curtainThickness / 2 + 0.5,
            title: 'Interpreted Formation Boundary',
            detail: `${NAMES[fm.code] || fm.name} base, approx. ${Math.round(topZ - bottom)}m below ground`,
            coordSource: source,
            coordAccuracy: 'screening-level geology; confirm by GI',
        };
        state.proposedSiteGroup.add(boundary);
    }

    const depthLayer = localLayers.find(layer => bottomZ <= layer.top && bottomZ >= layer.bottom);
    const designDepthGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-width / 2 - 12, 0, 0),
        new THREE.Vector3(width / 2 + 12, 0, 0),
    ]);
    const designDepthMat = new THREE.LineBasicMaterial({
        color: 0x7ee787,
        transparent: true,
        opacity: 0.95,
    });
    const designDepthLine = new THREE.Line(designDepthGeom, designDepthMat);
    designDepthLine.position.set(cx, bottomZ * ve, curtainZ + curtainThickness / 2 + 2);
    designDepthLine.renderOrder = 96;
    designDepthLine.userData = {
        type: 'proposed_site',
        rawTopZ: bottomZ,
        baseX: cx,
        baseZ: curtainZ + curtainThickness / 2 + 2,
        title: 'Design Borehole Depth',
        detail: `${designDepth}m proposed depth; reaches ${depthLayer ? (NAMES[depthLayer.fm.code] || depthLayer.fm.name) : 'interpreted model floor'}`,
        coordSource: 'design depth and interpreted local geology',
        coordAccuracy: 'conceptual BHE layout',
    };
    state.proposedSiteGroup.add(designDepthLine);

    const labelTexture = makeSiteLabelTexture([
        'Proposed BHE Field',
        `${count} boreholes x ${designDepth}m`,
        `${spacing}m spacing; interpreted geology`,
    ]);
    const labelMat = new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const label = new THREE.Sprite(labelMat);
    label.position.set(cx, (topZ + 55) * ve, cz - depth * 0.75);
    label.scale.set(310, 116, 1);
    label.renderOrder = 999;
    label.userData = {
        type: 'proposed_site',
        rawTopZ: topZ + 55,
        baseX: cx,
        baseZ: cz - depth * 0.75,
        title: 'Proposed BHE Field',
        detail: `${count} boreholes x ${designDepth}m; design scenario`,
        coordSource: 'synthetic design borehole field envelope',
        coordAccuracy: 'conceptual BHE layout',
    };
    state.proposedSiteGroup.add(label);
}

// ── SRSC marker ─────────────────────────────────────
export function buildSRSCMarker() {
    const { x: srscX, z: srscZ } = itmToModel(
        state.metadata.srsc_location.itm_x,
        state.metadata.srsc_location.itm_y,
    );
    const surfaceZ = surfaceZAtModel(srscX, srscZ, 57);

    // Ground target ring, sized to be inspectable against imagery without hovering.
    const ringGeom = new THREE.RingGeometry(18, 26, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf85149, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    const srscCoordMeta = coordMetaFromItm(
        state.metadata.srsc_location.itm_x,
        state.metadata.srsc_location.itm_y,
        'SRSC public listing/site coordinate',
        'building/site centroid',
    );
    ring.userData = { rawTopZ: surfaceZ + 2, baseX: srscX, baseZ: srscZ, isSRSCRing: true, ...srscCoordMeta };
    state.srscGroup.add(ring);

    const crossMat = new THREE.LineBasicMaterial({ color: 0xf85149, transparent: true, opacity: 0.95 });
    const crossSize = 34;
    const crossGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-crossSize, 0, 0),
        new THREE.Vector3(crossSize, 0, 0),
        new THREE.Vector3(0, 0, -crossSize),
        new THREE.Vector3(0, 0, crossSize),
    ]);
    const cross = new THREE.LineSegments(crossGeom, crossMat);
    cross.userData = { rawTopZ: surfaceZ + 2.2, baseX: srscX, baseZ: srscZ, isSRSCRing: true, type: 'srsc', ...srscCoordMeta };
    state.srscGroup.add(cross);

    // Store reference for animation
    state.srscGroup.userData.ring = ring;
    state.srscGroup.userData.ringMat = ringMat;
}

// ── Edge bounding box ───────────────────────────────
export function buildEdgeBox() {
    const w = state.metadata.extent.x_max - state.metadata.extent.x_min;
    const d = state.metadata.extent.y_max - state.metadata.extent.y_min;
    const h = state.metadata.extent.z_max - state.metadata.extent.z_min;

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x21262d, transparent: true, opacity: 0.4 }));
    line.position.y = (state.metadata.extent.z_min + state.metadata.extent.z_max) / 2;
    line.userData = { isEdgeBox: true, rawCenterY: line.position.y, rawH: h };
    line.visible = false;
    state.worldGroup.add(line);
}

// ── GSI Karst features ────────────────────────────────
export function buildKarstFeatures() {
    if (!state.gsiData || !state.gsiData.karst_features) return;
    const KARST_COLORS = {
        'Cave': 0xf0883e,
        'Swallow Hole': 0xf85149,
        'Spring': 0x58a6ff,
        'Enclosed Depression': 0xd29922,
    };
    for (const kf of state.gsiData.karst_features) {
        const { x, z } = itmToModel(kf.itm_x, kf.itm_y);
        const surfZ = surfaceZAtModel(x, z, 55);
        const color = KARST_COLORS[kf.type] || 0xf0883e;
        const karstCoordMeta = coordMetaFromItm(
            kf.itm_x,
            kf.itm_y,
            'processed GSI karst coordinate',
            kf.xy_accuracy || null,
        );

        if (kf.type === 'Cave' || kf.type === 'Swallow Hole') {
            const coneGeom = new THREE.ConeGeometry(34, 48, 8);
            const coneMat = new THREE.MeshStandardMaterial({
                color: color, emissive: color, emissiveIntensity: 0.2,
                roughness: 0.4,
            });
            const cone = new THREE.Mesh(coneGeom, coneMat);
            cone.rotation.x = Math.PI;
            cone.userData = {
                type: 'karst', name: kf.name, karstType: kf.type,
                id: kf.id, distance: kf.distance_to_srsc_m, temp: kf.temp_c,
                rawTopZ: surfZ + 24, baseX: x, baseZ: z,
                ...karstCoordMeta,
            };
            state.karstGroup.add(cone);
        } else if (kf.type === 'Spring') {
            const coneGeom = new THREE.ConeGeometry(34, 44, 8);
            const coneMat = new THREE.MeshStandardMaterial({
                color: color, emissive: color, emissiveIntensity: 0.3,
                roughness: 0.3,
            });
            const cone = new THREE.Mesh(coneGeom, coneMat);
            cone.userData = {
                type: 'karst', name: kf.name, karstType: kf.type,
                id: kf.id, distance: kf.distance_to_srsc_m, temp: kf.temp_c,
                rawTopZ: surfZ + 44, baseX: x, baseZ: z,
                ...karstCoordMeta,
            };
            state.karstGroup.add(cone);
        } else {
            const bowlGeom = new THREE.SphereGeometry(34, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const bowlMat = new THREE.MeshStandardMaterial({
                color: color, emissive: color, emissiveIntensity: 0.2,
                roughness: 0.5,
                side: THREE.DoubleSide,
            });
            const bowl = new THREE.Mesh(bowlGeom, bowlMat);
            bowl.rotation.x = Math.PI;
            bowl.userData = {
                type: 'karst', name: kf.name, karstType: kf.type,
                id: kf.id, distance: kf.distance_to_srsc_m, temp: kf.temp_c,
                rawTopZ: surfZ, baseX: x, baseZ: z,
                ...karstCoordMeta,
            };
            state.karstGroup.add(bowl);
        }

        const geom = new THREE.OctahedronGeometry(28, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: color, emissive: color, emissiveIntensity: 0.3,
            roughness: 0.3,
        });
        const markerMesh = new THREE.Mesh(geom, mat);
        markerMesh.userData = {
            type: 'karst', name: kf.name, karstType: kf.type,
            id: kf.id, distance: kf.distance_to_srsc_m, temp: kf.temp_c,
            rawTopZ: surfZ + 46, baseX: x, baseZ: z,
            ...karstCoordMeta,
        };
        state.karstGroup.add(markerMesh);

        const riskRadius = 500;
        const riskGeom = new THREE.RingGeometry(riskRadius * 0.95, riskRadius, 48);
        const riskMat = new THREE.MeshBasicMaterial({
            color: color, side: THREE.DoubleSide,
            transparent: true, opacity: 0.15,
            depthWrite: false,
        });
        const riskRing = new THREE.Mesh(riskGeom, riskMat);
        riskRing.rotation.x = -Math.PI / 2;
        riskRing.renderOrder = 1;
        riskRing.userData = { rawTopZ: surfZ + 3, baseX: x, baseZ: z, isKarstRisk: true, ...karstCoordMeta };
        state.karstGroup.add(riskRing);

        const discGeom = new THREE.CircleGeometry(riskRadius, 48);
        const discMat = new THREE.MeshBasicMaterial({
            color: color, side: THREE.DoubleSide,
            transparent: true, opacity: 0.06,
            depthWrite: false,
        });
        const disc = new THREE.Mesh(discGeom, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.renderOrder = 1;
        disc.userData = { rawTopZ: surfZ + 2.5, baseX: x, baseZ: z, isKarstRisk: true, ...karstCoordMeta };
        state.karstGroup.add(disc);
    }
}

export function buildRegionalKarstFeatureMarkers() {
    if (!state.regionalKarstData?.length) return;

    const siteKarst = state.gsiData?.karst_features || [];
    const isSiteFeature = (pt) => siteKarst.some(kf => {
        const dx = Number(pt.x) - Number(kf.itm_x);
        const dy = Number(pt.y) - Number(kf.itm_y);
        return Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) < 5;
    });
    const KARST_COLORS = {
        'Cave': 0xf0883e,
        'Swallow Hole': 0xf85149,
        'Spring': 0x58a6ff,
        'Enclosed Depression': 0xd29922,
    };

    for (let i = 0; i < state.regionalKarstData.length; i++) {
        const pt = state.regionalKarstData[i];
        if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y) || isSiteFeature(pt)) continue;
        const { x, z } = itmToModel(pt.x, pt.y);
        const surfZ = surfaceZAtModel(x, z, 55);
        const karstType = pt.KARST_TYPE || 'Karst feature';
        const color = KARST_COLORS[karstType] || 0xf0883e;
        const geom = new THREE.OctahedronGeometry(16, 0);
        const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.12,
            roughness: 0.45,
            transparent: true,
            opacity: 0.62,
        });
        const marker = new THREE.Mesh(geom, mat);
        marker.userData = {
            type: 'karst',
            name: pt.KARST_NAME || karstType,
            karstType,
            id: pt.KARST40KID || pt.OLDKARSTID || `regional-karst-${i + 1}`,
            details: pt.DETAILS,
            comments: pt.COMMENTS,
            county: pt.COUNTY,
            rawTopZ: surfZ + 30,
            baseX: x,
            baseZ: z,
            isRegionalKarst: true,
            sourceDataset: pt.DATASOURCE,
            ...coordMetaFromItm(pt.x, pt.y, 'processed GSI regional karst coordinate', pt.XYACCURACY || null),
        };
        state.karstGroup.add(marker);
    }
}

// ── GSI Dye traces ────────────────────────────────────
export function buildDyeTraces() {
    if (!state.gsiData || !state.gsiData.dye_traces) return;
    const surfZ = 30;
    for (const dt of state.gsiData.dye_traces) {
        const { x: x1, z: z1 } = itmToModel(dt.from.itm_x, dt.from.itm_y);
        const { x: x2, z: z2 } = itmToModel(dt.to.itm_x, dt.to.itm_y);
        const midItmX = (dt.from.itm_x + dt.to.itm_x) / 2;
        const midItmY = (dt.from.itm_y + dt.to.itm_y) / 2;

        const points = [
            new THREE.Vector3(x1, surfZ, z1),
            new THREE.Vector3((x1+x2)/2, surfZ - 80, (z1+z2)/2),
            new THREE.Vector3(x2, surfZ, z2),
        ];
        const curve = new THREE.QuadraticBezierCurve3(points[0], points[1], points[2]);
        const curvePoints = curve.getPoints(30);
        const geom = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const mat = new THREE.LineBasicMaterial({ color: 0xa371f7, linewidth: 2, transparent: true, opacity: 0.45 });
        const line = new THREE.Line(geom, mat);
        line.userData = {
            type: 'dyetrace', name: dt.name, length: dt.length_m,
            date: dt.date, result: dt.result,
            rawPoints: curvePoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
            ...coordMetaFromItm(midItmX, midItmY, 'processed GSI dye trace midpoint'),
        };
        line.userData.rawY = curvePoints.map(p => p.y);
        state.dyeTraceGroup.add(line);

        for (const pt of [points[0], points[2]]) {
            const sg = new THREE.SphereGeometry(12, 8, 8);
            const sm = new THREE.MeshBasicMaterial({ color: 0xa371f7 });
            const s = new THREE.Mesh(sg, sm);
            const isInput = pt === points[0];
            const endpointMeta = pt === points[0]
                ? coordMetaFromItm(dt.from.itm_x, dt.from.itm_y, 'processed GSI dye trace endpoint')
                : coordMetaFromItm(dt.to.itm_x, dt.to.itm_y, 'processed GSI dye trace endpoint');
            s.userData = {
                type: 'dyetrace',
                name: `${dt.name} ${isInput ? 'input' : 'output'}`,
                length: dt.length_m,
                date: dt.date,
                result: dt.result,
                endpoint: isInput ? 'Input' : 'Output',
                rawTopZ: pt.y,
                baseX: pt.x,
                baseZ: pt.z,
                isDyeEnd: true,
                ...endpointMeta,
            };
            state.dyeTraceGroup.add(s);
        }
    }
}

// ── GSI Groundwater wells ─────────────────────────────
export function buildGSIWells() {
    if (!state.gsiData || !state.gsiData.groundwater_wells) return;
    for (const well of state.gsiData.groundwater_wells) {
        const { x, z } = itmToModel(well.itm_x, well.itm_y);
        const surfZ = surfaceZAtModel(x, z, 57);
        const wellCoordMeta = coordMetaFromItm(
            well.itm_x,
            well.itm_y,
            'processed GSI groundwater well coordinate',
            well.xy_accuracy || null,
        );
        const depth = well.depth_m || 10;
        const isSpring = well.type === 'Spring';
        const yieldM3d = well.yield_m3d || 10;
        const isAghamoreSpring = isSpring && /aghamore/i.test(`${well.name || ''} ${well.townland || ''}`);
        const isMajorSpring = isSpring && (yieldM3d > 1000 || isAghamoreSpring);
        const isFail = well.yield_class === 'Failure';
        const markerColor = isFail ? 0xd29922 : (isSpring ? 0x58a6ff : 0x79c0ff);
        const markerRadius = isAghamoreSpring ? 34 : (isMajorSpring ? 30 : 22);

        const pinGeom = isSpring
            ? new THREE.ConeGeometry(markerRadius, 55, 12)
            : new THREE.CylinderGeometry(markerRadius * 0.72, markerRadius * 0.72, 46, 12);
        const pinMat = new THREE.MeshStandardMaterial({
            color: markerColor,
            emissive: isSpring ? 0x113355 : 0x112244,
            emissiveIntensity: isMajorSpring ? 0.45 : 0.25,
            roughness: 0.35,
        });
        const marker = new THREE.Mesh(pinGeom, pinMat);
        marker.userData = {
            type: 'gsi_well', id: well.id, name: well.name,
            wellType: well.type, depth,
            dtb: well.dtb_m, water_strike: well.water_strike_m,
            yield_m3d: well.yield_m3d, yield_class: well.yield_class,
            notes: well.notes, temp: well.temp_c,
            rawTopZ: surfZ + 54, rawHeight: isSpring ? undefined : 46, baseX: x, baseZ: z,
            ...wellCoordMeta,
        };
        state.gsiWellGroup.add(marker);

        if (well.water_strike_m) {
            const wsGeom = new THREE.OctahedronGeometry(16, 0);
            const wsMat = new THREE.MeshStandardMaterial({
                color: 0x58a6ff, emissive: 0x2244aa,
                emissiveIntensity: 0.4, roughness: 0.2,
            });
            const wsMark = new THREE.Mesh(wsGeom, wsMat);
            wsMark.userData = {
                type: 'gsi_well', id: well.id, name: `${well.name} (water strike)`,
                wellType: 'Water Strike', depth: well.water_strike_m,
                dtb: well.dtb_m, water_strike: well.water_strike_m,
                yield_m3d: well.yield_m3d, yield_class: well.yield_class,
                notes: `Water strike at ${well.water_strike_m}m`,
                rawTopZ: surfZ - well.water_strike_m,
                baseX: x, baseZ: z,
                ...wellCoordMeta,
            };
            state.gsiWellGroup.add(wsMark);
        }

        if (well.dtb_m) {
            const dtbGeom = new THREE.RingGeometry(14, 22, 16);
            const dtbMat = new THREE.MeshBasicMaterial({
                color: 0xe6edf3,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6,
            });
            const dtbRing = new THREE.Mesh(dtbGeom, dtbMat);
            dtbRing.rotation.x = -Math.PI / 2;
            dtbRing.userData = {
                type: 'gsi_well', id: well.id, name: `${well.name} (bedrock contact)`,
                wellType: 'Bedrock Contact', depth: well.dtb_m,
                dtb: well.dtb_m, water_strike: well.water_strike_m,
                yield_m3d: well.yield_m3d, yield_class: well.yield_class,
                notes: `Depth to bedrock ${well.dtb_m}m`,
                rawTopZ: surfZ - well.dtb_m,
                baseX: x, baseZ: z,
                isWellRing: true,
                ...wellCoordMeta,
            };
            state.gsiWellGroup.add(dtbRing);
        }

        const yieldRadius = Math.max(30, Math.min(120, yieldM3d / 50));
        const ringGeom = new THREE.RingGeometry(Math.max(20, yieldRadius * 0.68), yieldRadius, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: markerColor, side: THREE.DoubleSide,
            transparent: true, opacity: isAghamoreSpring ? 0.55 : 0.4,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.userData = {
            type: 'gsi_well', id: well.id, name: well.name,
            wellType: well.type, depth: well.depth_m,
            dtb: well.dtb_m, water_strike: well.water_strike_m,
            yield_m3d: well.yield_m3d, yield_class: well.yield_class,
            notes: well.notes,
            rawTopZ: surfZ + 2, baseX: x, baseZ: z, isWellRing: true,
            ...wellCoordMeta,
        };
        state.gsiWellGroup.add(ring);

        if (isAghamoreSpring) {
            const pulseGeom = new THREE.RingGeometry(yieldRadius * 0.9, yieldRadius * 1.18, 32);
            const pulseMat = new THREE.MeshBasicMaterial({
                color: 0x58a6ff,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.22,
            });
            const pulseRing = new THREE.Mesh(pulseGeom, pulseMat);
            pulseRing.rotation.x = -Math.PI / 2;
            pulseRing.userData = {
                rawTopZ: surfZ + 4,
                baseX: x,
                baseZ: z,
                isWellRing: true,
                isPulseRing: true,
                pulseMinScale: 0.95,
                pulseMaxScale: 1.45,
                pulseOpacityBase: 0.14,
                pulseOpacityRange: 0.18,
                ...wellCoordMeta,
            };
            state.gsiWellGroup.add(pulseRing);
        }
    }
}

// Re-export all geo markers for backwards compatibility
export { buildGeotechSites, buildStructuralMeasurements, buildThermalCondMarkers,
    buildRegionalGeotechBoreholes,
    buildTempDepthMarkers, buildHeatFlowMarkers, buildKarstConnections,
    buildBedrockGeolMarkers, buildBedrockBhMarkers, buildBedrockBhUnverifiedMarkers,
    buildBedrockCrossSections, buildLandslideLocMarkers,
    buildMineralMarkers, buildHistoricalInvestigations, buildGeminiMarker } from './markers-geo.js';
