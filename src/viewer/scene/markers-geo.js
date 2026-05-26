// ── Geo markers module (split from markers.js) ─────────────
import * as THREE from 'three';
import { state } from '../state.js';
import { itmToModel, wgs84ToModel, modelToItm, modelExtentAccuracyNote } from '../utils.js';

function coordMetaFromItm(itmX, itmY, source = 'official ITM coordinate', accuracy = null) {
    return { itmX, itmY, coordSource: source, coordAccuracy: accuracy || modelExtentAccuracyNote(itmX, itmY) };
}

function coordMetaFromWgs84(lon, lat, source = 'official WGS84 geometry', accuracy = null) {
    const { x, z } = wgs84ToModel(lon, lat);
    const { itmX, itmY } = modelToItm(x, z);
    return { lon, lat, coordSource: source, coordAccuracy: accuracy || modelExtentAccuracyNote(itmX, itmY) };
}

function isInsideModelExtent(itmX, itmY) {
    const extent = state.metadata?.extent;
    if (!extent || !Number.isFinite(itmX) || !Number.isFinite(itmY)) return false;
    return itmX >= extent.x_min && itmX <= extent.x_max
        && itmY >= extent.y_min && itmY <= extent.y_max;
}

function isInsideModelPoint(modelX, modelZ) {
    const { itmX, itmY } = modelToItm(modelX, modelZ);
    return isInsideModelExtent(itmX, itmY);
}

function coLocationOffsets(records, radius = 20) {
    const grouped = new Map();
    for (let i = 0; i < records.length; i++) {
        const p = records[i];
        const key = `${Math.round(Number(p.x) * 10) / 10}:${Math.round(Number(p.y) * 10) / 10}`;
        const indexes = grouped.get(key) || [];
        indexes.push(i);
        grouped.set(key, indexes);
    }

    const offsets = new Map();
    for (const indexes of grouped.values()) {
        if (indexes.length < 2) continue;
        for (let n = 0; n < indexes.length; n++) {
            const angle = (Math.PI * 2 * n) / indexes.length;
            offsets.set(indexes[n], {
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
                count: indexes.length,
            });
        }
    }
    return offsets;
}

function surfaceZAtModel(modelX, modelZ, fallback = 55) {
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

function addSurfaceHalo(group, baseX, baseZ, rawTopZ, color, innerRadius, outerRadius, userData = {}, opacity = 0.24) {
    const haloGeom = new THREE.RingGeometry(innerRadius, outerRadius, 28);
    const haloMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity,
        depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.renderOrder = 84;
    halo.userData = {
        ...userData,
        rawTopZ,
        baseX,
        baseZ,
        isSurfaceHalo: true,
    };
    group.add(halo);
    return halo;
}

// ── Geotechnical investigation sites ──────────────────
export function buildGeotechSites() {
    if (!state.gsiData || !state.gsiData.geotechnical_boreholes) return;
    for (const gt of state.gsiData.geotechnical_boreholes) {
        const { x, z } = itmToModel(gt.itm_x, gt.itm_y);
        const surfZ = surfaceZAtModel(x, z, 55);

        const geom = new THREE.RingGeometry(28, 42, 4);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xd2a8ff, emissive: 0x553388, emissiveIntensity: 0.2,
            roughness: 0.4, transparent: true, opacity: 0.85,
            side: THREE.DoubleSide,
        });
        const marker = new THREE.Mesh(geom, mat);
        marker.rotation.x = -Math.PI / 2;
        marker.userData = {
            type: 'geotech', report: gt.report, project: gt.project,
            count: gt.count, depthRange: gt.depth_range,
            bedrockMet: gt.bedrock_met, pdfUrl: gt.pdf_url,
            rawTopZ: surfZ + 2, baseX: x, baseZ: z,
            ...coordMetaFromItm(gt.itm_x, gt.itm_y, 'processed GSI geotechnical coordinate'),
        };
        state.geotechGroup.add(marker);
        addSurfaceHalo(state.geotechGroup, x, z, surfZ + 1.5, 0xd2a8ff, 18, 50, marker.userData, 0.18);
    }
}

