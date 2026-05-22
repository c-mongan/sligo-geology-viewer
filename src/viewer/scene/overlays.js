// ── Overlays module ─────────────────────────────────────
import * as THREE from 'three';
import { state } from '../state.js';
import { RENDER_ORDER } from '../config.js';
import { wgs84ToModel } from '../utils.js';

const OVERLAY_SURFACE_OFFSET_M = 1.5;
const NON_INFORMATIVE_SURFACE_CATS = new Set(['Water', 'Lake', 'Not mapped', 'Unknown', '0']);

function isNonInformativeSurfaceCat(cat) {
    return NON_INFORMATIVE_SURFACE_CATS.has(String(cat || '').trim());
}

function sampleTerrainAtItm(itmX, itmY) {
    const terrain = state.terrainData;
    if (!terrain?.elevations?.length) return null;
    const rows = terrain.resolution?.[0] || terrain.elevations.length;
    const cols = terrain.resolution?.[1] || terrain.elevations[0]?.length || 0;
    if (rows < 2 || cols < 2) return null;
    const u = (itmX - terrain.x_min) / (terrain.x_max - terrain.x_min);
    const v = (itmY - terrain.y_min) / (terrain.y_max - terrain.y_min);
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
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
    if (![e00, e10, e01, e11].every(Number.isFinite)) return null;
    const top = e00 * (1 - tx) + e10 * tx;
    const bottom = e01 * (1 - tx) + e11 * tx;
    return top * (1 - ty) + bottom * ty;
}

function makeOverlayMaterial(color, opacity = 0.22) {
    return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
    });
}

function drapeShapeGeometry(geom) {
    const pos = geom.attributes.position;
    const rawElev = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
        const localX = pos.getX(i);
        const localY = pos.getY(i);
        const itmX = localX + state.cx;
        const itmY = localY + state.cy;
        const elev = sampleTerrainAtItm(itmX, itmY) ?? 58;
        rawElev[i] = elev + OVERLAY_SURFACE_OFFSET_M;
        pos.setZ(i, rawElev[i] * state.currentVertExag);
    }
    pos.needsUpdate = true;
    geom.setAttribute('rawElev', new THREE.BufferAttribute(rawElev, 1));
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
}

function finalizeSurfaceOverlay(mesh, renderOrder = RENDER_ORDER.OVERLAY) {
    drapeShapeGeometry(mesh.geometry);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = renderOrder;
    mesh.userData.drapedSurface = true;
    return mesh;
}

// ── Generic polygon overlay builder (DRY: replaces 3 near-identical functions) ──
export function buildPolygonOverlay(data, group, colorMap, nameMap, surfZ, typeName, opts = {}) {
    if (!data || !data.length) return;
    for (const feat of data) {
        const color = colorMap[feat.cat] || 0x888888;
        if (opts.skipCat && opts.skipCat(feat.cat)) continue;
        for (const ring of feat.rings) {
            if (ring.length < 3) continue;
            const shape = new THREE.Shape();
            shape.moveTo(ring[0][0] - state.cx, ring[0][1] - state.cy);
            for (let i = 1; i < ring.length; i++) {
                shape.lineTo(ring[i][0] - state.cx, ring[i][1] - state.cy);
            }
            shape.closePath();
            const geom = new THREE.ShapeGeometry(shape);
            const mesh = finalizeSurfaceOverlay(new THREE.Mesh(geom, makeOverlayMaterial(color, opts.opacity ?? 0.18)), opts.renderOrder);
            mesh.userData = {
                type: typeName, cat: feat.cat,
                catName: nameMap ? (nameMap[feat.cat] || feat.desc || feat.cat) : feat.cat,
                rawTopZ: surfZ, baseX: 0, baseZ: 0,
                drapedSurface: true,
                coordSource: 'clicked position on processed ITM overlay',
            };
            group.add(mesh);
        }
    }
}

// ── Vulnerability overlay ─────────────────────────────
export function buildVulnerabilityOverlay() {
    buildPolygonOverlay(state.vulnData, state.vulnerabilityGroup, {
        'X': 0xd73027, 'E': 0xfc8d59, 'H': 0xfee08b,
        'M': 0x91cf60, 'L': 0x1a9850, 'Water': 0x4575b4,
    }, {
        'X': 'Rock at Surface / Karst', 'E': 'Extreme', 'H': 'High',
        'M': 'Moderate', 'L': 'Low', 'Water': 'Surface Water',
    }, 58, 'vulnerability', { renderOrder: RENDER_ORDER.OVERLAY, opacity: 0.16, skipCat: isNonInformativeSurfaceCat });
}

