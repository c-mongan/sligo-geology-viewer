import { state } from '../state.js';
import { COLORS, NAMES } from '../config.js';
import { trackEvent } from '../analytics.js';
import { resolvePickedData, describeFeatureOntologySummary } from './ontology-utils.js';
import { invalidateRaycastCache, getRaycastTargetsCache, setRaycastTargetsCache } from './controls.js';
import { buildTooltipSource, buildExtendedTooltipContent } from './info-panel.js';
import * as THREE from 'three';

export function getVisibleRaycastTargets() {
    if (getRaycastTargetsCache()) return getRaycastTargetsCache();
    const cache = [
        ...(state.formationGroup.visible ? state.formationGroup.children.filter(m => m.visible) : []),
        ...(state.boreholeGroup.visible ? state.boreholeGroup.children : []),
        ...(state.srscGroup.visible ? state.srscGroup.children : []),
        ...(state.srscColumnGroup.visible ? state.srscColumnGroup.children.filter(m => !m.userData.isBoundary) : []),
        ...(state.depthSliceGroup.visible ? state.depthSliceGroup.children : []),
        ...(state.proposedSiteGroup.visible ? state.proposedSiteGroup.children : []),
        ...(state.karstGroup.visible ? state.karstGroup.children.filter(m => m.userData.type === 'karst') : []),
        ...(state.dyeTraceGroup.visible ? state.dyeTraceGroup.children.filter(m => m.userData.type === 'dyetrace') : []),
        ...(state.karstConnGroup.visible ? state.karstConnGroup.children : []),
        ...(state.gsiWellGroup.visible ? state.gsiWellGroup.children.filter(m => m.userData.type === 'gsi_well') : []),
        ...(state.geotechGroup.visible ? state.geotechGroup.children.filter(m => m.userData.type === 'geotech') : []),
        ...(state.structuralGroup.visible ? state.structuralGroup.children.filter(m => m.userData.type === 'structural') : []),
        ...(state.vulnerabilityGroup.visible ? state.vulnerabilityGroup.children.filter(m => m.userData.type === 'vulnerability') : []),
        ...(state.subsoilGroup.visible ? state.subsoilGroup.children.filter(m => m.userData.type === 'subsoil') : []),
        ...(state.aquiferGroup.visible ? state.aquiferGroup.children.filter(m => m.userData.type === 'aquifer') : []),
        ...(state.gshpClosedGroup.visible ? state.gshpClosedGroup.children : []),
        ...(state.gshpOpenDomGroup.visible ? state.gshpOpenDomGroup.children : []),
        ...(state.gshpOpenComGroup.visible ? state.gshpOpenComGroup.children : []),
        ...(state.rechargeGroup.visible ? state.rechargeGroup.children : []),
        ...(state.thermalCondGroup.visible ? state.thermalCondGroup.children : []),
        ...(state.tempDepthGroup.visible ? state.tempDepthGroup.children : []),
        ...(state.heatFlowGroup.visible ? state.heatFlowGroup.children : []),
        ...(state.bedrockGeolGroup.visible ? state.bedrockGeolGroup.children : []),
        ...(state.bedrockBhGroup.visible ? state.bedrockBhGroup.children : []),
        ...(state.bedrockBhUnverifiedGroup.visible ? state.bedrockBhUnverifiedGroup.children : []),
        ...(state.bedrockCrossSectionGroup.visible ? state.bedrockCrossSectionGroup.children : []),
        ...(state.landslideLocsGroup.visible ? state.landslideLocsGroup.children : []),
        ...(state.mineralsGroup.visible ? state.mineralsGroup.children : []),
        ...(state.quaternaryGroup.visible ? state.quaternaryGroup.children : []),
        ...(state.hydrostratGroup.visible ? state.hydrostratGroup.children : []),
        ...(state.landslideSuscGroup.visible ? state.landslideSuscGroup.children : []),
        ...(state.geoheritageGroup.visible ? state.geoheritageGroup.children : []),
        ...(state.sourceProtectionGroup.visible ? state.sourceProtectionGroup.children : []),
        ...(state.epaGwStatusGroup.visible ? state.epaGwStatusGroup.children : []),
        ...(state.histInvGroup.visible ? state.histInvGroup.children : []),
        ...state.geminiMarkerGroup.children,
    ];
    setRaycastTargetsCache(cache);
    return cache;
}

