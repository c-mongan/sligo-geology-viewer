// ── Data loading ─────────────────────────────────────────────
import { state } from './state.js';

// ── Inline data helpers ──────────────────────────────────────

function legacyInlineDataId(relativePath) {
    return relativePath.replace(/^\.\.\/json\//, '').replace(/\.json$/, '');
}

function genericInlineDataId(relativePath) {
    return relativePath
        .replace(/^\.\.\//, '')
        .replace(/[\\/]/g, '__')
        .replace(/\.json$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
}

function findInlineJSONElement(relativePath, extraInlineIds = []) {
    const ids = [
        ...extraInlineIds,
        legacyInlineDataId(relativePath),
        genericInlineDataId(relativePath),
    ];
    for (const id of ids) {
        if (!id) continue;
        const el = document.getElementById('inline-data-' + id);
        if (el) return el;
    }
    return null;
}

// Robust JSON loader: fetch() for HTTP, XMLHttpRequest for file://, inline data fallback
export function loadJSON(relativePath, extraInlineIds = []) {
    // Check for inline embedded data first (self-contained build)
    const inlineEl = findInlineJSONElement(relativePath, extraInlineIds);
    if (inlineEl) {
        return Promise.resolve(JSON.parse(inlineEl.textContent));
    }

    // Detect protocol locally (no outer-scope dependency)
    const isFileProtocol = window.location.protocol === 'file:';

    // For HTTP(S), use standard fetch
    if (!isFileProtocol) {
        return fetch(relativePath).then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' loading ' + relativePath);
            const ct = r.headers.get('content-type') || '';
            // Accept json content-type OR .json/.geojson file extensions (handles text/plain from some servers)
            const isJsonExt = /\.(geo)?json(\?|$)/i.test(relativePath);
            if (!ct.includes('json') && !isJsonExt) {
                throw new Error('Expected JSON but got ' + ct + ' loading ' + relativePath);
            }
            return r.json();
        });
    }

    // For file:// protocol, use async XMLHttpRequest
    return new Promise((resolve, reject) => {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', relativePath, true); // async
            xhr.onload = () => {
                if (xhr.status === 0 || xhr.status === 200) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (parseErr) {
                        reject(parseErr);
                    }
                } else {
                    reject(new Error('XHR status ' + xhr.status + ' loading ' + relativePath));
                }
            };
            xhr.onerror = () => reject(new Error('XHR network error loading ' + relativePath));
            xhr.send(null);
        } catch (xhrErr) {
            reject(xhrErr);
        }
    });
}

// ── LazyLoader: deduplicated, cached JSON loader ────────────
export class LazyLoader {
    constructor() {
        this._cache = new Map();   // url → data
        this._pending = new Map(); // url → Promise
    }
    async load(url, extraInlineIds = []) {
        if (this._cache.has(url)) return this._cache.get(url);
        if (this._pending.has(url)) return this._pending.get(url);
        const p = loadJSON(url, extraInlineIds).then(data => {
            this._cache.set(url, data);
            this._pending.delete(url);
            return data;
        }).catch(err => {
            this._pending.delete(url);
            throw err;
        });
        this._pending.set(url, p);
        return p;
    }
    has(url) { return this._cache.has(url); }
    get(url) { return this._cache.get(url); }
    evict(url) { this._cache.delete(url); }
}

export const lazyLoader = new LazyLoader();

// ── Dispose / lazy-layer helpers ─────────────────────────────

export function handleDisposeTimer(layerId, group, isOn) {
    if (isOn) {
        if (state._disposeTimers.has(layerId)) {
            clearTimeout(state._disposeTimers.get(layerId));
            state._disposeTimers.delete(layerId);
        }
    } else {
        const timer = setTimeout(() => {
            disposeGroupGeometry(group);
            state._lazyBuilt.delete(layerId);
            state._disposeTimers.delete(layerId);
        }, 60000);
        state._disposeTimers.set(layerId, timer);
    }
}

export function disposeGroupGeometry(group) {
    group.traverse(child => {
        if (child.geometry) { child.geometry.dispose(); }
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });
    group.clear();
}

