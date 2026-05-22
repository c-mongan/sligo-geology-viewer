// ── Terrain module ──────────────────────────────────────
import * as THREE from 'three';
import { state } from '../state.js';
import { BASE_CLAMP_BUFFER, RENDER_ORDER } from '../config.js';
import { itmToWgs84, modelToItm } from '../utils.js';
import { applyVerticalTransform } from './formations.js';

const SAT_RAW_Z = 55; // fallback if no terrain
const SATELLITE_SURFACE_OFFSET_M = 0.35;
// Optional: pass ?mapbox_token=... to enable Mapbox Terrain-RGB elevation tiles.
const MAPBOX_TOKEN = (new URLSearchParams(window.location.search)).get('mapbox_token')
    || '';
const TERRAIN_DEBUG = (new URLSearchParams(window.location.search)).has('terrain_debug');

// ── Internal helpers ────────────────────────────────

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

async function loadTilesBatched(tiles, batchSize, label) {
    const results = [];
    for (let i = 0; i < tiles.length; i += batchSize) {
        const batch = tiles.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(batch.map(t => t.fn()));
        results.push(...batchResults);
        const pct = Math.min(100, Math.round((i + batch.length) / tiles.length * 100));
        const satStatus = document.getElementById('sat-status');
        if (satStatus) satStatus.textContent = (label || '') + pct + '%';
    }
    return results;
}

