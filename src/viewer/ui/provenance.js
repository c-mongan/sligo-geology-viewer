import { state } from '../state.js';
import { DATA_PROVENANCE } from '../config.js';
import { trackEvent } from '../analytics.js';

const TRUST_LABELS = {
    observed: 'Observed',
    processed: 'Processed',
    interpreted: 'Interpreted',
    design: 'Design',
    live: 'Live',
};

const CONFIDENCE_LABELS = {
    high: 'High',
    medium_high: 'Med-high',
    medium: 'Medium',
    low: 'Low',
};

export function initProvenance() {
    const btn = document.getElementById('btn-provenance');
    const panel = document.getElementById('provenance-panel');
    const closeBtn = document.getElementById('prov-close');
    if (!btn || !panel) return;

    btn.addEventListener('click', () => {
        const isOpen = panel.classList.contains('open');
        if (isOpen) {
            panel.classList.remove('open');
            btn.classList.remove('active');
            trackEvent('panel_closed', { panel_name: 'data_provenance' });
        } else {
            document.getElementById('ontology-panel')?.classList.remove('open');
            document.getElementById('btn-ontology')?.classList.remove('active');
            renderProvenance();
            panel.classList.add('open');
            btn.classList.add('active');
            trackEvent('panel_opened', { panel_name: 'data_provenance' });
            trackEvent('data_provenance_viewed');
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.remove('open');
        btn.classList.remove('active');
        trackEvent('panel_closed', { panel_name: 'data_provenance' });
    });

    function resolveVar(ref) {
        switch (ref) {
            case 'bedrockGeolData': return state.bedrockGeolData;
            case 'bedrockBhData': return state.bedrockBhData;
            case 'gsiData': return state.gsiData;
            case 'vulnData': return state.vulnData;
            case 'aquiferData': return state.aquiferData;
            case 'subsoilData': return state.subsoilData;
            case 'hydrostratData': return state.hydrostratData;
            case 'gshpClosedData': return state.gshpClosedData;
            case 'gshpOpenDomData': return state.gshpOpenDomData;
            case 'gshpOpenComData': return state.gshpOpenComData;
            case 'thermalCondData': return state.thermalCondData;
            case 'tempDepthData': return state.tempDepthData;
            case 'terrainData': return state.terrainData;
            case 'quaternaryData': return state.quaternaryData;
            case 'landslideSuscData': return state.landslideSuscData;
            case 'landslideLocsData': return state.landslideLocsData;
            case 'mineralsData': return state.mineralsData;
            case 'geoheritageData': return state.geoheritageData;
            case 'sourceProtectionData': return state.sourceProtectionData;
            case 'epaGwStatusData': return state.epaGwStatusData;
            case 'metadata': return state.metadata;
            case 'boreholeData': return state.boreholeData;
            case 'voxelData': return state.voxelData;
            case 'histInvData': return state.histInvData;
            case 'geminiMarkerGroup': return state.geminiMarkerGroup;
            case '_faults': return state._faultCount;
            case '_satLoaded': return state._satLoaded;
            default: return undefined;
        }
    }

    function inferTrust(ds) {
        const badge = String(ds.badge || '').toLowerCase();
        if (ds.trust) return ds.trust;
        if (badge === 'gsi' || badge === 'nasa' || badge === 'esri') return 'observed';
        if (badge === 'design') return 'design';
        if (badge === 'interpreted' || ds.cat === 'model') return 'interpreted';
        return 'processed';
    }

    function inferConfidence(ds) {
        if (ds.confidence) return ds.confidence;
        const trust = inferTrust(ds);
        if (trust === 'observed') return 'high';
        if (trust === 'processed') return 'medium_high';
        if (trust === 'design') return 'medium';
        return 'medium';
    }

    function renderTrustControls(body) {
        const active = body?.dataset?.trustFilter || 'all';
        const filters = [
            ['all', 'All'],
            ['observed', 'Observed'],
            ['processed', 'Processed'],
            ['interpreted', 'Interpreted'],
            ['design', 'Design'],
        ];
        return `<div class="prov-trustbar" role="group" aria-label="Filter by data type">` +
            filters.map(([key, label]) =>
                `<button class="prov-filter ${active === key ? 'active' : ''}" data-filter="${key}" type="button">${label}</button>`
            ).join('') +
            `</div>`;
    }

    function manifestLookup() {
        const outputs = state.lineageManifest?.viewer_outputs || [];
        return new Map(outputs.map(entry => [entry.name, entry]));
    }

    function renderManifestSummary() {
        const manifest = state.lineageManifest;
        if (!manifest) {
            return `<div class="prov-callout warn">Lineage manifest unavailable in this build. Run <code>npm run lineage</code> before release.</div>`;
        }
        const summary = manifest.summary || {};
        const selfContained = summary.rebuild_self_contained === true;
        return `<div class="prov-callout ${selfContained ? 'ok' : 'warn'}">` +
            `<strong>${selfContained ? 'Self-contained rebuild' : 'Rebuild gap detected'}</strong>` +
            `<span>${summary.viewer_outputs || 0} viewer outputs, ${summary.raw_gsi_extracts || 0} raw GSI extracts, ${summary.external_symlink_inputs || 0} external symlink inputs.</span>` +
            `</div>`;
    }

    function renderSummaryCards() {
        const summary = state.lineageManifest?.summary || {};
        const cards = [
            ['Raw GSI extracts', summary.raw_gsi_extracts || 0],
            ['Model inputs', summary.model_inputs || 0],
            ['Symlink risks', summary.external_symlink_inputs || 0],
            ['Viewer outputs', summary.viewer_outputs || 0],
        ];
        return `<div class="prov-summary-grid">` +
            cards.map(([label, value]) => `<div class="prov-summary-card"><strong>${value}</strong><span>${label}</span></div>`).join('') +
            `</div>`;
    }

    function renderReadinessChecklist() {
        const manifest = state.lineageManifest;
        const config = state.projectConfig;
        const summary = manifest?.summary || {};
        const readiness = config?.data_readiness || {};
        const minRaw = readiness.minimum_raw_gsi_extracts || 20;
        const gaps = manifest?.known_gaps || [];
        const demGap = gaps.some(gap => String(gap).toLowerCase().includes('dem'));
        const items = [
            {
                label: 'Official extracts present',
                status: summary.raw_gsi_extracts >= minRaw ? 'ok' : 'warn',
                detail: `${summary.raw_gsi_extracts || 0}/${minRaw} raw GSI extracts`,
            },
            {
                label: 'Self-contained inputs',
                status: summary.external_symlink_inputs === 0 ? 'ok' : 'warn',
                detail: `${summary.external_symlink_inputs || 0} external links`,
            },
            {
                label: 'Project config',
                status: config ? 'ok' : 'warn',
                detail: config?.project_id || 'Missing project_config.json',
            },
            {
                label: '3D geology',
                status: 'info',
                detail: 'Interpreted model, not observed 3D geology',
            },
            {
                label: 'Terrain rebuild',
                status: demGap ? 'warn' : 'ok',
                detail: demGap ? 'DEM raster gap documented' : 'No DEM gap in manifest',
            },
        ];

        return `<div class="prov-readiness" aria-label="Data readiness checklist">` +
            `<div class="prov-readiness-title">Data Readiness</div>` +
            items.map(item =>
                `<div class="prov-ready-row ${item.status}">` +
                    `<span class="prov-ready-dot"></span>` +
                    `<strong>${item.label}</strong>` +
                    `<span>${item.detail}</span>` +
                `</div>`
            ).join('') +
            `</div>`;
    }

    function renderProvenance() {
        const body = document.getElementById('prov-body');
        const activeFilter = body?.dataset?.trustFilter || 'all';
        const manifestByName = manifestLookup();
        let html = '';
        let okCount = 0, warnCount = 0, failCount = 0, totalRecords = 0;
        const trustCounts = { observed: 0, processed: 0, interpreted: 0, design: 0 };

        html += renderManifestSummary();
        html += renderSummaryCards();
        html += renderReadinessChecklist();
        html += renderTrustControls(body);

        for (const cat of DATA_PROVENANCE.categories) {
            const datasets = DATA_PROVENANCE.datasets.filter(d => {
                if (d.cat !== cat.id) return false;
                return activeFilter === 'all' || inferTrust(d) === activeFilter;
            });
            if (!datasets.length) continue;

            html += `<div class="prov-category">`;
            html += `<div class="prov-cat-header"><span class="prov-cat-icon">${cat.icon}</span> ${cat.label}</div>`;
            html += `<div class="prov-row prov-row-header" aria-hidden="true">` +
                `<span>Dataset</span><span>Source</span><span>Type</span><span>Conf.</span><span>Count</span><span>Status</span>` +
                `</div>`;

            for (const ds of datasets) {
                const data = resolveVar(ds.varRef);
                const count = ds.countExpr(data);
                const loaded = count !== null && count !== undefined && count !== 0;
                const isNumeric = typeof count === 'number';
                const countMatch = !ds.expected || !isNumeric || count === ds.expected;
                const trust = inferTrust(ds);
                const confidence = inferConfidence(ds);
                trustCounts[trust] = (trustCounts[trust] || 0) + 1;

                let status, statusClass;
                if (!loaded) {
                    status = 'Missing'; statusClass = 'fail'; failCount++;
                } else if (isNumeric && ds.expected && !countMatch) {
                    status = 'Check'; statusClass = 'warn'; warnCount++;
                } else {
                    status = 'Loaded'; statusClass = 'ok'; okCount++;
                }

                if (isNumeric) totalRecords += count;

                const countLabel = loaded
                    ? (isNumeric ? count.toLocaleString() : count)
                    : '—';
                const badgeClass = ds.badge.toLowerCase() === 'gsi' ? 'gsi'
                    : ds.badge.toLowerCase() === 'nasa' ? 'nasa'
                    : ds.badge.toLowerCase() === 'esri' ? 'esri'
                    : 'model';
                const lineage = ds.lineage ? manifestByName.get(ds.lineage) : null;
                const lineageLabel = lineage
                    ? `${Math.round((lineage.size_bytes || 0) / 1024).toLocaleString()} KB · ${String(lineage.sha256 || '').slice(0, 8)}`
                    : null;

                html += `<div class="prov-row" data-trust="${trust}" data-confidence="${confidence}">`;
                html += `<div><div class="prov-name">${ds.name}</div><div class="prov-desc">${ds.desc}</div></div>`;
                html += `<span class="prov-badge ${badgeClass}">${ds.badge}</span>`;
                html += `<span class="prov-chip trust-${trust}">${TRUST_LABELS[trust] || trust}</span>`;
                html += `<span class="prov-chip conf-${confidence}">${CONFIDENCE_LABELS[confidence] || confidence}</span>`;
                html += `<span class="prov-count">${countLabel}</span>`;
                html += `<div class="prov-actions">`;
                html += `<span class="prov-status ${statusClass}">${status}</span>`;
                if (ds.source) {
                    html += `<a class="prov-link" href="${ds.source}" target="_blank" rel="noopener noreferrer" title="View original data source">Source</a>`;
                }
                if (lineageLabel) html += `<span class="prov-hash" title="Manifest size and SHA-256 prefix">${lineageLabel}</span>`;
                html += `</div>`;
                html += `</div>`;
            }
            html += `</div>`;
        }
        body.innerHTML = html;

        body.querySelectorAll('.prov-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                body.dataset.trustFilter = btn.dataset.filter || 'all';
                trackEvent('data_provenance_filtered', { trust_filter: body.dataset.trustFilter });
                renderProvenance();
            });
        });

        body.querySelectorAll('.prov-link').forEach(link => {
            link.addEventListener('click', () => {
                trackEvent('data_source_link_clicked', { source_name: link.closest('.prov-row')?.querySelector('.prov-name')?.textContent || '', url: link.href });
            });
        });

        const total = okCount + warnCount + failCount;
        document.getElementById('prov-summary').textContent =
            `— ${total} datasets · ${totalRecords.toLocaleString()} records`;
        document.getElementById('prov-stats').innerHTML =
            `<span class="prov-stat"><span class="dot ok"></span>${okCount} loaded</span>` +
            (warnCount ? `<span class="prov-stat"><span class="dot warn"></span>${warnCount} count mismatch</span>` : '') +
            (failCount ? `<span class="prov-stat"><span class="dot fail"></span>${failCount} unavailable</span>` : '') +
            `<span class="prov-stat">${trustCounts.observed} observed</span>` +
            `<span class="prov-stat">${trustCounts.interpreted} interpreted</span>`;
    }
}