export function buildRegionalGeotechBoreholes() {
    if (!state.regionalGeotechBhData?.length) return;

    let rendered = 0;
    let hiddenOutsideExtent = 0;
    const visibleRecords = state.regionalGeotechBhData.filter(bh => {
        if (!Number.isFinite(bh.x) || !Number.isFinite(bh.y)) return false;
        if (!isInsideModelExtent(bh.x, bh.y)) {
            hiddenOutsideExtent++;
            return false;
        }
        return true;
    });

    for (const bh of visibleRecords) {
        const { x, z } = itmToModel(bh.x, bh.y);
        const surfZ = surfaceZAtModel(x, z, 55);
        const depth = Number(bh.DEPTH);
        const markerHeight = Math.max(8, Math.min(Number.isFinite(depth) ? depth : 8, 30));
        const geom = new THREE.CylinderGeometry(8, 8, markerHeight, 10);
        const mat = new THREE.MeshStandardMaterial({
            color: bh.BEDROCKMET === 'Y' ? 0xd2a8ff : 0x8b949e,
            emissive: 0x332244,
            emissiveIntensity: 0.18,
            roughness: 0.45,
            transparent: true,
            opacity: 0.78,
        });
        const marker = new THREE.Mesh(geom, mat);
        marker.userData = {
            type: 'geotech',
            report: bh.LOCID || 'GSI geotech borehole',
            project: bh.LABEL || 'GSI geotechnical borehole',
            count: 1,
            depthRange: Number.isFinite(depth) ? `${depth}m` : 'Unknown',
            bedrockMet: bh.BEDROCKMET || 'Unknown',
            confidenceNote: 'Official GSI historical borehole record; use as screening context',
            rawTopZ: surfZ + markerHeight / 2,
            baseX: x,
            baseZ: z,
            ...coordMetaFromItm(bh.x, bh.y, 'processed GSI geotechnical borehole coordinate'),
        };
        state.geotechGroup.add(marker);
        rendered++;
    }

    state.regionalGeotechRenderStats = {
        total: state.regionalGeotechBhData.length,
        rendered,
        hiddenOutsideExtent,
    };

    const note = document.getElementById('geotech-hidden-note');
    if (note && hiddenOutsideExtent) {
        note.textContent = `${hiddenOutsideExtent} outside model hidden`;
        note.title = `${hiddenOutsideExtent} regional geotechnical borehole records are retained in data but hidden from the 3D model view because they fall outside the current SRSC extent.`;
    }
}

// ── Structural measurements (dip/strike) ─────────────
export function buildStructuralMeasurements() {
    if (!state.gsiData || !state.gsiData.structural_measurements) return;
    for (const sm of state.gsiData.structural_measurements) {
        const { x, z } = itmToModel(sm.itm_x, sm.itm_y);
        const surfZ = surfaceZAtModel(x, z, 58) + 2;

        // Strike line
        const strikeRad = (sm.strike_deg - 90) * Math.PI / 180;
        const len = 200;
        const dx = Math.cos(strikeRad) * len;
        const dz = Math.sin(strikeRad) * len;

        const points = [
            new THREE.Vector3(x - dx, surfZ, z - dz),
            new THREE.Vector3(x + dx, surfZ, z + dz),
        ];
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0xffa657, linewidth: 2 });
        const line = new THREE.Line(geom, mat);
        line.userData = {
            type: 'structural', strike: sm.strike_deg, dip: sm.dip_deg,
            rawY: [surfZ, surfZ], baseX: x, baseZ: z,
            ...coordMetaFromItm(sm.itm_x, sm.itm_y, 'processed GSI structural coordinate'),
        };
        state.structuralGroup.add(line);

        // Dip tick (perpendicular to strike)
        const dipRad = strikeRad + Math.PI / 2;
        const dipLen = 80 + sm.dip_deg * 3;
        const tipX = x + Math.cos(dipRad) * dipLen;
        const tipZ = z + Math.sin(dipRad) * dipLen;
        const dipPts = [
            new THREE.Vector3(x, surfZ, z),
            new THREE.Vector3(tipX, surfZ, tipZ),
        ];
        const dGeom = new THREE.BufferGeometry().setFromPoints(dipPts);
        const dMat = new THREE.LineBasicMaterial({ color: 0xffa657 });
        const dLine = new THREE.Line(dGeom, dMat);
        dLine.userData = { rawY: [surfZ, surfZ], isStrikeHelper: true };
        state.structuralGroup.add(dLine);

        // Small sphere at measurement point
        const sg = new THREE.SphereGeometry(10, 8, 8);
        const sm2 = new THREE.MeshBasicMaterial({ color: 0xffa657, transparent: true, opacity: 0.8 });
        const s = new THREE.Mesh(sg, sm2);
        s.userData = {
            type: 'structural', strike: sm.strike_deg, dip: sm.dip_deg,
            rawTopZ: surfZ, baseX: x, baseZ: z,
            ...coordMetaFromItm(sm.itm_x, sm.itm_y, 'processed GSI structural coordinate'),
        };
        state.structuralGroup.add(s);
    }
    state.structuralGroup.visible = false; // off by default
}

