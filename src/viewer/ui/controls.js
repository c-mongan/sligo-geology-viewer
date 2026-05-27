import { state } from '../state.js';
import { OVERLAY_LEGENDS } from '../config.js';
import { trackEvent } from '../analytics.js';
import { lazyLoader, registerLazyLayers, handleDisposeTimer } from '../loader.js';
import { applyFormationOpacity, getDesignFocusModel } from '../utils.js';
import { updateVerticalExaggeration, updateExplode, buildDepthSlice, updateClipping } from '../scene/formations.js';
import { buildKarstConnections, buildThermalCondMarkers, buildTempDepthMarkers,
    buildHeatFlowMarkers, buildBedrockGeolMarkers, buildBedrockBhMarkers,
    buildBedrockBhUnverifiedMarkers, buildBedrockCrossSections,
    buildLandslideLocMarkers, buildMineralMarkers, buildHistoricalInvestigations } from '../scene/markers.js';
import { buildVulnerabilityOverlay, buildSubsoilOverlay, buildAquiferOverlay,
    buildGSHPOverlay, buildGenericOverlay, buildRechargeOverlay } from '../scene/overlays.js';
import { closeSubsurfacePanel, openSubsurfacePanel } from './subsurface-panel.js';

// Cached raycast targets — invalidated when layer visibility changes
let _raycastTargetsCache = null;
let _raycastCacheVersion = 0;
let _previousOverlay = 'none';

export function invalidateRaycastCache() {
    _raycastCacheVersion++;
    _raycastTargetsCache = null;
}

export function getRaycastTargetsCache() {
    return _raycastTargetsCache;
}

export function setRaycastTargetsCache(val) {
    _raycastTargetsCache = val;
}

export function setSubsurfaceGeologyVisible(visible) {
    state.formationGroup.visible = visible;
    invalidateRaycastCache();
}

export function setDesignBheDepthVisible(visible) {
    for (const obj of state.boreholeGroup.children) {
        if (obj.userData.type === 'borehole_instanced' || obj.userData.isBHContact) {
            obj.visible = visible;
        }
    }
    invalidateRaycastCache();
}

function renderOverlayLegend(mode) {
    const overlayLegend = document.getElementById('overlay-legend');
    const legendTitle = document.getElementById('legend-title');
    const legendItems = document.getElementById('legend-items');

    const config = OVERLAY_LEGENDS[mode];
    if (!config) {
        overlayLegend.style.display = 'none';
        return;
    }

    legendTitle.textContent = config.title;
    legendItems.textContent = '';
    for (const [color, labelText] of config.items) {
        const row = document.createElement('div');
        row.className = 'legend-item';

        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch';
        swatch.style.backgroundColor = color;

        const label = document.createElement('span');
        label.textContent = labelText;

        row.append(swatch, label);
        legendItems.appendChild(row);
    }
    overlayLegend.style.display = 'block';
    trackEvent('overlay_legend_viewed', { overlay_type: mode });
}

// Surface overlay builder mapping (mode → build function)
const OVERLAY_BUILDERS = {
    'vulnerability': () => buildVulnerabilityOverlay(),
    'subsoil': () => buildSubsoilOverlay(),
    'aquifer': () => buildAquiferOverlay(),
    'gshp-closed': () => buildGSHPOverlay(state.gshpClosedData, state.gshpClosedGroup, 'gshp-closed'),
    'gshp-open-dom': () => buildGSHPOverlay(state.gshpOpenDomData, state.gshpOpenDomGroup, 'gshp-open-dom'),
    'gshp-open-com': () => buildGSHPOverlay(state.gshpOpenComData, state.gshpOpenComGroup, 'gshp-open-com'),
    'quaternary': () => buildGenericOverlay(state.quaternaryData, state.quaternaryGroup, 'quaternary', 64),
    'hydrostrat': () => buildGenericOverlay(state.hydrostratData, state.hydrostratGroup, 'hydrostrat', 65),
    'landslide-susc': () => buildGenericOverlay(state.landslideSuscData, state.landslideSuscGroup, 'landslide-susc', 66),
    'geoheritage': () => buildGenericOverlay(state.geoheritageData, state.geoheritageGroup, 'geoheritage', 67),
    'recharge': () => buildRechargeOverlay(),
    'source-protection': () => buildGenericOverlay(state.sourceProtectionData, state.sourceProtectionGroup, 'source_protection', 69),
    'epa-gw-status': () => buildGenericOverlay(state.epaGwStatusData, state.epaGwStatusGroup, 'epa_gw_status', 70),
};