// Tile coordinate helpers
function lon2tile(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
function lat2tile(lat, z) {
    const n = Math.pow(2, z);
    return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
}
function lon2tileFloat(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
function lat2tileFloat(lat, z) {
    const n = Math.pow(2, z);
    return (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
}
function tile2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
function tile2lat(y, z) {
    const r = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(r) - Math.exp(-r)));
}
function tilePixelUv(lon, lat, z, xMin, yMin, cols, rows) {
    return {
        u: (lon2tileFloat(lon, z) - xMin) / cols,
        v: (lat2tileFloat(lat, z) - yMin) / rows,
    };
}

function decodeTerrainRgb(imgData, width, x, y) {
    const idx = (y * width + x) * 4;
    const r = imgData[idx];
    const g = imgData[idx + 1];
    const b = imgData[idx + 2];
    return -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

function updateTerrainClipElevation(maxElevation) {
    if (!Number.isFinite(maxElevation)) return;
    state.terrainClipElevation = maxElevation + BASE_CLAMP_BUFFER;
    if (state.terrainClipPlane) {
        state.terrainClipPlane.constant = state.terrainClipElevation * state.currentVertExag;
    }
}

function sampleTerrainHeightmapAtItm(itmX, itmY) {
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

    const south = e00 * (1 - tx) + e10 * tx;
    const north = e01 * (1 - tx) + e11 * tx;
    return south * (1 - ty) + north * ty;
}

function sampleTerrainHeightmapAtModel(modelX, modelZ) {
    const { itmX, itmY } = modelToItm(modelX, modelZ);
    return sampleTerrainHeightmapAtItm(itmX, itmY);
}

function clampFormationMeshesToTerrain(sampleTerrainElev, label) {
    let clampCount = 0;
    for (const mesh of state.formationGroup.children) {
        const rawY = mesh.userData.rawY;
        if (!rawY) continue;
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < rawY.length; i++) {
            const mx = pos.array[i * 3];
            const mz = pos.array[i * 3 + 2];
            const terrainElev = sampleTerrainElev(mx, mz);
            if (Number.isFinite(terrainElev) && rawY[i] > terrainElev - BASE_CLAMP_BUFFER) {
                rawY[i] = terrainElev - BASE_CLAMP_BUFFER;
                clampCount++;
            }
        }
    }
    if (clampCount > 0) {
        if (TERRAIN_DEBUG) console.debug(`${label}: adjusted ${clampCount} formation vertices (${BASE_CLAMP_BUFFER}m buffer below terrain)`);
        applyVerticalTransform();
    }
}

/**
 * Load satellite imagery (ArcGIS) + terrain elevation (Mapbox),
 * build the terrain mesh, and clamp formations to terrain surface.
 */
export async function loadSatelliteImagery() {
    const extentCorners = [
        itmToWgs84(state.metadata.extent.x_min, state.metadata.extent.y_min),
        itmToWgs84(state.metadata.extent.x_min, state.metadata.extent.y_max),
        itmToWgs84(state.metadata.extent.x_max, state.metadata.extent.y_min),
        itmToWgs84(state.metadata.extent.x_max, state.metadata.extent.y_max),
    ];
    const south = Math.min(...extentCorners.map(c => c.lat));
    const north = Math.max(...extentCorners.map(c => c.lat));
    const west = Math.min(...extentCorners.map(c => c.lon));
    const east = Math.max(...extentCorners.map(c => c.lon));

    // ── Step 1: Load satellite imagery (ArcGIS, zoom 15) ──
    const satZoom = 15;
    const satXMin = lon2tile(west, satZoom), satXMax = lon2tile(east, satZoom);
    const satYMin = lat2tile(north, satZoom), satYMax = lat2tile(south, satZoom);
    const satCols = satXMax - satXMin + 1, satRows = satYMax - satYMin + 1;
    if (TERRAIN_DEBUG) console.debug(`Satellite: ${satCols * satRows} tiles at zoom ${satZoom}`);

    const satCanvas = document.createElement('canvas');
    satCanvas.width = satCols * 256;
    satCanvas.height = satRows * 256;
    const satCtx = satCanvas.getContext('2d');
    satCtx.fillStyle = '#1a2030';
    satCtx.fillRect(0, 0, satCanvas.width, satCanvas.height);

    const satTiles = [];
    for (let ty = satYMin; ty <= satYMax; ty++) {
        for (let tx = satXMin; tx <= satXMax; tx++) {
            const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${satZoom}/${ty}/${tx}`;
            const px = (tx - satXMin) * 256, py = (ty - satYMin) * 256;
            satTiles.push({ fn: () => loadImage(url).then(img => satCtx.drawImage(img, px, py, 256, 256)) });
        }
    }
    await loadTilesBatched(satTiles, 30, 'Sat ');

    const texture = new THREE.CanvasTexture(satCanvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = state.renderer.capabilities.getMaxAnisotropy();
    texture.generateMipmaps = true;

    // ── Step 2: Load terrain elevation (Mapbox Terrain-RGB, zoom 13) ──
    let terrainData = null;
    if (TERRAIN_DEBUG) console.debug('Mapbox terrain token configured:', !!MAPBOX_TOKEN);
    if (MAPBOX_TOKEN && MAPBOX_TOKEN !== 'YOUR_TOKEN_HERE') {
        try {
            const tZoom = 13;
            const tXMin = lon2tile(west, tZoom), tXMax = lon2tile(east, tZoom);
            const tYMin = lat2tile(north, tZoom), tYMax = lat2tile(south, tZoom);
            const tCols = tXMax - tXMin + 1, tRows = tYMax - tYMin + 1;
            if (TERRAIN_DEBUG) console.debug(`Terrain: ${tCols * tRows} tiles at zoom ${tZoom}`);

            const tCanvas = document.createElement('canvas');
            tCanvas.width = tCols * 256;
            tCanvas.height = tRows * 256;
            const tCtx = tCanvas.getContext('2d');

            const tTiles = [];
            for (let ty = tYMin; ty <= tYMax; ty++) {
                for (let tx = tXMin; tx <= tXMax; tx++) {
                    const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${tZoom}/${tx}/${ty}.pngraw?access_token=${MAPBOX_TOKEN}`;
                    const px = (tx - tXMin) * 256, py = (ty - tYMin) * 256;
                    tTiles.push({ fn: () => loadImage(url).then(img => tCtx.drawImage(img, px, py)) });
                }
            }
            await loadTilesBatched(tTiles, 10, 'Terrain ');

            // Decode RGB → elevation
            const imgData = tCtx.getImageData(0, 0, tCanvas.width, tCanvas.height).data;
            terrainData = {
                imgData,
                width: tCanvas.width,
                height: tCanvas.height,
                zoom: tZoom,
                xMin: tXMin,
                yMin: tYMin,
                cols: tCols,
                rows: tRows,
                west: tile2lon(tXMin, tZoom),
                east: tile2lon(tXMax + 1, tZoom),
                north: tile2lat(tYMin, tZoom),
                south: tile2lat(tYMax + 1, tZoom),
            };
            if (TERRAIN_DEBUG) console.debug(`Terrain decoded: ${tCanvas.width}x${tCanvas.height}px, bounds: ${terrainData.south.toFixed(3)}-${terrainData.north.toFixed(3)}N`);
        } catch (e) {
            console.warn('Terrain loading failed, using flat surface:', e);
        }
    }

    // ── Step 3: Build terrain mesh ──
    const modelW = state.metadata.extent.x_max - state.metadata.extent.x_min;
    const modelD = state.metadata.extent.y_max - state.metadata.extent.y_min;
    const hasLocalTerrain = !!state.terrainData?.elevations?.length;
    const segments = terrainData || hasLocalTerrain ? 511 : 4;

    const geom = new THREE.PlaneGeometry(modelW, modelD, segments, segments);

    const uvs = geom.attributes.uv;
    for (let i = 0; i < uvs.count; i++) {
        const px = geom.attributes.position.getX(i);
        const py = geom.attributes.position.getY(i);
        const { lon, lat } = itmToWgs84(px + state.cx, py + state.cy);
        const { u, v } = tilePixelUv(lon, lat, satZoom, satXMin, satYMin, satCols, satRows);
        // CanvasTexture is uploaded with a bottom-left UV origin; tile rows are top-down.
        uvs.setXY(i, u, 1 - v);
    }
    uvs.needsUpdate = true;

    // Displace vertices with real terrain elevation
    const positions = geom.attributes.position;
    const rawElevations = new Float32Array(positions.count);

    if (terrainData || hasLocalTerrain) {
        for (let i = 0; i < positions.count; i++) {
            const px = positions.getX(i); // model X
            const py = positions.getY(i); // plane Y → after rotation becomes -model_Z

            // Convert to ITM (px = itm_x - cx, py = itm_y - cy after rotation mapping)
            const itm_x = px + state.cx;
            const itm_y = py + state.cy;

            const { lon, lat } = itmToWgs84(itm_x, itm_y);

            let elev = null;
            if (terrainData) {
                const { u: tu, v: tv } = tilePixelUv(lon, lat, terrainData.zoom, terrainData.xMin, terrainData.yMin, terrainData.cols, terrainData.rows);
                const tpx = Math.min(Math.max(Math.round(tu * (terrainData.width - 1)), 0), terrainData.width - 1);
                const tpy = Math.min(Math.max(Math.round(tv * (terrainData.height - 1)), 0), terrainData.height - 1);
                elev = decodeTerrainRgb(terrainData.imgData, terrainData.width, tpx, tpy);
            } else if (hasLocalTerrain) {
                elev = sampleTerrainHeightmapAtItm(itm_x, itm_y);
            }
            if (!Number.isFinite(elev)) elev = SAT_RAW_Z;

            rawElevations[i] = elev + SATELLITE_SURFACE_OFFSET_M;
            positions.setZ(i, rawElevations[i] * state.currentVertExag);
        }
        positions.needsUpdate = true;
        geom.computeVertexNormals();
        geom.computeBoundsTree?.();
        let eMin = Infinity, eMax = -Infinity;
        for (let i = 0; i < rawElevations.length; i++) {
            if (rawElevations[i] < eMin) eMin = rawElevations[i];
            if (rawElevations[i] > eMax) eMax = rawElevations[i];
        }
        updateTerrainClipElevation(eMax);
        if (TERRAIN_DEBUG) console.debug(`Terrain mesh: ${positions.count} vertices, elev range: ${eMin.toFixed(0)}-${eMax.toFixed(0)}m`);
    } else {
        rawElevations.fill(SAT_RAW_Z);
        for (let i = 0; i < positions.count; i++) {
            positions.setZ(i, SAT_RAW_Z * state.currentVertExag);
        }
        positions.needsUpdate = true;
        geom.computeBoundsTree?.();
    }

    // Start satellite nearly opaque so the real above-ground map remains
    // readable when subsurface geology is enabled by default.
    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.FrontSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: true,
    });

    state.satellitePlane = new THREE.Mesh(geom, mat);
    state.satellitePlane.rotation.x = -Math.PI / 2;
    state.satellitePlane.renderOrder = RENDER_ORDER.SATELLITE;
    state.satellitePlane.userData.rawElevations = rawElevations;
    state.satellitePlane.userData.isTerrainMesh = !!terrainData || hasLocalTerrain;
    state.satelliteGroup.add(state.satellitePlane);
    // Avoid drawing the local DEM fallback under the satellite-draped terrain.
    state.terrainGroup.visible = false;

    // ── Step 4: Clamp formations to terrain surface ──
    if (terrainData) {
        function sampleTerrainElev(modelX, modelZ) {
            const { itmX: itm_x, itmY: itm_y } = modelToItm(modelX, modelZ);
            const { lon, lat } = itmToWgs84(itm_x, itm_y);
            // lat/lon → terrain pixel
            const { u: tu, v: tv } = tilePixelUv(lon, lat, terrainData.zoom, terrainData.xMin, terrainData.yMin, terrainData.cols, terrainData.rows);
            if (tu < 0 || tu > 1 || tv < 0 || tv > 1) return null;
            const tpx = Math.min(Math.max(Math.round(tu * (terrainData.width - 1)), 0), terrainData.width - 1);
            const tpy = Math.min(Math.max(Math.round(tv * (terrainData.height - 1)), 0), terrainData.height - 1);
            return decodeTerrainRgb(terrainData.imgData, terrainData.width, tpx, tpy);
        }
        clampFormationMeshesToTerrain(sampleTerrainElev, 'Terrain clamp');
    } else if (hasLocalTerrain) {
        clampFormationMeshesToTerrain(sampleTerrainHeightmapAtModel, 'Local terrain clamp');
    } else {
        // No terrain heightmap — clamp everything below SAT_RAW_Z fallback
        const fallbackMax = SAT_RAW_Z - 5;
        let clampCount = 0;
        for (const mesh of state.formationGroup.children) {
            const rawY = mesh.userData.rawY;
            if (!rawY) continue;
            for (let i = 0; i < rawY.length; i++) {
                if (rawY[i] > fallbackMax) {
                    rawY[i] = fallbackMax;
                    clampCount++;
                }
            }
        }
        if (clampCount > 0) {
            if (TERRAIN_DEBUG) console.debug(`Fallback clamp: adjusted ${clampCount} vertices to z<${fallbackMax}`);
            applyVerticalTransform();
        }
    }
}

