// ── Main entry point ─────────────────────────────────────────
// Orchestrates initialization: scene → groups → data → UI → animate
import './styles/main.css';
import './scene/bvh.js';
import { state } from './state.js';
import { trackEvent } from './analytics.js';
import { applyFormationOpacity, escapeHtml, getDesignFocusModel } from './utils.js';
import { loadJSON } from './loader.js';
import { initScene, initWheelForwarding, initKeyboardZoom, initKeyboardNav } from './scene/setup.js';
import { initGroups } from './scene/groups.js';
import { buildFormations, buildSRSCColumn, updateVerticalExaggeration } from './scene/formations.js';
import { buildFaults } from './scene/faults.js';
import { buildBoreholes, buildSRSCMarker, buildEdgeBox, buildKarstFeatures,
    buildRegionalKarstFeatureMarkers, buildDyeTraces, buildGSIWells, buildGeotechSites,
    buildRegionalGeotechBoreholes,
    buildStructuralMeasurements, buildGeminiMarker, buildProposedSiteVolume } from './scene/markers.js';
import { loadSatelliteImagery, buildTerrain } from './scene/terrain.js';
import { initControls } from './ui/controls.js';
import { initViewButtons } from './ui/camera.js';
import { initTooltips } from './ui/tooltips.js';
import { initFormationSearch } from './ui/search.js';
import { buildStratColumn, buildSiteCard, buildThermalCard } from './ui/strat-column.js';
import { initDrillHandlers } from './ui/drill.js';
import { initSubsurfacePanel } from './ui/subsurface-panel.js';
// Lazy-loaded modules (non-critical, loaded on user interaction):
// - chat.js: loaded when user opens chat panel
// - ui/assessment.js: loaded when user opens assessment panel
// - ui/prognosis.js: loaded when user opens prognosis panel
// - ui/provenance.js: loaded when user opens provenance panel
// - ui/ontology.js + ui/ontology-utils.js: loaded when user opens ontology panel
// - ui/measure.js: loaded when user activates measure tool
import { animate, initResize } from './ui/animate.js';

// ── File protocol error screen ──────────────────────────────
function showFileProtocolError() {
    const loading = document.getElementById('loading');
    const dirPath = escapeHtml(window.location.pathname.replace(/\/viewer\/index\.html$/, ''));
    loading.innerHTML = `
        <div style="max-width: 520px; text-align: center; padding: 24px;">
            <h1 style="font-size: 20px; font-weight: 600; color: #e6edf3; margin-bottom: 12px;">
                Local File Access Blocked
            </h1>
            <p style="font-size: 13px; color: #7d8590; margin-bottom: 20px; line-height: 1.6;">
                Your browser blocks loading local data files when opened directly with <code style="background: #21262d; padding: 2px 6px; border-radius: 3px; font-size: 12px;">file://</code>.
                Start a local server instead:
            </p>
            <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; text-align: left; margin-bottom: 16px;">
                <p style="font-size: 11px; color: #58a6ff; margin-bottom: 8px; font-weight: 600;">Option 1 — Python (recommended)</p>
                <code style="font-size: 13px; color: #7ee787; word-break: break-all;">cd ${dirPath} && python3 -m http.server 8080</code>
                <p style="font-size: 11px; color: #7d8590; margin-top: 6px;">Then open <a href="http://localhost:8080/viewer/index.html" style="color: #58a6ff;">http://localhost:8080/viewer/index.html</a></p>
            </div>
            <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; text-align: left;">
                <p style="font-size: 11px; color: #58a6ff; margin-bottom: 8px; font-weight: 600;">Option 2 — Node.js</p>
                <code style="font-size: 13px; color: #7ee787; word-break: break-all;">npx serve ${dirPath} -p 8080</code>
            </div>
        </div>
    `;
}