// Toggle layer builder mapping (toggle ID → build function)
const TOGGLE_BUILDERS = {
    'tog-thermal-cond': () => buildThermalCondMarkers(),
    'tog-temp-depth': () => buildTempDepthMarkers(),
    'tog-heat-flow': () => buildHeatFlowMarkers(),
    'tog-bedrock-geol': () => buildBedrockGeolMarkers(),
    'tog-bedrock-bh': () => buildBedrockBhMarkers(),
    'tog-bedrock-bh-unverified': () => buildBedrockBhUnverifiedMarkers(),
    'tog-bedrock-cross-sections': () => buildBedrockCrossSections(),
    'tog-landslide-locs': () => buildLandslideLocMarkers(),
    'tog-minerals': () => buildMineralMarkers(),
    'tog-hist-inv': () => buildHistoricalInvestigations(),
};

function setLayerLoading(input, loading, errorText = '') {
    const row = input?.closest('.toggle-row');
    if (!row) return;
    row.classList.toggle('layer-loading', loading);
    row.classList.toggle('layer-error', Boolean(errorText));
    row.querySelector('.layer-load-note')?.remove();
    if (errorText) {
        const note = document.createElement('span');
        note.className = 'layer-load-note';
        note.textContent = errorText;
        row.appendChild(note);
    }
    input.disabled = loading;
}

export async function setSurfaceOverlay(mode) {
    // Hide all overlay groups first
    state.vulnerabilityGroup.visible = false;
    state.subsoilGroup.visible = false;
    state.aquiferGroup.visible = false;
    state.gshpClosedGroup.visible = false;
    state.gshpOpenDomGroup.visible = false;
    state.gshpOpenComGroup.visible = false;
    state.quaternaryGroup.visible = false;
    state.hydrostratGroup.visible = false;
    state.landslideSuscGroup.visible = false;
    state.geoheritageGroup.visible = false;
    state.rechargeGroup.visible = false;
    state.sourceProtectionGroup.visible = false;
    state.epaGwStatusGroup.visible = false;

    if (mode === 'none') {
        invalidateRaycastCache();
        renderOverlayLegend(mode);
        return;
    }

    const { surfaceOverlays } = registerLazyLayers();
    const config = surfaceOverlays[mode];
    if (!config) { invalidateRaycastCache(); renderOverlayLegend(mode); return; }

    if (!state._lazyBuilt.has(mode)) {
        const radio = document.getElementById('tog-' + mode);
        const label = radio?.parentElement;
        const spinner = document.createElement('span');
        spinner.className = 'layer-spinner';
        if (label) label.appendChild(spinner);
        setLayerLoading(radio, true);

        try {
            const data = await lazyLoader.load(config.url);
            state[config.dataKey] = data;
            if (OVERLAY_BUILDERS[mode]) OVERLAY_BUILDERS[mode]();
            state._lazyBuilt.add(mode);
            setLayerLoading(radio, false);
        } catch (e) {
            console.warn('Failed to load overlay:', mode, e);
            setLayerLoading(radio, false, 'Unavailable');
            trackEvent('data_load_failed', { file_name: config.url, error: String(e) });
        } finally {
            spinner.remove();
        }
    }

    config.group.visible = true;
    invalidateRaycastCache();
    renderOverlayLegend(mode);
}