export function initTooltips() {
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 35;
    raycaster.params.Points.threshold = 20;
    const mouse = new THREE.Vector2();
    const tooltip = document.getElementById('tooltip');
    const HOVER_DELAY_MS = 500;
    const POST_INTERACTION_SUPPRESS_MS = 1200;
    const DRAG_THRESHOLD_PX = 5;
    const coarsePointer = window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches;
    let hoverTimer = null;
    let suppressUntil = 0;
    let pointerDown = false;
    let pointerMoved = false;
    let pointerDownX = 0;
    let pointerDownY = 0;

    function hideTooltip() {
        clearTimeout(hoverTimer);
        hoverTimer = null;
        tooltip.style.display = 'none';
    }

    function suppressHover(duration = POST_INTERACTION_SUPPRESS_MS) {
        suppressUntil = performance.now() + duration;
        hideTooltip();
    }

    state.controls?.addEventListener?.('start', () => suppressHover(1800));
    state.controls?.addEventListener?.('end', () => suppressHover());

    if (!coarsePointer) {
        state.renderer.domElement.addEventListener('mousemove', (e) => {
            const ev = e;
            hideTooltip();
            hoverTimer = setTimeout(() => {
                if (pointerDown || ev.buttons || performance.now() < suppressUntil) return;
            mouse.x = (ev.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(ev.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, state.camera);

            const all = getVisibleRaycastTargets();
            const hits = raycaster.intersectObjects(all);

            if (hits.length > 0) {
                const hit = hits[0];
                const d = resolvePickedData(hit);
                if (!d) {
                    hideTooltip();
                    return;
                }
                tooltip.textContent = '';

                if (d.type === 'formation') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = COLORS[d.code] || '#fff';
                    title.textContent = d.name;

                    const r1 = document.createElement('div');
                    r1.className = 'tt-row';
                    r1.textContent = d.rockType + ' \u2022 ~' + d.thickness + 'm thick';

                    const r2 = document.createElement('div');
                    r2.className = 'tt-row';
                    const r2s = document.createElement('span');
                    r2s.textContent = d.conductivity + ' W/mK';
                    r2.textContent = 'Thermal conductivity: ';
                    r2.appendChild(r2s);

                    tooltip.append(title, r1, r2);
                    buildTooltipSource(tooltip, 'Interpreted: GSI Bedrock Geology 100K + Somerville et al. 2009');

                } else if (d.type === 'borehole' || d.type === 'bh_marker') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.textContent = 'Design BHE ' + d.id;

                    const rows = [
                        ['Depth', d.depth + 'm'],
                        ['Bottom temp', Number(d.temp).toFixed(1) + '\u00B0C'],
                        ['Heat extraction', Number(d.kW).toFixed(1) + ' kW'],
                        ['Karst risk', d.risk],
                        ['Formations', (d.formations || []).map(c => NAMES[c] || c).join(', ')],
                    ];
                    tooltip.appendChild(title);
                    for (const [label, val] of rows) {
                        const r = document.createElement('div');
                        r.className = 'tt-row';
                        r.textContent = label + ': ';
                        const s = document.createElement('span');
                        s.textContent = val;
                        if (label === 'Karst risk') {
                            s.style.color = d.risk === 'high' ? '#f85149' : d.risk === 'medium' ? '#d29922' : '#3fb950';
                        }
                        r.appendChild(s);
                        tooltip.appendChild(r);
                    }
                    buildTooltipSource(tooltip, 'Design scenario: synthetic closed-loop BHE array, sampled against interpreted geology');

                } else if (d.type === 'bh_array_envelope') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = '#3fb950';
                    title.textContent = 'Design BHE Field';
                    const rows = [
                        ['Boreholes', d.boreholes],
                        ['Footprint', `${d.width}m x ${d.depth}m`],
                    ];
                    tooltip.appendChild(title);
                    for (const [label, val] of rows) {
                        const r = document.createElement('div');
                        r.className = 'tt-row';
                        r.textContent = label + ': ';
                        const s = document.createElement('span');
                        s.textContent = val;
                        r.appendChild(s);
                        tooltip.appendChild(r);
                    }
                    buildTooltipSource(tooltip, 'Design scenario: conceptual closed-loop borehole field envelope');

                } else if (d.type === 'proposed_site') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = '#7ee787';
                    title.textContent = d.title || 'Proposed Site Volume';
                    const r1 = document.createElement('div');
                    r1.className = 'tt-row';
                    r1.textContent = d.detail || 'Conceptual closed-loop BHE design envelope';
                    const r2 = document.createElement('div');
                    r2.className = 'tt-row';
                    r2.textContent = 'Design scenario, not observed construction';
                    tooltip.append(title, r1, r2);
                    buildTooltipSource(tooltip, 'Design: proposed BHE field rendered against interpreted geology and GSI screening context');

                } else if (d.type === 'srsc') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = '#f85149';
                    title.textContent = 'Sligo Regional Sports Centre';
                    const r1 = document.createElement('div');
                    r1.className = 'tt-row';
                    r1.textContent = '54.262321\u00B0N, 8.450470\u00B0W';
                    const r2 = document.createElement('div');
                    r2.className = 'tt-row';
                    r2.textContent = 'Proposed 48-borehole geothermal array';
                    tooltip.append(title, r1, r2);
                    buildTooltipSource(tooltip, 'Design: GEMINI Project / ATU PMP Training Document');

                } else if (d.type === 'srsc_column') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = COLORS[d.code] || '#fff';
                    title.textContent = d.formation;
                    const r1 = document.createElement('div');
                    r1.className = 'tt-row';
                    r1.textContent = d.rockType + ' at SRSC';
                    const r2 = document.createElement('div');
                    r2.className = 'tt-row';
                    r2.textContent = 'Depth: ' + Math.abs(d.depthTop).toFixed(0) + 'm to ' + Math.abs(d.depthBot).toFixed(0) + 'm';
                    tooltip.append(title, r1, r2);
                    buildTooltipSource(tooltip, 'Interpreted: GSI Bedrock Geology 100K + Somerville et al. 2009');

                } else if (d.type === 'depthslice') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.textContent = d.formation;
                    const r1 = document.createElement('div');
                    r1.className = 'tt-row';
                    r1.textContent = 'At depth: ' + Math.abs(d.depth) + 'm';
                    tooltip.append(title, r1);
                    buildTooltipSource(tooltip, 'Interpreted: GSI Bedrock Geology 100K + Somerville et al. 2009');

                } else if (d.type === 'karst') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = '#f0883e';
                    title.textContent = (d.name || 'Karst Feature') + ' (' + d.karstType + ')';
                    tooltip.appendChild(title);
                    const rows = [
                        ['GSI ID', d.id],
                        ['Distance to SRSC', d.distance ? d.distance + 'm' : 'Unknown'],
                    ];
                    if (d.temp) rows.push(['Water temp', d.temp + '\u00B0C']);
                    for (const [label, val] of rows) {
                        const r = document.createElement('div');
                        r.className = 'tt-row';
                        r.textContent = label + ': ';
                        const s = document.createElement('span');
                        s.textContent = val;
                        r.appendChild(s);
                        tooltip.appendChild(r);
                    }
                    buildTooltipSource(tooltip, 'Official: GSI Karst Features 40K, shown with processed influence/risk context');

                } else if (d.type === 'dyetrace') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = '#a371f7';
                    title.textContent = 'Dye Trace: ' + d.name;
                    tooltip.appendChild(title);
                    const rows = [
                        ['Length', d.length + 'm'],
                        ['Date', d.date],
                        ['Result', d.result],
                    ];
                    for (const [label, val] of rows) {
                        const r = document.createElement('div');
                        r.className = 'tt-row';
                        r.textContent = label + ': ';
                        const s = document.createElement('span');
                        s.textContent = val;
                        if (label === 'Result') s.style.color = val === 'Positive' ? '#3fb950' : '#f85149';
                        r.appendChild(s);
                        tooltip.appendChild(r);
                    }
                    buildTooltipSource(tooltip, 'Official: GSI Karst Features 40K, processed as directional groundwater/karst pathway evidence');

                } else if (d.type === 'karst_connection') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = '#00ffcc';
                    title.textContent = 'Karst Connection';
                    tooltip.appendChild(title);
                    const rows = [
                        ['Input site', d.input || 'Unknown'],
                        ['Output site', d.output || 'Unknown'],
                    ];
                    for (const [label, val] of rows) {
                        const r = document.createElement('div');
                        r.className = 'tt-row';
                        r.textContent = label + ': ' + val;
                        tooltip.appendChild(r);
                    }
                    buildTooltipSource(tooltip, 'Official: GSI Karst Features 40K, processed connection pathway');

                } else if (d.type === 'gsi_well') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = '#79c0ff';
                    title.textContent = d.name + ' (' + d.id + ')';
                    tooltip.appendChild(title);
                    const rows = [['Type', d.wellType]];
                    if (d.depth) rows.push(['Depth', d.depth + 'm']);
                    if (d.dtb) rows.push(['Depth to bedrock', d.dtb + 'm']);
                    if (d.water_strike) rows.push(['Water strike', d.water_strike + 'm']);
                    if (d.yield_m3d) rows.push(['Yield', d.yield_m3d + ' m\u00B3/day' + (d.yield_class ? ' (' + d.yield_class + ')' : '')]);
                    if (d.notes) rows.push(['Notes', d.notes]);
                    for (const [label, val] of rows) {
                        const r = document.createElement('div');
                        r.className = 'tt-row';
                        r.textContent = label + ': ';
                        const s = document.createElement('span');
                        s.textContent = val;
                        if (label === 'Yield' && d.yield_class === 'Failure') s.style.color = '#d29922';
                        r.appendChild(s);
                        tooltip.appendChild(r);
                    }
                    buildTooltipSource(tooltip, 'Official: GSI Groundwater Wells');

                } else if (d.type === 'geotech') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = '#d2a8ff';
                    title.textContent = 'Report ' + d.report + ': ' + d.project;
                    tooltip.appendChild(title);
                    const rows = [
                        ['Boreholes', d.count + ' (' + d.depthRange + ' depth)'],
                        ['Bedrock met', d.bedrockMet],
                    ];
                    for (const [label, val] of rows) {
                        const r = document.createElement('div');
                        r.className = 'tt-row';
                        r.textContent = label + ': ';
                        const s = document.createElement('span');
                        s.textContent = val;
                        r.appendChild(s);
                        tooltip.appendChild(r);
                    }
                    if (d.pdfUrl) {
                        const r = document.createElement('div');
                        r.className = 'tt-row';
                        r.style.color = '#58a6ff';
                        r.textContent = 'PDF report available on GSI Goldmine';
                        tooltip.appendChild(r);
                    }
                    buildTooltipSource(tooltip, 'Official: GSI Geotechnical Boreholes');

                } else if (d.type === 'structural') {
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = '#ffa657';
                    title.textContent = 'Structural Measurement';
                    tooltip.appendChild(title);
                    const rows = [
                        ['Strike', d.strike + '\u00B0'],
                        ['Dip', d.dip + '\u00B0'],
                    ];
                    for (const [label, val] of rows) {
                        const r = document.createElement('div');
                        r.className = 'tt-row';
                        r.textContent = label + ': ';
                        const s = document.createElement('span');
                        s.textContent = val;
                        r.appendChild(s);
                        tooltip.appendChild(r);
                    }
                    buildTooltipSource(tooltip, 'Official: GSI Bedrock Geology 100K structural measurement');

                } else if (d.type === 'vulnerability') {
                    const catColors = { 'X': '#d73027', 'E': '#fc8d59', 'H': '#fee08b', 'M': '#91cf60', 'L': '#1a9850' };
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = catColors[d.cat] || '#ccc';
                    title.textContent = 'GW Vulnerability: ' + d.catName;
                    tooltip.appendChild(title);
                    const r = document.createElement('div');
                    r.className = 'tt-row';
                    r.textContent = 'Category ' + d.cat + ' - GSI 1:40,000 mapping';
                    tooltip.appendChild(r);
                    buildTooltipSource(tooltip, 'Processed official: GSI Groundwater Vulnerability 40K');

                } else if (d.type === 'subsoil') {
                    const catColors = { 'High': '#2166ac', 'Moderate': '#67a9cf', 'Low': '#d1e5f0' };
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = catColors[d.cat] || '#ccc';
                    title.textContent = 'Subsoil Permeability: ' + d.cat;
                    tooltip.appendChild(title);
                    buildTooltipSource(tooltip, 'Processed official: GSI Subsoil Permeability');

                } else if (d.type === 'aquifer') {
                    const catColors = { 'Rkc': '#1a9850', 'Lk': '#66bd63', 'Lm': '#a6d96a', 'Ll': '#d9ef8b', 'Pl': '#fee08b', 'Pu': '#fdae61' };
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = catColors[d.cat] || '#ccc';
                    title.textContent = 'Aquifer: ' + d.cat;
                    tooltip.appendChild(title);
                    const r = document.createElement('div');
                    r.className = 'tt-row';
                    r.textContent = d.catName;
                    tooltip.appendChild(r);
                    buildTooltipSource(tooltip, 'Processed official: GSI Aquifer Classification');

                } else if (d.type === 'recharge') {
                    const catColors = { 'Very High': '#0571b0', 'High': '#92c5de', 'Moderate': '#f7f7f7', 'Low': '#fdb863', 'Very Low': '#ca0020' };
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = catColors[d.cat] || '#ccc';
                    title.textContent = 'GW Recharge: ' + d.cat;
                    tooltip.appendChild(title);
                    const rows = [
                        ['Recharge', (d.recharge_mm ?? 'Unknown') + ' mm/yr'],
                        ['Coefficient', d.coefficient != null ? d.coefficient + '%' : 'Unknown'],
                    ];
                    for (const [label, val] of rows) {
                        const r = document.createElement('div');
                        r.className = 'tt-row';
                        r.textContent = label + ': ' + val;
                        tooltip.appendChild(r);
                    }
                    buildTooltipSource(tooltip, 'Processed official: GSI Groundwater Recharge');

                } else if (d.type === 'gshp-closed' || d.type === 'gshp-open-dom' || d.type === 'gshp-open-com') {
                    const suitColors = { '5': '#1a9850', '4': '#66bd63', '3': '#fee08b', '2': '#fdae61', '1': '#d73027', '6': '#888888' };
                    const typeLabel = d.type === 'gshp-closed' ? 'Closed-Loop' : d.type === 'gshp-open-dom' ? 'Open-Loop Domestic' : 'Open-Loop Commercial';
                    const title = document.createElement('div');
                    title.className = 'tt-title';
                    title.style.color = suitColors[d.cat] || '#ccc';
                    title.textContent = 'GSHP ' + typeLabel;
                    tooltip.appendChild(title);
                    const r = document.createElement('div');
                    r.className = 'tt-row';
                    r.textContent = d.catName;
                    tooltip.appendChild(r);
                    buildTooltipSource(tooltip, 'Processed official: GSI Geothermal Suitability Maps');

                } else {
                    buildExtendedTooltipContent(tooltip, d);
                }

                const ontologySummary = ev.shiftKey ? describeFeatureOntologySummary(d) : '';
                if (ontologySummary) {
                    const ontDiv = document.createElement('div');
                    ontDiv.style.cssText = 'margin-top:4px;font-size:9px;color:#58a6ff;line-height:1.35';
                    ontDiv.textContent = ontologySummary;
                    tooltip.appendChild(ontDiv);
                }

                tooltip.style.display = 'block';
                const tx = Math.min(ev.clientX + 28, window.innerWidth - 300);
                const ty = Math.min(ev.clientY + 28, window.innerHeight - 170);
                tooltip.style.left = tx + 'px';
                tooltip.style.top = ty + 'px';
            } else {
                hideTooltip();
            }
            }, HOVER_DELAY_MS);
        }, { passive: true });
    }
    state.renderer.domElement.addEventListener('mouseleave', hideTooltip);
    state.renderer.domElement.addEventListener('pointerdown', (e) => {
        pointerDown = true;
        pointerMoved = false;
        pointerDownX = e.clientX;
        pointerDownY = e.clientY;
        suppressHover(1800);
    }, { passive: true });
    state.renderer.domElement.addEventListener('pointermove', (e) => {
        if (!pointerDown) return;
        const dx = e.clientX - pointerDownX;
        const dy = e.clientY - pointerDownY;
        if (!pointerMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) pointerMoved = true;
        if (pointerMoved) suppressHover(1800);
    }, { passive: true });
    state.renderer.domElement.addEventListener('pointerup', () => {
        pointerDown = false;
        suppressHover(pointerMoved ? 1400 : 250);
    }, { passive: true });
    state.renderer.domElement.addEventListener('wheel', () => suppressHover(1800), { passive: true });

    // ── Screenshot export ───────────────────────────────
    document.getElementById('btn-screenshot').addEventListener('click', () => {
        state.renderer.render(state.scene, state.camera);
        const link = document.createElement('a');
        link.download = 'SRSC-Sligo-3D-Model-' + new Date().toISOString().slice(0,10) + '.png';
        link.href = state.renderer.domElement.toDataURL('image/png');
        link.click();
        trackEvent('screenshot_exported');
    });

}