// ── Subsoil permeability overlay ──────────────────────
export function buildSubsoilOverlay() {
    buildPolygonOverlay(state.subsoilData, state.subsoilGroup, {
        'High': 0x2166ac, 'Moderate': 0x67a9cf, 'Low': 0xd1e5f0,
        'Not mapped': 0x444444, 'Water': 0x4575b4,
    }, null, 59, 'subsoil', { skipCat: isNonInformativeSurfaceCat });
}

// ── Aquifer classification overlay ────────────────────
export function buildAquiferOverlay() {
    buildPolygonOverlay(state.aquiferData, state.aquiferGroup, {
        'Rkc': 0x1a9850, 'Rk': 0x33a02c, 'Rf': 0x4daf4a,
        'Lk': 0x66bd63, 'Lm': 0xa6d96a, 'Ll': 0xd9ef8b,
        'Pl': 0xfee08b, 'Pu': 0xfdae61,
    }, {
        'Rkc': 'Regionally Important (Karstified Conduit)',
        'Rk': 'Regionally Important (Karstified)',
        'Rf': 'Regionally Important (Fissured)',
        'Lk': 'Locally Important (Karstified)',
        'Lm': 'Locally Important (Moderate)',
        'Ll': 'Locally Important (Local Zones)',
        'Pl': 'Poor (Local Zones)',
        'Pu': 'Poor (Unproductive)',
    }, 60, 'aquifer');
}

// ── GSHP suitability overlay (closed-loop, open-loop) ──
const GSHP_COLORS = {
    '5': 0x1a9850, // Dark green - Highly suitable
    '4': 0x66bd63, // Green - Suitable
    '3': 0xfee08b, // Yellow - Probably suitable
    '2': 0xfdae61, // Orange - Possibly unsuitable
    '1': 0xd73027, // Red - Generally unsuitable
    '6': 0x888888, // Grey - Made ground
    '0': 0x4575b4, // Blue - Water
};
const GSHP_NAMES = {
    '5': 'Highly Suitable',
    '4': 'Suitable',
    '3': 'Probably Suitable (assessment needed)',
    '2': 'Possibly Unsuitable (assessment needed)',
    '1': 'Generally Unsuitable',
    '6': 'Made Ground (desk study needed)',
    '0': 'Water',
};

export function buildGSHPOverlay(data, group, overlayType) {
    if (!data || !data.length) return;
    const surfZ = overlayType === 'gshp-closed' ? 61 : overlayType === 'gshp-open-dom' ? 62 : 63;
    for (const feat of data) {
        const color = GSHP_COLORS[feat.cat] || 0x888888;
        if (feat.cat === '0') continue; // Skip water
        for (const ring of feat.rings) {
            if (ring.length < 3) continue;
            const shape = new THREE.Shape();
            shape.moveTo(ring[0][0] - state.cx, ring[0][1] - state.cy);
            for (let i = 1; i < ring.length; i++) {
                shape.lineTo(ring[i][0] - state.cx, ring[i][1] - state.cy);
            }
            shape.closePath();
            const geom = new THREE.ShapeGeometry(shape);
            const mesh = finalizeSurfaceOverlay(new THREE.Mesh(geom, makeOverlayMaterial(color, 0.18)));
            mesh.userData = {
                type: overlayType, cat: feat.cat,
                catName: GSHP_NAMES[feat.cat] || feat.props?.desc || feat.cat,
                rawTopZ: surfZ,
                drapedSurface: true,
                coordSource: 'clicked position on processed ITM overlay',
            };
            group.add(mesh);
        }
    }
}