function trackToggle(id, group, layer) {
    const { toggleLayers } = registerLazyLayers();
    const lazyConfig = toggleLayers[id];

    document.getElementById(id).addEventListener('change', async (e) => {
        if (e.target.checked && lazyConfig && !state._lazyBuilt.has(id)) {
            const label = e.target.parentElement;
            const spinner = document.createElement('span');
            spinner.className = 'layer-spinner';
            if (label) label.appendChild(spinner);
            setLayerLoading(e.target, true);

            try {
                const data = await lazyLoader.load(lazyConfig.url);
                state[lazyConfig.dataKey] = data;
                if (TOGGLE_BUILDERS[id]) TOGGLE_BUILDERS[id]();
                state._lazyBuilt.add(id);
                setLayerLoading(e.target, false);
            } catch (err) {
                console.warn('Failed to load layer:', id, err);
                setLayerLoading(e.target, false, 'Unavailable');
                e.target.checked = false;
                trackEvent('data_load_failed', { file_name: lazyConfig.url, error: String(err) });
            } finally {
                spinner.remove();
            }
        }

        group.visible = e.target.checked;
        invalidateRaycastCache();

        // Dispose timer: free GPU memory if layer off for 60s
        if (lazyConfig) handleDisposeTimer(id, group, e.target.checked);

        trackEvent('layer_toggled', { layer, enabled: e.target.checked });
    });
}

