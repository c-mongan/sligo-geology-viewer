import { state } from '../state.js';
import { COLORS, NAMES } from '../config.js';
import { trackEvent } from '../analytics.js';
import { modelToItm } from '../utils.js';
import { getVisibleRaycastTargets } from './tooltips.js';
import { resolvePickedData } from './ontology-utils.js';
import { sampleFormationCodeAt, buildGSIGeothermalSection, exportDrillReport } from './drill-report.js';
import { showInfoPanel } from './info-panel.js';
import { buildSelectedPrognosis } from './prognosis-data.js';
import * as THREE from 'three';

// Re-export for backwards compatibility
export { showInfoPanel } from './info-panel.js';
export { exportDrillReport } from './drill-report.js';

// ── showDrillPanel ──────────────────────────────────

export function showDrillPanel(hitPoint, hitObject = null) {
    const drillPanel = document.getElementById('drill-panel');
    const drillTitle = document.getElementById('drill-title');
    const drillBody = document.getElementById('drill-body');
    const infoPanel = document.getElementById('info-panel');

    while (drillBody.firstChild) drillBody.removeChild(drillBody.firstChild);
    infoPanel.style.display = 'none';

    const { itmX, itmY } = modelToItm(hitPoint.x, hitPoint.z);
    const surfaceElev = hitPoint.y / state.currentVertExag;
    const requestedDepth = 200;
    const modelFloor = state.metadata?.extent?.z_min ?? (surfaceElev - requestedDepth);
    const sampledDepth = Math.max(0, Math.min(requestedDepth, surfaceElev - modelFloor));
    const drillDepth = Math.max(0, Math.round(sampledDepth));
    const fallbackCode = hitObject?.userData?.code || state.metadata?.formations?.[0]?.code || 'CDDART';
    const sampleStep = 10;
    const layers = [];
    let currentCode = null;
    let layerStart = 0;
    let usedVoxelColumn = false;

    if (drillDepth > 0) {
        for (let depth = 0; depth <= drillDepth; depth += sampleStep) {
            const elev = surfaceElev - depth;
            const sampledCode = sampleFormationCodeAt(itmX, itmY, elev);
            const code = sampledCode || (depth === 0 ? fallbackCode : currentCode);
            if (!code) continue;
            if (sampledCode) usedVoxelColumn = true;

            if (currentCode === null) {
                currentCode = code;
                layerStart = depth;
                continue;
            }

            if (code !== currentCode) {
                layers.push({ code: currentCode, startDepth: layerStart, endDepth: depth });
                currentCode = code;
                layerStart = depth;
            }
        }
    }

    if (currentCode !== null) {
        layers.push({ code: currentCode, startDepth: layerStart, endDepth: drillDepth });
    }

    if (!layers.length && drillDepth > 0) {
        layers.push({ code: fallbackCode, startDepth: 0, endDepth: drillDepth });
    }

    drillTitle.textContent = 'Virtual Borehole Planning Sample — ' + drillDepth + ' m';

    const meta = document.createElement('div');
    meta.className = 'dp-meta';
    meta.textContent = 'ITM ' + Math.round(itmX) + ', ' + Math.round(itmY) + ' · Surface ' + surfaceElev.toFixed(0) + ' mOD';
    drillBody.appendChild(meta);

    const sampleNote = document.createElement('div');
    sampleNote.className = 'dp-note';
    sampleNote.textContent = 'Generated from the map point you Shift + double-clicked. This is not an observed borehole record.';
    drillBody.appendChild(sampleNote);

    if (!usedVoxelColumn && drillDepth > 0) {
        const note = document.createElement('div');
        note.className = 'dp-note';
        note.textContent = 'Voxel sampling was unavailable at this location, so the borehole log falls back to the intersected surface unit as a proxy.';
        drillBody.appendChild(note);
    }

    if (!drillDepth) {
        const note = document.createElement('div');
        note.className = 'dp-note';
        note.textContent = 'This location is above the model floor but does not provide enough depth for a useful virtual borehole.';
        drillBody.appendChild(note);
        drillBody.appendChild(buildGSIGeothermalSection(itmX, itmY));
        drillPanel.style.display = 'block';
        return;
    }

    let totalYield = 0;
    let weightedConductivity = 0;
    const gradient = 0.026;
    const surfaceTemp = 10;

    for (const layer of layers) {
        const fm = state.metadata.formations.find(f => f.code === layer.code) || state.metadata.formations[0];
        const thickness = Math.max(0, layer.endDepth - layer.startDepth);
        if (!thickness) continue;

        const conductivity = Number.isFinite(fm?.conductivity) ? fm.conductivity : 2.0;
        const yieldPerM = conductivity >= 2.5 ? 60 : (conductivity >= 2.0 ? 50 : 35);
        totalYield += yieldPerM * thickness;
        weightedConductivity += conductivity * thickness;

        const div = document.createElement('div');
        div.className = 'drill-layer';

        const bar = document.createElement('div');
        bar.className = 'drill-layer-bar';
        bar.style.backgroundColor = COLORS[layer.code] || fm?.color || '#888888';
        bar.style.minHeight = Math.max(26, thickness * 0.42) + 'px';

        const info = document.createElement('div');
        info.className = 'drill-layer-info';

        const name = document.createElement('div');
        name.className = 'drill-layer-name';
        name.textContent = (NAMES[layer.code] || fm?.name || layer.code) + ' (' + thickness + 'm)';

        const detail = document.createElement('div');
        detail.className = 'drill-layer-detail';
        const topTemp = surfaceTemp + layer.startDepth * gradient;
        const bottomTemp = surfaceTemp + layer.endDepth * gradient;
        detail.textContent = conductivity.toFixed(1) + ' W/mK · ~' + yieldPerM + ' W/m · ' + topTemp.toFixed(1) + '–' + bottomTemp.toFixed(1) + '°C';

        info.append(name, detail);
        div.append(bar, info);
        drillBody.appendChild(div);

        const depthLabel = document.createElement('div');
        depthLabel.className = 'drill-depth';
        depthLabel.textContent = layer.startDepth + 'm – ' + layer.endDepth + 'm below ground';
        drillBody.appendChild(depthLabel);
    }

    const avgCond = weightedConductivity / drillDepth;
    const avgYield = totalYield / drillDepth;
    const totalKW = totalYield / 1000;
    const bottomTemp = surfaceTemp + drillDepth * gradient;

    let nearestKarst = Infinity;
    let nearestKarstName = '';
    if (state.gsiData?.karst_features?.length) {
        for (const feature of state.gsiData.karst_features) {
            if (!Number.isFinite(feature?.itm_x) || !Number.isFinite(feature?.itm_y)) continue;
            const dist = Math.hypot(itmX - feature.itm_x, itmY - feature.itm_y);
            if (dist < nearestKarst) {
                nearestKarst = dist;
                nearestKarstName = feature.name || feature.type || 'Mapped karst feature';
            }
        }
    }

    const karstRisk = !Number.isFinite(nearestKarst)
        ? 'Not mapped'
        : (nearestKarst < 500 ? 'High' : (nearestKarst < 1500 ? 'Moderate' : 'Low'));

    const summary = document.createElement('div');
    summary.className = 'drill-summary';
    const summaryRows = [
        ['Avg conductivity', avgCond.toFixed(1) + ' W/mK'],
        ['Avg yield', avgYield.toFixed(0) + ' W/m'],
        ['Borehole capacity', totalKW.toFixed(1) + ' kW'],
        ['Temp at ' + drillDepth + 'm', bottomTemp.toFixed(1) + '°C'],
        ['Nearest karst', Number.isFinite(nearestKarst) ? (Math.round(nearestKarst) + 'm (' + nearestKarstName + ')') : 'No mapped feature'],
        ['Karst risk', karstRisk],
    ];

    for (const [label, value] of summaryRows) {
        const row = document.createElement('div');
        row.className = 'ds-row';
        const lbl = document.createElement('span');
        lbl.className = 'ds-label';
        lbl.textContent = label;
        const val = document.createElement('span');
        val.className = 'ds-value';
        val.textContent = value;
        if (label === 'Karst risk') {
            val.style.color = karstRisk === 'High' ? '#f85149' : karstRisk === 'Moderate' ? '#d29922' : (karstRisk === 'Low' ? '#3fb950' : '#7d8590');
        }
        row.append(lbl, val);
        summary.appendChild(row);
    }

    const verdict = document.createElement('div');
    let verdictClass = 'poor';
    let verdictText = 'Constrained for GSHP';
    if (avgCond >= 2.5 && karstRisk !== 'High') {
        verdictClass = karstRisk === 'Moderate' ? 'moderate' : 'good';
        verdictText = karstRisk === 'Moderate' ? 'Favourable, with karst constraints' : 'Favourable for GSHP';
    } else if (avgCond >= 2.0) {
        verdictClass = karstRisk === 'High' ? 'poor' : 'moderate';
        verdictText = karstRisk === 'High' ? 'Moderate rock, but karst constraints dominate' : 'Moderate GSHP potential';
    }
    verdict.className = 'ds-verdict ' + verdictClass;
    verdict.textContent = verdictText + ' (' + totalKW.toFixed(1) + ' kW per borehole)';
    summary.appendChild(verdict);

    const selectedPrognosis = buildSelectedPrognosis({
        itmX,
        itmY,
        surfaceElev,
        drillDepth,
        layers,
        avgCond,
        avgYield,
        totalKW,
        bottomTemp,
        nearestKarst,
        nearestKarstName,
        karstRisk,
        verdictText,
        usedVoxelColumn,
    });

    const interpretation = selectedPrognosis.interpretation;
    if (interpretation) {
        const signal = document.createElement('div');
        signal.className = 'drill-decision decision-' + interpretation.className;

        const score = document.createElement('strong');
        score.textContent = interpretation.score + ' / 100';

        const label = document.createElement('span');
        label.textContent = 'screening score';

        const chips = document.createElement('div');
        chips.className = 'decision-badges';
        for (const badge of interpretation.badges || []) {
            const chip = document.createElement('span');
            chip.className = 'decision-chip decision-' + badge.tone;
            chip.textContent = badge.label;
            chips.appendChild(chip);
        }

        signal.append(score, label, chips);
        summary.appendChild(signal);
    }

    drillBody.appendChild(summary);

    // GSI Geothermal data overlay query
    const gsiSection = buildGSIGeothermalSection(itmX, itmY);
    drillBody.appendChild(gsiSection);

    state.selectedPrognosis = selectedPrognosis;
    window.dispatchEvent(new CustomEvent('viewer:prognosis-selected', { detail: state.selectedPrognosis }));

    drillPanel.style.display = 'block';
    trackEvent('drill_completed', { depth_m: drillDepth, formations_hit: layers.length, thermal_yield_kw: totalKW, verdict: verdictText });
    trackEvent('panel_opened', { panel_name: 'drill' });
}