// ── Lazy-layer registry ──────────────────────────────────────
// Returns static config maps: { surfaceOverlays, toggleLayers }.
// Each entry has { url, group } (references into state).
// The caller is responsible for wiring assign/build callbacks.

export function registerLazyLayers() {
    const surfaceOverlays = {
        'vulnerability':  { url: '../json/vulnerability_overlay.json',                        group: state.vulnerabilityGroup,  dataKey: 'vulnData' },
        'subsoil':        { url: '../json/subsoil_overlay.json',                              group: state.subsoilGroup,        dataKey: 'subsoilData' },
        'aquifer':        { url: '../json/aquifer_overlay.json',                               group: state.aquiferGroup,        dataKey: 'aquiferData' },
        'gshp-closed':    { url: '../json/geothermal_closed_loop_overlay.json',               group: state.gshpClosedGroup,     dataKey: 'gshpClosedData' },
        'gshp-open-dom':  { url: '../json/geothermal_open_loop_domestic_overlay.json',        group: state.gshpOpenDomGroup,    dataKey: 'gshpOpenDomData' },
        'gshp-open-com':  { url: '../json/geothermal_open_loop_commercial_overlay.json',      group: state.gshpOpenComGroup,    dataKey: 'gshpOpenComData' },
        'quaternary':     { url: '../json/quaternary_sediments_overlay.json',                  group: state.quaternaryGroup,     dataKey: 'quaternaryData' },
        'hydrostrat':     { url: '../json/hydrostratigraphic_overlay.json',                    group: state.hydrostratGroup,     dataKey: 'hydrostratData' },
        'landslide-susc': { url: '../json/landslide_susceptibility_overlay.json',             group: state.landslideSuscGroup,  dataKey: 'landslideSuscData' },
        'geoheritage':    { url: '../json/geoheritage_overlay.json',                           group: state.geoheritageGroup,    dataKey: 'geoheritageData' },
        'recharge':       { url: '../json/groundwater_recharge.geojson',                       group: state.rechargeGroup,       dataKey: 'rechargeData' },
        'source-protection': { url: '../json/source_protection_overlay.json',                  group: state.sourceProtectionGroup, dataKey: 'sourceProtectionData' },
        'epa-gw-status':   { url: '../json/epa_groundwater_status_overlay.json',                group: state.epaGwStatusGroup,    dataKey: 'epaGwStatusData' },
    };
    const toggleLayers = {
        'tog-thermal-cond':   { url: '../json/geothermal_thermal_conductivity_points.json',   group: state.thermalCondGroup,    dataKey: 'thermalCondData' },
        'tog-temp-depth':     { url: '../json/geothermal_temperature_points.json',             group: state.tempDepthGroup,      dataKey: 'tempDepthData' },
        'tog-heat-flow':      { url: '../json/geothermal_heat_flow_points.json',               group: state.heatFlowGroup,       dataKey: 'heatFlowData' },
        'tog-bedrock-geol':   { url: '../json/bedrock_geology_points.json',                    group: state.bedrockGeolGroup,    dataKey: 'bedrockGeolData' },
        'tog-bedrock-bh':     { url: '../json/bedrock_boreholes_points.json',                  group: state.bedrockBhGroup,      dataKey: 'bedrockBhData' },
        'tog-bedrock-bh-unverified': { url: '../json/bedrock_boreholes_unverified_points.json', group: state.bedrockBhUnverifiedGroup, dataKey: 'bedrockBhUnverifiedData' },
        'tog-bedrock-cross-sections': { url: '../json/bedrock_cross_sections.geojson',          group: state.bedrockCrossSectionGroup, dataKey: 'bedrockCrossSectionData' },
        'tog-landslide-locs': { url: '../json/landslide_locations_points.json',                group: state.landslideLocsGroup,  dataKey: 'landslideLocsData' },
        'tog-minerals':       { url: '../json/minerals_points.json',                           group: state.mineralsGroup,       dataKey: 'mineralsData' },
        'tog-hist-inv':       { url: '../json/historical_investigations.json',                 group: state.histInvGroup,        dataKey: 'histInvData' },
    };
    return { surfaceOverlays, toggleLayers };
}
