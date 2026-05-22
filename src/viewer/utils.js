// ── Coordinate transforms & helpers ──────────────────────────
import * as THREE from 'three';
import proj4 from 'proj4';
import { state } from './state.js';
import { BASE_CLAMP_BUFFER } from './config.js';

const EPSG4326 = 'EPSG:4326';
const EPSG2157 = 'EPSG:2157';

proj4.defs(EPSG2157, '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=0.99982 +x_0=600000 +y_0=750000 +ellps=GRS80 +units=m +no_defs');

export function itmToModel(itmX, itmY) {
    return { x: itmX - state.cx, z: -(itmY - state.cy) };
}

export function itmToWgs84(itmX, itmY) {
    const [lon, lat] = proj4(EPSG2157, EPSG4326, [itmX, itmY]);
    return { lon, lat };
}

export function wgs84ToModel(lon, lat) {
    const [itmX, itmY] = proj4(EPSG4326, EPSG2157, [lon, lat]);
    return { x: itmX - state.cx, z: -(itmY - state.cy) };
}

export function modelToItm(modelX, modelZ) {
    return { itmX: modelX + state.cx, itmY: -modelZ + state.cy };
}

export function modelToWgs84(modelX, modelZ) {
    const { itmX, itmY } = modelToItm(modelX, modelZ);
    return itmToWgs84(itmX, itmY);
}

export function getDesignFocusModel() {
    const boreholes = state.boreholeData || [];
    if (boreholes.length) {
        const sum = boreholes.reduce((acc, bh) => {
            acc.x += bh.x;
            acc.y += bh.y;
            return acc;
        }, { x: 0, y: 0 });
        return itmToModel(sum.x / boreholes.length, sum.y / boreholes.length);
    }
    const focus = state.projectConfig?.site?.car_park_location || state.metadata?.srsc_location;
    const itmX = focus?.itm_x ?? focus?.itm_x_approx;
    const itmY = focus?.itm_y ?? focus?.itm_y_approx;
    if (Number.isFinite(itmX) && Number.isFinite(itmY)) return itmToModel(itmX, itmY);
    return { x: 0, z: 0 };
}

export function modelExtentAccuracyNote(itmX, itmY) {
    const extent = state.metadata?.extent;
    if (!extent || !Number.isFinite(itmX) || !Number.isFinite(itmY)) return null;
    const inside = itmX >= extent.x_min && itmX <= extent.x_max
        && itmY >= extent.y_min && itmY <= extent.y_max;
    return inside ? null : 'regional point outside current SRSC model/satellite extent';
}

export function coordinateInfoForFeature(data) {
    if (!data) return null;

    if (Number.isFinite(data.itmX) && Number.isFinite(data.itmY)) {
        const wgs = Number.isFinite(data.lat) && Number.isFinite(data.lon)
            ? { lat: data.lat, lon: data.lon }
            : itmToWgs84(data.itmX, data.itmY);
        return {
            itmX: data.itmX,
            itmY: data.itmY,
            lat: wgs.lat,
            lon: wgs.lon,
            source: data.coordSource || 'feature coordinate',
            accuracy: data.coordAccuracy || null,
        };
    }

    const picked = data.pickedPoint;
    const usePicked = picked && (data.drapedSurface || !Number.isFinite(data.baseX) || !Number.isFinite(data.baseZ));
    const modelX = usePicked ? picked.x : data.baseX;
    const modelZ = usePicked ? picked.z : data.baseZ;
    if (!Number.isFinite(modelX) || !Number.isFinite(modelZ)) return null;

    const itm = modelToItm(modelX, modelZ);
    const wgs = itmToWgs84(itm.itmX, itm.itmY);
    return {
        itmX: itm.itmX,
        itmY: itm.itmY,
        lat: wgs.lat,
        lon: wgs.lon,
        source: data.coordSource || (picked ? 'clicked position' : 'feature coordinate'),
        accuracy: data.coordAccuracy || null,
    };
}

export function getClampBuffer() {
    return BASE_CLAMP_BUFFER;
}

// Apply consistent formation material settings for opacity changes
export function applyFormationOpacity(mat, opacity) {
    mat.opacity = opacity;
    mat.toneMapped = false;
    if (opacity < 1.0) {
        mat.transparent = true;
        mat.depthWrite = false;
        mat.side = THREE.DoubleSide;
    } else {
        mat.transparent = false;
        mat.depthWrite = true;
        mat.side = THREE.FrontSide;
    }
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 1;
    mat.polygonOffsetUnits = 1;
    mat.needsUpdate = true;
}

export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