// ── Thermal conductivity point markers ───────────────
export function buildThermalCondMarkers() {
    if (!state.thermalCondData || !state.thermalCondData.length) return;
    const visibleRecords = state.thermalCondData.filter(pt => isInsideModelExtent(pt.x, pt.y));
    const visualOffsets = coLocationOffsets(visibleRecords, 24);
    for (let i = 0; i < visibleRecords.length; i++) {
        const pt = visibleRecords[i];
        const conductivity = pt.TCONAVWMK || 0;
        // Color: blue (low, <2) -> yellow (mid, 2-3) -> red (high, >3)
        const t = Math.max(0, Math.min(1, (conductivity - 1) / 3));
        const r = Math.round(t < 0.5 ? t * 2 * 255 : 255);
        const g = Math.round(t < 0.5 ? 128 + t * 254 : 255 - (t - 0.5) * 2 * 200);
        const b = Math.round(t < 0.5 ? 255 - t * 2 * 200 : 55);
        const color = (r << 16) | (g << 8) | b;

        const size = 12 + conductivity * 3;
        const geom = new THREE.SphereGeometry(size, 16, 10);
        const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.18,
            roughness: 0.35,
        });
        const mesh = new THREE.Mesh(geom, mat);

        const { x: modelX, z: modelZ } = itmToModel(pt.x, pt.y);
        const offset = visualOffsets.get(i) || { x: 0, z: 0, count: 1 };
        const visualX = modelX + offset.x;
        const visualZ = modelZ + offset.z;
        const surfZ = surfaceZAtModel(visualX, visualZ, 65);
        mesh.position.set(visualX, (surfZ + 10) * state.currentVertExag, visualZ);
        mesh.userData = {
            type: 'thermal_cond',
            conductivity: conductivity,
            name: pt.BH_NAME || 'Unknown',
            topDepth: pt.TOPDEPTHM,
            baseDepth: pt.BASEDEPTHM,
            source: pt.DATASOURCE,
            measurements: pt.NOCONDMEAS,
            rawTopZ: surfZ + 10, baseX: visualX, baseZ: visualZ,
            visualOffsetM: offset.count > 1 ? Math.round(Math.hypot(offset.x, offset.z)) : null,
            ...coordMetaFromItm(pt.x, pt.y, 'processed GSI thermal conductivity coordinate'),
        };
        state.thermalCondGroup.add(mesh);
        addSurfaceHalo(state.thermalCondGroup, visualX, visualZ, surfZ + 2, color, size + 4, size + 16, mesh.userData, 0.2);
    }
}