function setCheckbox(id, checked) {
    const input = document.getElementById(id);
    if (!input || input.checked === checked) return;
    input.checked = checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function syncSurfaceGroups() {
    const terrainOn = document.getElementById('tog-terrain')?.checked ?? true;
    const satelliteOn = document.getElementById('tog-satellite')?.checked ?? true;
    state.satelliteGroup.visible = satelliteOn;
    state.terrainGroup.visible = terrainOn && !satelliteOn;
    invalidateRaycastCache();
}

async function applyDrillingRiskView() {
    setCheckbox('tog-terrain', true);
    setCheckbox('tog-boreholes', true);
    setCheckbox('tog-proposed-site', true);
    setCheckbox('tog-geology-surfaces', false);
    setDesignBheDepthVisible(false);
    setCheckbox('tog-srsc-col', false);
    setCheckbox('tog-srsc', true);
    setCheckbox('tog-satellite', true);
    setCheckbox('tog-faults', false);
    setCheckbox('tog-karst', true);
    setCheckbox('tog-dyetraces', true);
    setCheckbox('tog-gsi-wells', true);
    setCheckbox('tog-geotech', true);
    setCheckbox('tog-structural', true);
    setCheckbox('tog-bedrock-bh-unverified', true);
    setCheckbox('tog-bedrock-cross-sections', true);
    setCheckbox('tog-thermal-cond', false);
    setCheckbox('tog-temp-depth', false);
    setCheckbox('tog-heat-flow', false);

    const aquiferRadio = document.getElementById('tog-aquifer');
    if (aquiferRadio) {
        aquiferRadio.checked = true;
        await setSurfaceOverlay('aquifer');
        _previousOverlay = 'aquifer';
    }

    const fmOpacity = document.getElementById('fm-opacity');
    const faultOpacity = document.getElementById('fault-opacity');
    const satOpacity = document.getElementById('sat-opacity');
    if (fmOpacity) {
        fmOpacity.value = '55';
        fmOpacity.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (faultOpacity) {
        faultOpacity.value = '55';
        faultOpacity.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (satOpacity) {
        satOpacity.value = '70';
        satOpacity.dispatchEvent(new Event('input', { bubbles: true }));
    }

    trackEvent('drilling_risk_view_applied');
}

function setActiveMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
}

function isCompactViewport() {
    return window.matchMedia?.('(max-width: 700px)').matches || window.innerWidth <= 700;
}

function setRangeValue(id, value) {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clearSubsurfaceLabTools() {
    setCheckbox('tog-depthslice', false);
    setCheckbox('tog-clip', false);
    setCheckbox('tog-clip-ns', false);
    closeSubsurfacePanel();
    const label = document.getElementById('section-label');
    if (label) label.style.display = 'none';
}

function openDataProvenancePanel() {
    const panel = document.getElementById('provenance-panel');
    if (panel?.classList.contains('open')) return;
    document.getElementById('btn-provenance')?.click();
}

async function applyViewerMode(mode) {
    setActiveMode(mode);
    if (mode !== 'subsurface-lab') clearSubsurfaceLabTools();
    if (mode === 'overview') {
        setCheckbox('tog-terrain', true);
        setCheckbox('tog-satellite', true);
        setCheckbox('tog-boreholes', true);
        setCheckbox('tog-proposed-site', true);
        setCheckbox('tog-srsc', true);
        setCheckbox('tog-geology-surfaces', false);
        setCheckbox('tog-faults', false);
        setDesignBheDepthVisible(false);
        setCheckbox('tog-srsc-col', false);
        document.getElementById('tog-overlay-none').checked = true;
        await setSurfaceOverlay('none');

        const fmOpacity = document.getElementById('fm-opacity');
        const terrainOpacity = document.getElementById('terrain-opacity');
        const satOpacity = document.getElementById('sat-opacity');
        if (fmOpacity) {
            fmOpacity.value = '62';
            fmOpacity.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (terrainOpacity) {
            terrainOpacity.value = '90';
            terrainOpacity.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (satOpacity) {
            satOpacity.value = '90';
            satOpacity.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } else if (mode === 'risk') {
        await applyDrillingRiskView();
    } else if (mode === 'proposed') {
        setCheckbox('tog-terrain', true);
        setCheckbox('tog-satellite', true);
        setCheckbox('tog-boreholes', true);
        setCheckbox('tog-proposed-site', true);
        setCheckbox('tog-srsc', true);
        setCheckbox('tog-geology-surfaces', true);
        setCheckbox('tog-faults', false);
        setDesignBheDepthVisible(true);
        setCheckbox('tog-srsc-col', false);
        setCheckbox('tog-karst', true);
        setCheckbox('tog-dyetraces', false);
        document.getElementById('tog-overlay-none').checked = true;
        await setSurfaceOverlay('none');

        const compact = isCompactViewport();
        setRangeValue('fm-opacity', compact ? 58 : 82);
        setRangeValue('terrain-opacity', compact ? 22 : 34);
        setRangeValue('sat-opacity', compact ? 34 : 48);

        const f = getDesignFocusModel();
        state.camera.position.set(f.x + 760, 980, f.z + 1040);
        state.controls.target.set(f.x, -180, f.z);
        state.controls.update();
    } else if (mode === 'subsurface') {
        setCheckbox('tog-terrain', true);
        setCheckbox('tog-satellite', true);
        setCheckbox('tog-boreholes', true);
        setCheckbox('tog-proposed-site', true);
        setCheckbox('tog-srsc', true);
        setCheckbox('tog-geology-surfaces', true);
        setCheckbox('tog-faults', true);
        setDesignBheDepthVisible(true);
        setCheckbox('tog-srsc-col', true);
        setCheckbox('tog-karst', true);
        setCheckbox('tog-dyetraces', true);
        document.getElementById('tog-overlay-none').checked = true;
        await setSurfaceOverlay('none');
        const compact = isCompactViewport();
        setRangeValue('fm-opacity', compact ? 62 : 95);
        setRangeValue('terrain-opacity', compact ? 18 : 25);
        setRangeValue('sat-opacity', compact ? 32 : 45);
    } else if (mode === 'subsurface-lab') {
        setCheckbox('tog-terrain', true);
        setCheckbox('tog-satellite', true);
        setCheckbox('tog-boreholes', true);
        setCheckbox('tog-proposed-site', true);
        setCheckbox('tog-srsc', true);
        setCheckbox('tog-geology-surfaces', true);
        setCheckbox('tog-faults', true);
        setDesignBheDepthVisible(true);
        setCheckbox('tog-srsc-col', true);
        setCheckbox('tog-karst', true);
        setCheckbox('tog-dyetraces', true);
        setCheckbox('tog-gsi-wells', true);
        setCheckbox('tog-geotech', true);
        document.getElementById('tog-overlay-none').checked = true;
        await setSurfaceOverlay('none');

        const compact = isCompactViewport();
        const depthSlice = document.getElementById('depth-slice');
        const clipPos = document.getElementById('clip-pos');
        setRangeValue('fm-opacity', compact ? 58 : 88);
        setRangeValue('terrain-opacity', compact ? 16 : 20);
        setRangeValue('sat-opacity', compact ? 30 : 40);
        if (depthSlice) {
            depthSlice.value = '-100';
            depthSlice.dispatchEvent(new Event('input', { bubbles: true }));
        }
        setCheckbox('tog-depthslice', true);
        if (clipPos) {
            clipPos.value = '50';
            clipPos.dispatchEvent(new Event('input', { bubbles: true }));
        }
        setCheckbox('tog-clip', true);
        setCheckbox('tog-clip-ns', false);
        openSubsurfacePanel('ew');

        const f = getDesignFocusModel();
        state.camera.position.set(f.x + 1600, 1150, f.z + 1700);
        state.controls.target.set(f.x, -160, f.z);
        state.controls.update();
    } else if (mode === 'data-trust') {
        setCheckbox('tog-terrain', true);
        setCheckbox('tog-satellite', true);
        setCheckbox('tog-boreholes', true);
        setCheckbox('tog-proposed-site', true);
        setCheckbox('tog-srsc', true);
        setCheckbox('tog-geology-surfaces', true);
        setCheckbox('tog-faults', true);
        setDesignBheDepthVisible(true);
        setCheckbox('tog-srsc-col', true);
        setCheckbox('tog-karst', true);
        setCheckbox('tog-dyetraces', true);
        setCheckbox('tog-gsi-wells', true);
        setCheckbox('tog-geotech', true);
        setCheckbox('tog-structural', true);
        setCheckbox('tog-bedrock-geol', true);
        setCheckbox('tog-bedrock-bh', true);
        document.getElementById('tog-overlay-none').checked = true;
        await setSurfaceOverlay('none');

        const compact = isCompactViewport();
        const faultOpacity = document.getElementById('fault-opacity');
        setRangeValue('fm-opacity', compact ? 46 : 52);
        setRangeValue('terrain-opacity', compact ? 48 : 62);
        setRangeValue('sat-opacity', compact ? 58 : 72);
        if (faultOpacity) {
            faultOpacity.value = '70';
            faultOpacity.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const f = getDesignFocusModel();
        state.camera.position.set(f.x + 1450, 900, f.z + 1450);
        state.controls.target.set(f.x, -70, f.z);
        state.controls.update();
        openDataProvenancePanel();
    } else if (mode === 'free-roam') {
        setCheckbox('tog-terrain', true);
        setCheckbox('tog-satellite', true);
        setCheckbox('tog-boreholes', true);
        setCheckbox('tog-proposed-site', true);
        setCheckbox('tog-srsc', true);
        setCheckbox('tog-geology-surfaces', false);
        setCheckbox('tog-faults', false);
        setDesignBheDepthVisible(true);
        setCheckbox('tog-srsc-col', false);
        setCheckbox('tog-karst', true);
        setCheckbox('tog-dyetraces', true);
        setCheckbox('tog-gsi-wells', true);
        setCheckbox('tog-geotech', true);
        setCheckbox('tog-structural', true);
        document.getElementById('tog-overlay-none').checked = true;
        await setSurfaceOverlay('none');

        const fmOpacity = document.getElementById('fm-opacity');
        const terrainOpacity = document.getElementById('terrain-opacity');
        const satOpacity = document.getElementById('sat-opacity');
        if (fmOpacity) {
            fmOpacity.value = '62';
            fmOpacity.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (terrainOpacity) {
            terrainOpacity.value = '90';
            terrainOpacity.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (satOpacity) {
            satOpacity.value = '90';
            satOpacity.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } else if (mode === 'planning') {
        setCheckbox('tog-terrain', true);
        setCheckbox('tog-satellite', true);
        setCheckbox('tog-boreholes', true);
        setCheckbox('tog-proposed-site', true);
        setCheckbox('tog-srsc', true);
        setCheckbox('tog-karst', true);
        setCheckbox('tog-gsi-wells', true);
        setCheckbox('tog-geotech', true);
        setCheckbox('tog-dyetraces', false);
        setCheckbox('tog-structural', false);
        setCheckbox('tog-geology-surfaces', false);
        setCheckbox('tog-faults', false);
        setDesignBheDepthVisible(false);
        setCheckbox('tog-srsc-col', false);
        document.getElementById('tog-overlay-none').checked = true;
        await setSurfaceOverlay('none');
    }
    syncSurfaceGroups();
    trackEvent('viewer_mode_applied', { mode });
}

export function initControls() {
    // ── Vertical exaggeration ──────────────────────────
    document.getElementById('vert-exag').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById('ve-val').textContent = v + 'x';
        updateVerticalExaggeration(v);
    });
    document.getElementById('vert-exag').addEventListener('change', (e) => {
        trackEvent('vertical_exaggeration_changed', { value: parseFloat(e.target.value) });
    });

    // ── Formation opacity ──────────────────────────────
    document.getElementById('fm-opacity').addEventListener('input', (e) => {
        const v = e.target.value / 100;
        document.getElementById('fo-val').textContent = e.target.value + '%';
        state.formationGroup.children.forEach(m => {
            applyFormationOpacity(m.material, v);
        });
    });
    document.getElementById('fm-opacity').addEventListener('change', (e) => {
        trackEvent('formation_opacity_changed', { opacity: e.target.value / 100 });
    });
    document.getElementById('tog-geology-surfaces').addEventListener('change', (e) => {
        setSubsurfaceGeologyVisible(e.target.checked);
        trackEvent('subsurface_geology_toggled', { enabled: e.target.checked });
    });

    // ── Fault opacity ──────────────────────────────────
    document.getElementById('fault-opacity').addEventListener('input', (e) => {
        const v = e.target.value / 100;
        document.getElementById('fao-val').textContent = e.target.value + '%';
        state.faultGroup.children.forEach(m => { m.material.opacity = v; });
    });

    // ── Basic toggles ──────────────────────────────────
    document.getElementById('tog-faults').addEventListener('change', (e) => {
        state.faultGroup.visible = e.target.checked; invalidateRaycastCache();
    });
    document.getElementById('tog-boreholes').addEventListener('change', (e) => {
        state.boreholeGroup.visible = e.target.checked; invalidateRaycastCache();
    });
    document.getElementById('tog-proposed-site').addEventListener('change', (e) => {
        state.proposedSiteGroup.visible = e.target.checked; invalidateRaycastCache();
        trackEvent('proposed_site_toggled', { visible: e.target.checked });
    });
    document.getElementById('tog-srsc').addEventListener('change', (e) => {
        state.srscGroup.visible = e.target.checked; invalidateRaycastCache();
    });
    document.getElementById('tog-satellite').addEventListener('change', (e) => {
        syncSurfaceGroups();
        trackEvent('satellite_toggled', { visible: e.target.checked });
    });
    document.getElementById('sat-opacity').addEventListener('input', (e) => {
        const v = e.target.value / 100;
        document.getElementById('sao-val').textContent = e.target.value + '%';
        if (state.satellitePlane) {
            state.satellitePlane.material.opacity = v;
            state.satellitePlane.material.transparent = v < 1;
            state.satellitePlane.material.depthWrite = true;
        }
    });

    // ── Terrain toggle + opacity ───────────────────────
    document.getElementById('tog-terrain').addEventListener('change', (e) => {
        syncSurfaceGroups();
        trackEvent('terrain_toggled', { visible: e.target.checked });
    });
    document.getElementById('terrain-opacity').addEventListener('input', (e) => {
        const v = e.target.value / 100;
        document.getElementById('tro-val').textContent = e.target.value + '%';
        for (const mesh of state.terrainGroup.children) {
            mesh.material.opacity = v;
            mesh.material.transparent = v < 1;
            mesh.material.depthWrite = true;
            mesh.material.needsUpdate = true;
        }
    });

    // ── GSI data toggles ───────────────────────────────
    trackToggle('tog-karst', state.karstGroup, 'karst');
    // Also lazy-load karst connections when karst toggle first enabled
    document.getElementById('tog-karst').addEventListener('change', async (e) => {
        if (e.target.checked && !state._lazyBuilt.has('karst-conn')) {
            try {
                state.karstConnData = await lazyLoader.load('../json/karst_connections.geojson');
                buildKarstConnections();
                state._lazyBuilt.add('karst-conn');
            } catch (err) {
                console.warn('Failed to load karst connections:', err);
            }
        }
        state.karstConnGroup.visible = e.target.checked;
    });
    trackToggle('tog-dyetraces', state.dyeTraceGroup, 'dye_traces');
    trackToggle('tog-gsi-wells', state.gsiWellGroup, 'gsi_wells');
    trackToggle('tog-geotech', state.geotechGroup, 'geotech');
    trackToggle('tog-structural', state.structuralGroup, 'structural');
    trackToggle('tog-thermal-cond', state.thermalCondGroup, 'thermal_conductivity');
    trackToggle('tog-temp-depth', state.tempDepthGroup, 'temp_at_depth');
    trackToggle('tog-heat-flow', state.heatFlowGroup, 'heat_flow');
    trackToggle('tog-bedrock-geol', state.bedrockGeolGroup, 'bedrock_strike_dip');
    trackToggle('tog-bedrock-bh', state.bedrockBhGroup, 'verified_boreholes');
    trackToggle('tog-bedrock-bh-unverified', state.bedrockBhUnverifiedGroup, 'unverified_boreholes');
    trackToggle('tog-bedrock-cross-sections', state.bedrockCrossSectionGroup, 'bedrock_cross_sections');
    trackToggle('tog-landslide-locs', state.landslideLocsGroup, 'landslide_events');
    trackToggle('tog-minerals', state.mineralsGroup, 'minerals');
    trackToggle('tog-hist-inv', state.histInvGroup, 'historical_investigations');

    // ── Surface overlay radios ─────────────────────────
    document.querySelectorAll('input[name="surface-overlay"]').forEach(input => {
        input.addEventListener('change', (e) => {
            if (!e.target.checked) return;
            const prev = _previousOverlay;
            setSurfaceOverlay(e.target.value);
            trackEvent('overlay_changed', { overlay_type: e.target.value, previous_type: prev });
            _previousOverlay = e.target.value;
        });
    });
    setSurfaceOverlay((document.querySelector('input[name="surface-overlay"]:checked') || {}).value || 'none');

    document.getElementById('btn-risk-view')?.addEventListener('click', () => applyViewerMode('risk'));
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => applyViewerMode(btn.dataset.mode));
    });

    // ── Explode layers ─────────────────────────────────
    document.getElementById('explode-layers').addEventListener('input', (e) => {
        const v = parseInt(e.target.value);
        document.getElementById('ex-val').textContent = v === 0 ? '0' : v + '%';
        updateExplode(v);
    });
    document.getElementById('explode-layers').addEventListener('change', (e) => {
        trackEvent('explode_layers_changed', { value: parseInt(e.target.value) });
    });

    // ── Depth slice (debounced) ────────────────────────
    let depthSliceTimer;
    document.getElementById('depth-slice').addEventListener('input', (e) => {
        const d = parseInt(e.target.value);
        document.getElementById('ds-val').textContent = d + 'm';
        if (document.getElementById('tog-depthslice').checked) {
            clearTimeout(depthSliceTimer);
            depthSliceTimer = setTimeout(() => {
                buildDepthSlice(d);
            }, 150);
        }
    });
    document.getElementById('depth-slice').addEventListener('change', (e) => {
        trackEvent('depth_slice_changed', { depth_m: parseInt(e.target.value) });
    });
    document.getElementById('tog-depthslice').addEventListener('change', (e) => {
        if (e.target.checked) {
            const d = parseInt(document.getElementById('depth-slice').value);
            document.getElementById('ds-val').textContent = d + 'm';
            buildDepthSlice(d);
            state.depthSliceGroup.visible = true;
            trackEvent('depth_slice_changed', { depth_m: d });
        } else {
            document.getElementById('ds-val').textContent = 'Off';
            state.depthSliceGroup.visible = false;
        }
        invalidateRaycastCache();
    });

    // ── SRSC column toggle ─────────────────────────────
    document.getElementById('tog-srsc-col').addEventListener('change', (e) => {
        state.srscColumnGroup.visible = e.target.checked;
        invalidateRaycastCache();
    });

    // ── Clip toggles + position ────────────────────────
    document.getElementById('tog-clip').addEventListener('change', (e) => {
        updateClipping();
        trackEvent(e.target.checked ? 'cross_section_activated' : 'cross_section_deactivated', { axis: 'ew' });
    });
    document.getElementById('tog-clip-ns').addEventListener('change', (e) => {
        updateClipping();
        trackEvent(e.target.checked ? 'cross_section_activated' : 'cross_section_deactivated', { axis: 'ns' });
    });
    document.getElementById('clip-pos').addEventListener('input', updateClipping);
    document.getElementById('clip-pos').addEventListener('change', (e) => {
        trackEvent('cross_section_adjusted', { position_pct: parseInt(e.target.value) });
    });

    state.renderer.localClippingEnabled = true;
}