// ── Click/dblclick handlers for drill ───────────────

export function initDrillHandlers() {
    const drillPanel = document.getElementById('drill-panel');

    document.getElementById('drill-close').addEventListener('click', () => {
        drillPanel.style.display = 'none';
        trackEvent('panel_closed', { panel_name: 'drill' });
    });

    document.getElementById('drill-export').addEventListener('click', exportDrillReport);

    // Info panel close
    const infoPanel = document.getElementById('info-panel');
    document.getElementById('ip-close').addEventListener('click', () => {
        infoPanel.style.display = 'none';
        trackEvent('panel_closed', { panel_name: 'info' });
    });

    const INSPECT_DRAG_THRESHOLD_PX = 5;
    let inspectDownX = 0;
    let inspectDownY = 0;
    let inspectMoved = false;
    let lastWheelAt = 0;

    state.renderer.domElement.addEventListener('pointerdown', (e) => {
        inspectDownX = e.clientX;
        inspectDownY = e.clientY;
        inspectMoved = false;
    }, { passive: true });

    state.renderer.domElement.addEventListener('pointermove', (e) => {
        if (!e.buttons) return;
        const dx = e.clientX - inspectDownX;
        const dy = e.clientY - inspectDownY;
        if (Math.hypot(dx, dy) > INSPECT_DRAG_THRESHOLD_PX) inspectMoved = true;
    }, { passive: true });

    state.renderer.domElement.addEventListener('wheel', () => {
        lastWheelAt = performance.now();
    }, { passive: true });

    // Click to inspect a visible marker or surface. Shift-click still works for the same action.
    state.renderer.domElement.addEventListener('click', (e) => {
        if (state.measuringActive) return;
        if (!e.shiftKey && (inspectMoved || performance.now() - lastWheelAt < 800)) return;
        const clickMouse = new THREE.Vector2(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1
        );
        const clickRay = new THREE.Raycaster();
        clickRay.params.Line.threshold = 35;
        clickRay.params.Points.threshold = 20;
        clickRay.setFromCamera(clickMouse, state.camera);

        const clickTargets = getVisibleRaycastTargets();
        const hits = clickRay.intersectObjects(clickTargets);
        if (hits.length > 0) {
            const data = resolvePickedData(hits[0]);
            if (data) showInfoPanel(data);
        }
    });

    // Shift-double-click to drill. Plain double-clicks are reserved for camera/orbit use.
    state.renderer.domElement.addEventListener('dblclick', (e) => {
        if (!e.shiftKey) return;
        e.preventDefault();
        const dblMouse = new THREE.Vector2(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1
        );
        const dblRay = new THREE.Raycaster();
        dblRay.setFromCamera(dblMouse, state.camera);

        const drillTargets = [
            ...(state.formationGroup.visible ? state.formationGroup.children.filter(m => m.visible) : []),
        ];
        if (state.satellitePlane?.visible !== false) drillTargets.push(state.satellitePlane);

        const hits = dblRay.intersectObjects(drillTargets);
        if (hits.length > 0) {
            const _drillPt = hits[0].point;
            const _drillItm = modelToItm(_drillPt.x, _drillPt.z);
            trackEvent('drill_started', { itm_x: Math.round(_drillItm.itmX), itm_y: Math.round(_drillItm.itmY) });
            showDrillPanel(hits[0].point, hits[0].object);
        }
    });
}