// ── Temperature at depth point markers ───────────────
export function buildTempDepthMarkers() {
    if (!state.tempDepthData || !state.tempDepthData.length) return;
    for (const pt of state.tempDepthData) {
        if (!isInsideModelExtent(pt.x, pt.y)) continue;
        const temp = pt.TEMP_RCK_C || 0;
        const depth = pt.DEPTH_M || 100;
        const gradient = pt.TMPGRADCAL || pt.TMPGRADREC || 0;

        // Color by temperature: cool blue -> hot red
        const t = Math.max(0, Math.min(1, (temp - 10) / 60));
        const r = Math.round(60 + t * 195);
        const g = Math.round(100 + (1 - t) * 100);
        const b = Math.round(220 - t * 180);
        const color = (r << 16) | (g << 8) | b;

        // Vertical cylinder representing the measurement depth
        const height = Math.min(depth, 500) * 0.12;
        const geom = new THREE.CylinderGeometry(11, 11, height, 10);
        const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.84 });
        const mesh = new THREE.Mesh(geom, mat);

        const { x: modelX, z: modelZ } = itmToModel(pt.x, pt.y);
        const surfZ = surfaceZAtModel(modelX, modelZ, 65);
        mesh.position.set(modelX, (surfZ - height / 2) * state.currentVertExag, modelZ);
        mesh.userData = {
            type: 'temp_depth',
            temperature: temp,
            depth: depth,
            gradient: gradient,
            name: pt.BH_NAME || 'Unknown',
            observationType: pt.OBSERVETYP,
            surfaceTemp: pt.SFTMP_DEGC,
            rawTopZ: surfZ, rawHeight: height, baseX: modelX, baseZ: modelZ,
            ...coordMetaFromItm(pt.x, pt.y, 'processed GSI temperature coordinate'),
        };
        state.tempDepthGroup.add(mesh);
        addSurfaceHalo(state.tempDepthGroup, modelX, modelZ, surfZ + 1.2, color, 13, 28, mesh.userData, 0.22);
    }
}

// ── Heat flow point marker (DIAS) ──────
export function buildHeatFlowMarkers() {
    if (!state.heatFlowData || !state.heatFlowData.length) return;
    for (const pt of state.heatFlowData) {
        if (!isInsideModelExtent(pt.x, pt.y)) continue;
        const { x: mx, z: mz } = itmToModel(pt.x, pt.y);
        const surfZ = surfaceZAtModel(mx, mz, 70);
        const diamondGeom = new THREE.OctahedronGeometry(25, 0);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff66ff, transparent: true, opacity: 0.9 });
        const marker = new THREE.Mesh(diamondGeom, mat);
        marker.position.set(mx, (surfZ + 14) * state.currentVertExag, mz);
        marker.userData = {
            type: 'heat_flow',
            heatFlow_mW: pt.HEATFLOWMW,
            correction: pt.HF_CORRECT,
            error: pt.HF_ERROR,
            topDepth: pt.TOPDEPTHM,
            baseDepth: pt.BASEDEPTHM,
            rawTopZ: surfZ + 14, baseX: mx, baseZ: mz,
            ...coordMetaFromItm(pt.x, pt.y, 'processed GSI/DIAS heat-flow coordinate'),
        };
        state.heatFlowGroup.add(marker);
        addSurfaceHalo(state.heatFlowGroup, mx, mz, surfZ + 2, 0xff66ff, 20, 34, marker.userData, 0.2);
    }
}

// ── Karst connections (dye trace lines) ──────
export function buildKarstConnections() {
    if (!state.karstConnData || !state.karstConnData.features) return;
    for (const feat of state.karstConnData.features) {
        const geom = feat.geometry;
        if (!geom || geom.type !== 'LineString') continue;
        const points = [];
        for (const coord of geom.coordinates) {
            const { x: mx, z: mz } = wgs84ToModel(coord[0], coord[1]);
            const surfZ = surfaceZAtModel(mx, mz, 65) + 2;
            points.push(new THREE.Vector3(mx, surfZ * state.currentVertExag, mz));
        }
        if (points.length < 2) continue;
        const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x00ffcc, linewidth: 2, transparent: true, opacity: 0.8,
        });
        const line = new THREE.Line(lineGeom, lineMat);
        line.userData = {
            type: 'karst_connection',
            input: feat.properties?.INPUT_SITE,
            output: feat.properties?.OUTPUTSITE,
            coordSource: 'clicked position on GSI karst connection geometry',
            rawY: new Float32Array(points.map(p => p.y / state.currentVertExag)),
        };
        state.karstConnGroup.add(line);
    }
}