/**
 * Build SRTM terrain surface mesh from pre-loaded terrain data.
 */
export function buildTerrain() {
    if (!state.terrainData) return;
    const rows = state.terrainData.resolution[0];
    const cols = state.terrainData.resolution[1];
    const elevations = state.terrainData.elevations;
    const xMin = state.terrainData.x_min;
    const xMax = state.terrainData.x_max;
    const yMin = state.terrainData.y_min;
    const yMax = state.terrainData.y_max;
    const dx = (xMax - xMin) / (cols - 1);
    const dy = (yMax - yMin) / (rows - 1);

    // Find elevation range for color mapping
    let elMin = Infinity, elMax = -Infinity;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const e = elevations[r][c];
            if (e < elMin) elMin = e;
            if (e > elMax) elMax = e;
        }
    }
    const elRange = elMax - elMin || 1;

    // Create geometry: PlaneGeometry with cols x rows segments
    const geom = new THREE.PlaneGeometry(
        xMax - xMin, yMax - yMin,
        cols - 1, rows - 1
    );

    // PlaneGeometry vertices are laid out row-major, top-to-bottom
    // (row 0 = +Y in plane coords = north), left-to-right
    // We need: row 0 of our data = y_min (south), row N-1 = y_max (north)
    const pos = geom.attributes.position;
    const rawElev = new Float32Array(pos.count);
    const colors = new Float32Array(pos.count * 3);

    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            // PlaneGeometry: vertex index = planeRow * cols + i
            // planeRow 0 = north (+Y), planeRow N-1 = south (-Y)
            // Our data: row 0 = south (y_min), row N-1 = north (y_max)
            const planeRow = (rows - 1) - j; // flip so our south row maps to plane's south
            const idx = planeRow * cols + i;

            const elev = elevations[j][i];
            rawElev[idx] = elev;

            // X in model coords: ITM x - cx
            const itmX = xMin + i * dx;
            const itmY = yMin + j * dy;
            pos.setX(idx, itmX - state.cx);
            pos.setZ(idx, -(itmY - state.cy)); // Z = -(ITM_Y - cy) per model convention
            pos.setY(idx, elev * state.currentVertExag);

            // Elevation color: green (low) -> brown (mid) -> grey (high)
            const t = (elev - elMin) / elRange;
            let r, g, b;
            if (t < 0.15) {
                // Deep green (valleys, near sea level)
                r = 0.18 + t * 1.2;
                g = 0.40 + t * 1.5;
                b = 0.15 + t * 0.5;
            } else if (t < 0.4) {
                // Light green to olive
                const s = (t - 0.15) / 0.25;
                r = 0.36 + s * 0.25;
                g = 0.58 - s * 0.08;
                b = 0.22 - s * 0.05;
            } else if (t < 0.65) {
                // Olive to brown
                const s = (t - 0.4) / 0.25;
                r = 0.61 + s * 0.15;
                g = 0.50 - s * 0.10;
                b = 0.17 + s * 0.05;
            } else if (t < 0.85) {
                // Brown to grey
                const s = (t - 0.65) / 0.2;
                r = 0.76 - s * 0.10;
                g = 0.40 + s * 0.15;
                b = 0.22 + s * 0.25;
            } else {
                // Grey to light grey (peaks)
                const s = (t - 0.85) / 0.15;
                r = 0.66 + s * 0.15;
                g = 0.55 + s * 0.18;
                b = 0.47 + s * 0.20;
            }
            colors[idx * 3] = r;
            colors[idx * 3 + 1] = g;
            colors[idx * 3 + 2] = b;
        }
    }

    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    geom.computeBoundsTree?.();

    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        roughness: 0.85,
        metalness: 0.0,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: 4,
        polygonOffsetUnits: 4,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = RENDER_ORDER.TERRAIN;
    mesh.userData.isTerrainSurface = true;
    mesh.userData.rawElev = rawElev;
    state.terrainGroup.add(mesh);
    updateTerrainClipElevation(elMax);
    clampFormationMeshesToTerrain(sampleTerrainHeightmapAtModel, 'Local terrain clamp');
}