// ── Load data and build scene ───────────────────────────────
function settleOpeningCamera() {
    const startPos = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const focus = getDesignFocusModel();
    const endPos = { x: focus.x + 7200, y: 4600, z: focus.z + 8600 };
    const endTarget = { x: focus.x, y: 80, z: focus.z };
    const start = performance.now();
    const duration = 900;

    function ease(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const k = ease(t);
        state.camera.position.set(
            startPos.x + (endPos.x - startPos.x) * k,
            startPos.y + (endPos.y - startPos.y) * k,
            startPos.z + (endPos.z - startPos.z) * k,
        );
        state.controls.target.set(
            startTarget.x + (endTarget.x - startTarget.x) * k,
            startTarget.y + (endTarget.y - startTarget.y) * k,
            startTarget.z + (endTarget.z - startTarget.z) * k,
        );
        state.controls.update();
        if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

function applyProjectConfig() {
    const config = state.projectConfig;
    if (!config) return;

    const title = config.title || config.project_id;
    const subtitle = config.subtitle;
    if (title) {
        document.title = title;
        const topTitle = document.querySelector('#top-bar h1');
        const loadingTitle = document.querySelector('#loading h1');
        if (topTitle) topTitle.textContent = title;
        if (loadingTitle) loadingTitle.textContent = title;
    }
    if (subtitle) {
        const topSubtitle = document.querySelector('#top-bar .subtitle');
        const loadingSubtitle = document.querySelector('#loading p');
        if (topSubtitle) topSubtitle.textContent = subtitle;
        if (loadingSubtitle) loadingSubtitle.textContent = subtitle;
    }
}

function applyDefaultDisplayState(includeSatellite = false) {
    const setChecked = (id, checked) => {
        const input = document.getElementById(id);
        if (!input || input.checked === checked) return;
        input.checked = checked;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setRange = (id, value) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    setChecked('tog-geology-surfaces', false);
    setChecked('tog-terrain', true);
    setChecked('tog-satellite', true);
    setRange('fm-opacity', 62);
    setRange('terrain-opacity', 90);
    if (includeSatellite) setRange('sat-opacity', 90);
}

async function loadData() {
    const _loadStart = performance.now();
    const statusEl = document.getElementById('load-status');
    const progressBar = document.getElementById('load-progress-fill');
    const progressText = document.getElementById('load-progress-text');
    let loaded = 0;
    const totalEssential = 6;
    const isFileProtocol = window.location.protocol === 'file:';

    function updateProgress() {
        loaded++;
        const pct = Math.round((loaded / totalEssential) * 100);
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressText) progressText.textContent = loaded + '/' + totalEssential + ' files';
    }

    try {
        statusEl.textContent = 'Loading core data...';
        const trackLoad = (url, ...args) => loadJSON(url, ...args).then(d => { updateProgress(); return d; });
        const loadOptional = async (url, fallback = null) => {
            try {
                return await loadJSON(url);
            } catch {
                return fallback;
            }
        };

        const [
            _metadata, surfaces, faults, _bhData, _voxelData, _gsiData,
            _lineageManifest, _projectConfig, _siteAssessmentProfile, _drillingRiskRegister,
            _regionalKarstData, _regionalGeotechBhData,
        ] = await Promise.all([
            trackLoad('../json/model_metadata.json'),
            trackLoad('../json/formation_surfaces.json'),
            trackLoad('../json/faults.json'),
            trackLoad('../json/borehole_array.json'),
            trackLoad('../json/voxel_model.json'),
            trackLoad('../json/gsi_site_data.json'),
            loadOptional('../json/lineage_manifest.json', null),
            loadOptional('../json/project_config.json', null),
            loadOptional('../json/site_assessment_profile.json', null),
            loadOptional('../json/drilling_risk_register.json', null),
            loadOptional('../json/karst_features_points.json', []),
            loadOptional('../json/geotech_boreholes_points.json', []),
        ]);
        state.metadata = _metadata;
        state.boreholeData = _bhData;
        state.voxelData = _voxelData;
        state.gsiData = _gsiData;
        state.lineageManifest = _lineageManifest;
        state.projectConfig = _projectConfig;
        state.siteAssessmentProfile = _siteAssessmentProfile;
        state.drillingRiskRegister = _drillingRiskRegister;
        state.regionalKarstData = _regionalKarstData;
        state.regionalGeotechBhData = _regionalGeotechBhData;
        applyProjectConfig();
        const terrainListed = state.lineageManifest?.viewer_outputs?.some(entry => entry.name === 'terrain_heightmap.json');
        state.terrainData = terrainListed ? await loadOptional('../json/terrain_heightmap.json', null) : null;

        state.cx = (state.metadata.extent.x_min + state.metadata.extent.x_max) / 2;
        state.cy = (state.metadata.extent.y_min + state.metadata.extent.y_max) / 2;

        statusEl.textContent = 'Building 3D geometry...';
        await new Promise(r => setTimeout(r, 50));

        buildFormations(surfaces);
        buildFaults(faults);
        buildBoreholes();
        buildProposedSiteVolume();
        buildSRSCMarker();
        buildEdgeBox();
        buildKarstFeatures();
        buildRegionalKarstFeatureMarkers();
        buildDyeTraces();
        buildGSIWells();
        buildGeotechSites();
        buildRegionalGeotechBoreholes();
        buildStructuralMeasurements();
        buildGeminiMarker();
        buildTerrain();

        updateVerticalExaggeration(state.currentVertExag);
        applyDefaultDisplayState(false);
        state.formationGroup.children.forEach(m => {
            applyFormationOpacity(m.material, 0.62);
        });

        // Camera initial position
        state.camera.position.set(9800, 6200, 10800);
        state.controls.target.set(0, -120, 0);
        state.controls.update();

        buildStratColumn();
        buildThermalCard();
        buildSRSCColumn();
        buildSiteCard();

        // Load satellite imagery in background
        statusEl.textContent = 'Loading satellite imagery...';
        loadSatelliteImagery().then(() => {
            document.getElementById('sat-status').textContent = 'Loaded';
            state._satLoaded = true;
            applyDefaultDisplayState(true);
        }).catch(e => {
            console.warn('Satellite imagery failed:', e);
            document.getElementById('sat-status').textContent = 'Unavailable';
        });

        statusEl.textContent = 'Ready';
        trackEvent('viewer_loaded', {
            load_time_ms: Math.round(performance.now() - _loadStart),
            files_loaded: totalEssential, files_failed: 0, lazy_deferred: 22,
        });
        trackEvent('onboarding_started');
        setTimeout(() => {
            document.getElementById('loading').classList.add('hidden');
            settleOpeningCamera();
            trackEvent('onboarding_completed');
        }, 300);

        setTimeout(() => {
            const hint = document.getElementById('help-hint');
            if (hint) hint.style.opacity = '0';
            setTimeout(() => { if (hint) hint.remove(); }, 500);
        }, 6000);

    } catch (e) {
        console.error('Failed to load:', e);
        trackEvent('viewer_error', { error_message: String(e.message || e), context: 'loadData' });
        if (isFileProtocol) {
            showFileProtocolError();
        } else {
            statusEl.textContent = 'Error: ' + e.message;
        }
    }
}

// ── Lazy-load helpers ────────────────────────────────────────
// Attach a shim click handler that loads a module on first interaction,
// calls its init, then re-dispatches the click so the real handler fires.
function lazyInit(buttonId, importFn, initName) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.addEventListener('click', async function _shim() {
        btn.removeEventListener('click', _shim);
        const mod = await importFn();
        mod[initName]();
        btn.click(); // re-fire so the real handler activates
    });
}

// ── Initialize everything ───────────────────────────────────
// Critical path (loaded synchronously)
initScene();
initGroups();
initWheelForwarding();
initKeyboardZoom();
initKeyboardNav();
initResize();
initControls();
initViewButtons();
initTooltips();
initFormationSearch();
initDrillHandlers();
initSubsurfacePanel();

// Non-critical modules (lazy-loaded on first user interaction)
lazyInit('chat-toggle', () => import('./chat.js'), 'initChat');
lazyInit('btn-assessment', () => import('./ui/assessment.js'), 'initAssessment');
lazyInit('btn-prognosis', () => import('./ui/prognosis.js'), 'initPrognosis');
lazyInit('btn-provenance', () => import('./ui/provenance.js'), 'initProvenance');
lazyInit('btn-ontology', () => import('./ui/ontology.js'), 'initOntology');
lazyInit('btn-measure', () => import('./ui/measure.js'), 'initMeasure');

loadData();
animate();