// ── Bedrock geology (strike/dip) point markers ──────
export function buildBedrockGeolMarkers() {
    if (!state.bedrockGeolData || !state.bedrockGeolData.length) return;
    for (const pt of state.bedrockGeolData) {
        if (!isInsideModelExtent(pt.x, pt.y)) continue;
        const strike = pt.STRIKE || 0;
        const dip = pt.DIP || 0;
        const { x: modelX, z: modelZ } = itmToModel(pt.x, pt.y);
        const surfZ = surfaceZAtModel(modelX, modelZ, 68) + 2;
        // Strike/dip symbol: flat disc with a directional line
        const discGeom = new THREE.CircleGeometry(100, 16);
        const discMat = new THREE.MeshBasicMaterial({
            color: 0xffa657, transparent: true, opacity: 0.7,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const disc = new THREE.Mesh(discGeom, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(modelX, surfZ * state.currentVertExag, modelZ);
        // Add strike direction line
        const lineLen = 120;
        const rad = (strike * Math.PI) / 180;
        const pts = [
            new THREE.Vector3(-Math.sin(rad) * lineLen, 2, -Math.cos(rad) * lineLen),
            new THREE.Vector3(Math.sin(rad) * lineLen, 2, Math.cos(rad) * lineLen),
        ];
        const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
        const line = new THREE.Line(lineGeom, lineMat);
        line.position.copy(disc.position);
        disc.userData = {
            type: 'bedrock_geol', strike, dip,
            desc: pt.DESCRIPT || '',
            rawTopZ: surfZ, baseX: modelX, baseZ: modelZ,
            ...coordMetaFromItm(pt.x, pt.y, 'processed GSI bedrock structural coordinate'),
        };
        line.userData = disc.userData;
        state.bedrockGeolGroup.add(disc);
        state.bedrockGeolGroup.add(line);
        addSurfaceHalo(state.bedrockGeolGroup, modelX, modelZ, surfZ + 0.8, 0xffa657, 32, 52, disc.userData, 0.16);
    }
}

// ── Verified bedrock borehole markers ───────────────
export function buildBedrockBhMarkers() {
    if (!state.bedrockBhData || !state.bedrockBhData.length) return;
    for (const pt of state.bedrockBhData) {
        if (!isInsideModelExtent(pt.x, pt.y)) continue;
        const { x: modelX, z: modelZ } = itmToModel(pt.x, pt.y);
        const depth = pt.LENGTH_M || 50;
        const height = Math.min(depth, 300) * 0.5;
        const surfZ = surfaceZAtModel(modelX, modelZ, 70);
        const geom = new THREE.CylinderGeometry(14, 14, height, 10);
        const mat = new THREE.MeshBasicMaterial({ color: 0x7ee787, transparent: true, opacity: 0.84 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(modelX, (surfZ - height / 2) * state.currentVertExag, modelZ);
        mesh.userData = {
            type: 'bedrock_bh',
            name: pt.HOLE_ID || 'Unknown',
            depth: depth,
            county: pt.COUNTY,
            comments: pt.COMMENTS,
            logUrl: pt.LOG_URL,
            rawTopZ: surfZ, rawHeight: height, baseX: modelX, baseZ: modelZ,
            ...coordMetaFromItm(pt.x, pt.y, 'processed GSI verified borehole coordinate'),
        };
        state.bedrockBhGroup.add(mesh);
        addSurfaceHalo(state.bedrockBhGroup, modelX, modelZ, surfZ + 1.5, 0x7ee787, 15, 30, mesh.userData, 0.24);
    }
}

// ── Unverified bedrock borehole markers ─────────────
export function buildBedrockBhUnverifiedMarkers() {
    if (!state.bedrockBhUnverifiedData || !state.bedrockBhUnverifiedData.length) return;
    const visibleRecords = state.bedrockBhUnverifiedData.filter(pt => isInsideModelExtent(pt.x, pt.y));
    const visualOffsets = coLocationOffsets(visibleRecords, 18);
    for (let i = 0; i < visibleRecords.length; i++) {
        const pt = visibleRecords[i];
        const { x: modelX, z: modelZ } = itmToModel(pt.x, pt.y);
        const offset = visualOffsets.get(i) || { x: 0, z: 0, count: 1 };
        const visualX = modelX + offset.x;
        const visualZ = modelZ + offset.z;
        const depth = Number(pt.LENGTH_M) || 30;
        const height = Math.max(10, Math.min(depth, 250) * 0.35);
        const surfZ = surfaceZAtModel(visualX, visualZ, 70);
        const geom = new THREE.CylinderGeometry(10, 10, height, 10);
        const mat = new THREE.MeshBasicMaterial({ color: 0xd29922, transparent: true, opacity: 0.78 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(visualX, (surfZ - height / 2) * state.currentVertExag, visualZ);
        mesh.userData = {
            type: 'bedrock_bh_unverified',
            name: pt.HOLE_ID || 'Unverified borehole',
            depth,
            rockhead: pt.ROCKHEAD_M,
            county: pt.COUNTY,
            company: pt.COMPANY,
            year: pt.YEAR,
            lithTop: pt.LITH_TOP,
            lithBase: pt.LITH_BASE,
            stratBase: pt.STRAT_BASE,
            comments: pt.COMMENTS,
            confidenceNote: pt.CONFIDENCE_NOTE,
            rawTopZ: surfZ, rawHeight: height, baseX: visualX, baseZ: visualZ,
            visualOffsetM: offset.count > 1 ? Math.round(Math.hypot(offset.x, offset.z)) : null,
            ...coordMetaFromItm(pt.x, pt.y, 'GSI unverified bedrock borehole coordinate', 'unverified source record'),
        };
        state.bedrockBhUnverifiedGroup.add(mesh);
        addSurfaceHalo(state.bedrockBhUnverifiedGroup, visualX, visualZ, surfZ + 1.5, 0xd29922, 11, 24, mesh.userData, 0.2);

        if (Number.isFinite(Number(pt.ROCKHEAD_M))) {
            const ringGeom = new THREE.RingGeometry(12, 20, 16);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xe3b341,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.62,
            });
            const ring = new THREE.Mesh(ringGeom, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(visualX, (surfZ - Number(pt.ROCKHEAD_M)) * state.currentVertExag, visualZ);
            ring.userData = {
                type: 'bedrock_bh_unverified',
                name: `${pt.HOLE_ID || 'Unverified borehole'} rockhead`,
                depth,
                rockhead: pt.ROCKHEAD_M,
                confidenceNote: pt.CONFIDENCE_NOTE,
                rawTopZ: surfZ - Number(pt.ROCKHEAD_M), baseX: visualX, baseZ: visualZ,
                visualOffsetM: offset.count > 1 ? Math.round(Math.hypot(offset.x, offset.z)) : null,
                ...coordMetaFromItm(pt.x, pt.y, 'GSI unverified bedrock borehole coordinate', 'unverified source record'),
            };
            state.bedrockBhUnverifiedGroup.add(ring);
        }
    }
}

// ── GSI bedrock cross-section line ───────────────────
export function buildBedrockCrossSections() {
    const features = state.bedrockCrossSectionData?.features || [];
    for (const feat of features) {
        const geom = feat.geometry;
        if (!geom || geom.type !== 'LineString') continue;
        const props = feat.properties || {};
        const points = [];
        const rawY = [];
        for (const coord of geom.coordinates) {
            const { x, z } = itmToModel(coord[0], coord[1]);
            const y = surfaceZAtModel(x, z, 74) + 8;
            points.push(new THREE.Vector3(x, y * state.currentVertExag, z));
            rawY.push(y);
        }
        if (points.length < 2) continue;
        const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xf778ba, transparent: true, opacity: 0.92 });
        const line = new THREE.Line(lineGeom, lineMat);
        line.userData = {
            type: 'bedrock_cross_section',
            name: props.NAME || props.XSECTNAME || 'GSI cross-section',
            sectionId: props.XSECTNAME,
            sheet: props.SHEETNO,
            lengthM: props.LENGTH,
            pdfUrl: props.URL,
            rawY,
            coordSource: 'GSI bedrock cross-section line geometry',
        };
        state.bedrockCrossSectionGroup.add(line);
    }
}

// ── Landslide location point markers ────────────────
export function buildLandslideLocMarkers() {
    if (!state.landslideLocsData || !state.landslideLocsData.length) return;
    for (const pt of state.landslideLocsData) {
        if (!isInsideModelExtent(pt.x, pt.y)) continue;
        const { x: modelX, z: modelZ } = itmToModel(pt.x, pt.y);
        const surfZ = surfaceZAtModel(modelX, modelZ, 75);
        const geom = new THREE.ConeGeometry(26, 38, 3);
        const mat = new THREE.MeshBasicMaterial({ color: 0xf85149, transparent: true, opacity: 0.95 });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(modelX, (surfZ + 18) * state.currentVertExag, modelZ);
        mesh.userData = {
            type: 'landslide_loc',
            name: pt.EVENT_NAME || 'Unnamed',
            date: pt.EVENT_DATE,
            status: pt.STATUS,
            comment: pt.EVENT_COMMENT,
            length: pt.TOTAL_SLIDE_LENGTH_M,
            shape: pt.LANDSLIDE_SHAPE,
            rawTopZ: surfZ + 18, baseX: modelX, baseZ: modelZ,
            ...coordMetaFromItm(pt.x, pt.y, 'processed GSI landslide coordinate'),
        };
        state.landslideLocsGroup.add(mesh);
        addSurfaceHalo(state.landslideLocsGroup, modelX, modelZ, surfZ + 2, 0xf85149, 22, 38, mesh.userData, 0.22);
    }
}

// ── Mineral occurrence point markers ────────────────
export function buildMineralMarkers() {
    if (!state.mineralsData || !state.mineralsData.length) return;
    const MINERAL_COLORS = {
        'Metal': 0xFFD700, 'Industrial': 0x87CEEB,
        'Mineral': 0xDDA0DD, 'Quarry': 0xA0522D,
    };
    const visibleRecords = state.mineralsData.filter(pt => isInsideModelExtent(pt.x, pt.y));
    const count = visibleRecords.length;
    if (!count) return;
    const geom = new THREE.OctahedronGeometry(21, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const instMesh = new THREE.InstancedMesh(geom, mat, count);
    instMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    const instanceUserData = [];
    const visualOffsets = coLocationOffsets(visibleRecords, 24);

    for (let i = 0; i < count; i++) {
        const pt = visibleRecords[i];
        const { x: modelX, z: modelZ } = itmToModel(pt.x, pt.y);
        const offset = visualOffsets.get(i) || { x: 0, z: 0, count: 1 };
        const visualX = modelX + offset.x;
        const visualZ = modelZ + offset.z;
        const minType = pt.MIN_TYPE || 'Unknown';
        const color = MINERAL_COLORS[minType] || 0xDDA0DD;
        const surfZ = surfaceZAtModel(visualX, visualZ, 70);

        dummy.position.set(visualX, (surfZ + 16) * state.currentVertExag, visualZ);
        dummy.updateMatrix();
        instMesh.setMatrixAt(i, dummy.matrix);

        tmpColor.setHex(color);
        instMesh.instanceColor.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);

        instanceUserData.push({
            type: 'mineral',
            minType: minType,
            mineral: pt.MINERAL || '',
            townland: pt.TOWNLAND || '',
            desc: pt.DESCRIPTIO || '',
            notes: pt.NOTES1 || '',
            rawTopZ: surfZ + 16, baseX: visualX, baseZ: visualZ,
            visualOffsetM: offset.count > 1 ? Math.round(Math.hypot(offset.x, offset.z)) : null,
            ...coordMetaFromItm(pt.x, pt.y, 'processed GSI mineral coordinate'),
        });
    }

    instMesh.instanceMatrix.needsUpdate = true;
    instMesh.instanceColor.needsUpdate = true;
    instMesh.userData = { type: 'mineral_instanced', instances: instanceUserData };
    state.mineralsGroup.add(instMesh);
}

// ── Historical IGSL Investigations ─────────────────
export function buildHistoricalInvestigations() {
    if (!state.histInvData || !state.histInvData.features) return;
    for (const feat of state.histInvData.features) {
        const geom = feat.geometry;
        if (!geom || geom.type !== 'Point') continue;
        const props = feat.properties || {};
        const { x, z } = wgs84ToModel(geom.coordinates[0], geom.coordinates[1]);
        if (!isInsideModelPoint(x, z)) continue;
        const surfZ = surfaceZAtModel(x, z, 55);

        const cylGeom = new THREE.CylinderGeometry(18, 18, 6, 12);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xb8860b, emissive: 0x6b4c00, emissiveIntensity: 0.2,
            roughness: 0.5, transparent: true, opacity: 0.85,
        });
        const marker = new THREE.Mesh(cylGeom, mat);
        marker.userData = {
            type: 'hist_inv',
            name: props.name || 'Unknown',
            source: props.source || '',
            bedrockDepth: props.bedrock_depth_m,
            bedrockType: props.bedrock_type || '',
            gwLevel: props.gw_level_m,
            invType: props.investigation_type || '',
            date: props.date || '',
            rawTopZ: surfZ + 3, rawHeight: 6, baseX: x, baseZ: z,
            ...coordMetaFromWgs84(geom.coordinates[0], geom.coordinates[1], 'processed GSI investigation centroid'),
        };
        state.histInvGroup.add(marker);
        addSurfaceHalo(state.histInvGroup, x, z, surfZ + 1.5, 0xb8860b, 16, 31, marker.userData, 0.2);
    }
}

// ── GEMINI Project Site Marker ─────────────────────
export function buildGeminiMarker() {
    const boreholes = state.boreholeData || [];
    const focusItm = boreholes.length
        ? {
            x: boreholes.reduce((sum, bh) => sum + bh.x, 0) / boreholes.length,
            y: boreholes.reduce((sum, bh) => sum + bh.y, 0) / boreholes.length,
        }
        : {
            x: state.metadata.srsc_location.itm_x,
            y: state.metadata.srsc_location.itm_y,
        };
    const { x, z } = itmToModel(focusItm.x, focusItm.y);
    const surfZ = surfaceZAtModel(x, z, 52);
    // Low-profile design marker. Keep it precise against imagery instead of
    // using a large floating diamond that obscures the site.
    const geom = new THREE.RingGeometry(34, 44, 24);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x3fb950, emissive: 0x1a6b2a, emissiveIntensity: 0.4,
        roughness: 0.35, metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
    });
    const marker = new THREE.Mesh(geom, mat);
    marker.rotation.x = -Math.PI / 2;
    marker.userData = {
        type: 'gemini_site',
        name: 'Sligo Regional Sports Centre',
        desc: 'GEMINI Pilot Site',
        boreholes: '48 BHE boreholes, 10m spacing',
        heatPump: '350 kW heat pump',
        lead: 'Lead: CODEMA (15 partners)',
        rawTopZ: surfZ + 2, baseX: x, baseZ: z,
        ...coordMetaFromItm(
            focusItm.x,
            focusItm.y,
            'BHE carpark/design-array focus coordinate',
            'user-selected planning focus',
        ),
    };
    state.geminiMarkerGroup.add(marker);
    addSurfaceHalo(state.geminiMarkerGroup, x, z, surfZ + 1.5, 0x3fb950, 48, 68, marker.userData, 0.16);
}