// ── Generic polygon overlay builder ──────────────────
const OVERLAY_CAT_COLORS = {
    // Quaternary sediments
    'TBGr': 0x8B7355, 'TNpSGPDCSs': 0xD2B48C, 'TDSs': 0xF5DEB3, 'A': 0x87CEEB,
    'BktGPDCSs': 0xCD853F, 'GLs': 0x556B2F, 'GLPSs': 0x6B8E23, 'TGPDCSs': 0xBDB76B,
    'KaRck': 0xA0522D, 'Cut': 0x808080, 'Lake': 0x4682B4, 'Made': 0x696969,
    'Rck': 0xBC8F8F, 'MarshFen': 0x2E8B57, 'TBs': 0xDAA520, 'KaGPDCSs': 0xB8860B,
    'GLTCSs': 0x9ACD32, 'TCSs': 0xF0E68C, 'Peat': 0x8B4513,
    // Hydrostratigraphic
    'PLss': 0xDEB887, 'KLss': 0x87CEEB, 'VLss': 0x98FB98, 'DLss': 0x6495ED,
    'BLss': 0xFFA07A, 'MLss': 0xF4A460, 'NaSs': 0xFFD700,
    // Landslide susceptibility
    'Low': 0x1a9850, 'Moderately Low': 0xa6d96a, 'Moderate': 0xfee08b,
    'Moderately High': 0xfdae61, 'High': 0xd73027,
    // EPA WFD groundwater status
    'Good': 0x2ca25f, 'Poor': 0xd73027,
};

export function buildGenericOverlay(data, group, overlayType, surfZ) {
    if (!data || !data.length) return;
    for (const feat of data) {
        const cat = feat.cat || 'Unknown';
        if (isNonInformativeSurfaceCat(cat)) continue;
        const color = OVERLAY_CAT_COLORS[cat] || hashColor(cat);
        for (const ring of feat.rings) {
            if (ring.length < 3) continue;
            const shape = new THREE.Shape();
            shape.moveTo(ring[0][0] - state.cx, ring[0][1] - state.cy);
            for (let i = 1; i < ring.length; i++) {
                shape.lineTo(ring[i][0] - state.cx, ring[i][1] - state.cy);
            }
            shape.closePath();
            const geom = new THREE.ShapeGeometry(shape);
            const mesh = finalizeSurfaceOverlay(new THREE.Mesh(geom, makeOverlayMaterial(color, 0.18)));
            mesh.userData = {
                type: overlayType, cat: cat,
                catName: feat.props?.desc || cat,
                rawTopZ: surfZ, baseX: 0, baseZ: 0,
                drapedSurface: true,
                coordSource: 'clicked position on processed ITM overlay',
            };
            group.add(mesh);
        }
    }
}

// Simple string hash -> color for unknown categories
export function hashColor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return (Math.abs(h) & 0xFFFFFF) | 0x404040;
}

// ── Groundwater Recharge overlay (GeoJSON FeatureCollection) ──────
export function buildRechargeOverlay() {
    if (!state.rechargeData || !state.rechargeData.features) return;
    const surfZ = 68;
    const RECHARGE_COLORS = {
        'Very High': 0x0571b0, 'High': 0x92c5de,
        'Moderate': 0xf7f7f7, 'Low': 0xfdb863, 'Very Low': 0xca0020,
    };
    for (const feat of state.rechargeData.features) {
        const props = feat.properties || {};
        const geom = feat.geometry;
        if (!geom || geom.type !== 'Polygon') continue;
        const rechargeVal = props.AVRCHMMYR || 0;
        let cat = 'Moderate';
        if (rechargeVal > 200) cat = 'Very High';
        else if (rechargeVal > 100) cat = 'High';
        else if (rechargeVal > 50) cat = 'Moderate';
        else if (rechargeVal > 20) cat = 'Low';
        else cat = 'Very Low';
        const color = RECHARGE_COLORS[cat] || 0xf7f7f7;
        for (const ring of geom.coordinates) {
            if (ring.length < 3) continue;
            const shape = new THREE.Shape();
            const first = wgs84ToModel(ring[0][0], ring[0][1]);
            shape.moveTo(first.x, -first.z);
            for (let i = 1; i < ring.length; i++) {
                const p = wgs84ToModel(ring[i][0], ring[i][1]);
                shape.lineTo(p.x, -p.z);
            }
            shape.closePath();
            const sGeom = new THREE.ShapeGeometry(shape);
            const mesh = finalizeSurfaceOverlay(new THREE.Mesh(sGeom, makeOverlayMaterial(color, 0.18)));
            mesh.userData = {
                type: 'recharge', cat,
                catName: cat,
                recharge_mm: rechargeVal,
                coefficient: props.RCHCOEFPCT,
                rawTopZ: surfZ, baseX: 0, baseZ: 0,
                drapedSurface: true,
                coordSource: 'clicked position on processed WGS84 recharge geometry',
            };
            state.rechargeGroup.add(mesh);
        }
    }
    state.rechargeGroup.visible = false;
}
