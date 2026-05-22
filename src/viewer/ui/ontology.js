import { state } from '../state.js';
import { trackEvent } from '../analytics.js';
import { ensureOntologyInventoryLoaded, resolveOntologySourceHref, getOntologyInventory } from './ontology-utils.js';

export function initOntology() {
    const btn = document.getElementById('btn-ontology');
    const panel = document.getElementById('ontology-panel');
    const closeBtn = document.getElementById('ont-close');
    if (!btn || !panel) return;

    btn.addEventListener('click', () => {
        const isOpen = panel.classList.contains('open');
        if (isOpen) {
            panel.classList.remove('open');
            btn.classList.remove('active');
            trackEvent('panel_closed', { panel_name: 'ontology' });
        } else {
            document.getElementById('provenance-panel')?.classList.remove('open');
            document.getElementById('btn-provenance')?.classList.remove('active');
            const ontologyInventory = getOntologyInventory();
            if (!ontologyInventory?.sources) {
                loadOntology();
            } else {
                renderOntology();
            }
            panel.classList.add('open');
            btn.classList.add('active');
            trackEvent('panel_opened', { panel_name: 'ontology' });
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.remove('open');
        btn.classList.remove('active');
        trackEvent('panel_closed', { panel_name: 'ontology' });
    });

    async function loadOntology() {
        const body = document.getElementById('ont-body');
        const loadMsg = document.createElement('div');
        loadMsg.style.cssText = 'text-align:center;padding:24px;color:#7d8590;font-size:12px;';
        loadMsg.textContent = 'Loading source inventory...';
        body.appendChild(loadMsg);
        try {
            await ensureOntologyInventoryLoaded();
            renderOntology();
        } catch (e) {
            console.error('[ontology] Sources panel load failed:', e.message || e);
            body.textContent = '';
            const errMsg = document.createElement('div');
            errMsg.style.cssText = 'text-align:center;padding:24px;color:#f85149;font-size:12px;';
            errMsg.textContent = 'Failed to load source inventory. ';

            const retryBtn = document.createElement('a');
            retryBtn.textContent = 'Retry';
            retryBtn.href = '#';
            retryBtn.style.cssText = 'color:#58a6ff;cursor:pointer;text-decoration:underline;margin-left:4px;';
            retryBtn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                body.textContent = '';
                await loadOntology();
            });
            errMsg.appendChild(retryBtn);
            body.appendChild(errMsg);
        }
    }

    function probeStatusClass(status) {
        if (!status) return 'unknown';
        const s = status.toLowerCase();
        if (s === 'live') return 'live';
        if (s.includes('sparse') || s === 'live_sparse') return 'sparse';
        if (s === 'failed' || s.includes('error')) return 'failed';
        if (s === 'profiled' || s.includes('profile')) return 'profiled';
        return 'unknown';
    }

    function normalizeOntologyCategory(category) {
        if (!category) return 'other';
        if (category === 'environment') return 'environmental';
        if (category === 'geothermal') return 'energy';
        return category;
    }

    function ontologyCategoryLabel(category, labels) {
        return labels[category] || category
            .split('_')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    function renderOntology() {
        const ontologyInventory = getOntologyInventory();
        if (!ontologyInventory || !ontologyInventory.sources) return;
        const body = document.getElementById('ont-body');
        while (body.firstChild) body.removeChild(body.firstChild);

        const sources = ontologyInventory.sources;
        // Group by category
        const categories = {};
        for (const src of sources) {
            const cat = normalizeOntologyCategory(src.category);
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(src);
        }

        let liveCount = 0, sparseCount = 0, failedCount = 0, profiledCount = 0;

        const defaultCatOrder = [
            'geology', 'quaternary', 'geophysics', 'seismic',
            'groundwater', 'water', 'water_quality',
            'energy', 'terrain', 'geotechnical', 'geohazards',
            'geoheritage', 'minerals', 'resources',
            'environmental', 'weather', 'flood', 'marine',
            'transport', 'demographics', 'document', 'other',
        ];
        const defaultCatLabels = {
            geology: 'Geology',
            quaternary: 'Quaternary',
            geophysics: 'Geophysics',
            seismic: 'Seismic',
            groundwater: 'Groundwater',
            water: 'Water',
            water_quality: 'Water Quality',
            energy: 'Geothermal & Energy',
            terrain: 'Terrain & Surface',
            geotechnical: 'Geotechnical',
            geohazards: 'Geohazards',
            geoheritage: 'Geoheritage',
            minerals: 'Minerals',
            resources: 'Resources',
            environmental: 'Environmental',
            weather: 'Weather',
            flood: 'Flood',
            marine: 'Marine',
            transport: 'Transport',
            demographics: 'Demographics',
            document: 'Documents',
            other: 'Other',
        };
        const catOrder = Array.isArray(ontologyInventory.category_order) && ontologyInventory.category_order.length
            ? ontologyInventory.category_order
            : defaultCatOrder;
        const catLabels = Object.assign({}, defaultCatLabels, ontologyInventory.category_labels || {});

        for (const catKey of catOrder) {
            const catSources = categories[catKey];
            if (!catSources || !catSources.length) continue;

            const catDiv = document.createElement('div');
            catDiv.className = 'ont-category';

            const catHeader = document.createElement('div');
            catHeader.className = 'ont-cat-header';
            catHeader.textContent = ontologyCategoryLabel(catKey, catLabels) + ' (' + catSources.length + ')';
            catDiv.appendChild(catHeader);

            for (const src of catSources) {
                const row = document.createElement('div');
                row.className = 'ont-row';

                const nameCell = document.createElement('div');
                const nameDiv = document.createElement('div');
                nameDiv.className = 'ont-name';
                nameDiv.textContent = src.name || src.id;
                nameCell.appendChild(nameDiv);
                const provDiv = document.createElement('div');
                provDiv.className = 'ont-provider';
                provDiv.textContent = (src.provider || '') + (src.protocol ? ' \u2022 ' + src.protocol : '');
                nameCell.appendChild(provDiv);
                row.appendChild(nameCell);

                const confCell = document.createElement('span');
                confCell.className = 'ont-confidence';
                if (src.confidence != null) {
                    confCell.textContent = Math.round(src.confidence * 100) + '%';
                } else {
                    confCell.textContent = '\u2014';
                }
                row.appendChild(confCell);

                const protCell = document.createElement('span');
                protCell.className = 'ont-protocol';
                protCell.textContent = src.probe_features != null ? src.probe_features + ' feat' : '\u2014';
                row.appendChild(protCell);

                const statusCell = document.createElement('div');
                statusCell.style.cssText = 'display:flex;align-items:center;gap:6px;';
                const dot = document.createElement('span');
                const cls = probeStatusClass(src.probe_status);
                dot.className = 'ont-status-dot ' + cls;
                dot.title = src.probe_status || 'unknown';
                statusCell.appendChild(dot);

                const href = resolveOntologySourceHref(src);
                if (href) {
                    const link = document.createElement('a');
                    link.className = 'prov-link';
                    link.href = href;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = '\u2197';
                    link.title = 'View source endpoint';
                    statusCell.appendChild(link);
                }
                row.appendChild(statusCell);

                catDiv.appendChild(row);

                if (cls === 'live') liveCount++;
                else if (cls === 'sparse') sparseCount++;
                else if (cls === 'failed') failedCount++;
                else if (cls === 'profiled') profiledCount++;
            }

            body.appendChild(catDiv);
        }

        // Handle any categories not in catOrder
        for (const catKey of Object.keys(categories)) {
            if (!catOrder.includes(catKey)) {
                const catSources = categories[catKey];
                const catDiv = document.createElement('div');
                catDiv.className = 'ont-category';
                const catHeader = document.createElement('div');
                catHeader.className = 'ont-cat-header';
                catHeader.textContent = ontologyCategoryLabel(catKey, catLabels) + ' (' + catSources.length + ')';
                catDiv.appendChild(catHeader);
                for (const src of catSources) {
                    const row = document.createElement('div');
                    row.className = 'ont-row';
                    const nameCell = document.createElement('div');
                    const nameDiv = document.createElement('div');
                    nameDiv.className = 'ont-name';
                    nameDiv.textContent = src.name || src.id;
                    nameCell.appendChild(nameDiv);
                    row.appendChild(nameCell);
                    const confCell = document.createElement('span');
                    confCell.className = 'ont-confidence';
                    confCell.textContent = src.confidence != null ? Math.round(src.confidence * 100) + '%' : '\u2014';
                    row.appendChild(confCell);
                    const protCell = document.createElement('span');
                    protCell.className = 'ont-protocol';
                    protCell.textContent = '\u2014';
                    row.appendChild(protCell);
                    const statusCell = document.createElement('div');
                    const dot = document.createElement('span');
                    const cls = probeStatusClass(src.probe_status);
                    dot.className = 'ont-status-dot ' + cls;
                    statusCell.appendChild(dot);
                    row.appendChild(statusCell);
                    catDiv.appendChild(row);
                    if (cls === 'live') liveCount++;
                    else if (cls === 'sparse') sparseCount++;
                    else if (cls === 'failed') failedCount++;
                    else if (cls === 'profiled') profiledCount++;
                }
                body.appendChild(catDiv);
            }
        }

        // Summary
        const summaryEl = document.getElementById('ont-summary');
        summaryEl.textContent = '\u2014 ' + sources.length + ' sources \u00B7 ' + (ontologyInventory.api_sources || 0) + ' APIs \u00B7 ' + (ontologyInventory.document_sources || 0) + ' documents';

        // Footer stats
        const statsEl = document.getElementById('ont-stats');
        while (statsEl.firstChild) statsEl.removeChild(statsEl.firstChild);

        function addStat(dotCls, label) {
            const span = document.createElement('span');
            span.className = 'ont-stat';
            const dotEl = document.createElement('span');
            dotEl.className = 'dot ' + dotCls;
            span.appendChild(dotEl);
            span.appendChild(document.createTextNode(label));
            statsEl.appendChild(span);
        }

        addStat('live', liveCount + ' live');
        if (sparseCount) addStat('sparse', sparseCount + ' sparse');
        if (failedCount) addStat('failed', failedCount + ' failed');
        if (profiledCount) addStat('profiled', profiledCount + ' profiled');
    }
}
