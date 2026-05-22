import { state } from '../state.js';
import { loadJSON } from '../loader.js';
import { FEATURE_ONTOLOGY_SOURCE_IDS } from '../config.js';
import { trackEvent } from '../analytics.js';

let ontologyInventory = null;
let ontologyInventoryIndex = new Map();
let ontologyInventoryPromise = null;

export function setOntologyInventory(data) {
    ontologyInventory = data || null;
    ontologyInventoryIndex = new Map();
    for (const src of (ontologyInventory?.sources || [])) {
        if (src && src.id) ontologyInventoryIndex.set(src.id, src);
    }
    return ontologyInventory;
}

export function getOntologyInventory() {
    return ontologyInventory;
}

export function ensureOntologyInventoryLoaded() {
    if (ontologyInventory?.sources) return Promise.resolve(ontologyInventory);
    if (ontologyInventoryPromise) return ontologyInventoryPromise;
    ontologyInventoryPromise = loadJSON(
        '../json/source_inventory.json',
        ['ontology__sligo-digital-twin__latest__ontology__source_inventory']
    ).then(data => {
        ontologyInventoryPromise = null;
        if (!data || !Array.isArray(data.sources)) {
            console.warn('[ontology] source_inventory.json loaded but has no sources array');
        }
        return setOntologyInventory(data);
    }).catch(err => {
        ontologyInventoryPromise = null;
        console.error('[ontology] Failed to load source_inventory.json:', err.message || err);
        throw err;
    });
    return ontologyInventoryPromise;
}

export function resolveOntologySourceHref(src) {
    const raw = src && src.base_url ? String(src.base_url) : '';
    if (!raw) return raw;
    if (/\/(MapServer|FeatureServer|ImageServer)(?:\/)?$/i.test(raw)) return raw;
    if ((src && typeof src.protocol === 'string' && src.protocol.startsWith('ArcGIS REST'))
        || /\/server\/rest\/services\//i.test(raw)) {
        return raw.replace(/\/+$/, '') + '/MapServer';
    }
    return raw;
}

export function resolveFeatureOntologyIds(data) {
    if (!data) return [];
    if (Array.isArray(data.ontologySourceIds) && data.ontologySourceIds.length) {
        return data.ontologySourceIds;
    }
    const mapped = FEATURE_ONTOLOGY_SOURCE_IDS[data.type] || [];
    const ids = [...new Set(mapped.filter(Boolean))];
    if (ids.length) data.ontologySourceIds = ids;
    return ids;
}

export function getOntologySourcesForFeature(data) {
    const ids = resolveFeatureOntologyIds(data);
    return ids.map(id => ontologyInventoryIndex.get(id)).filter(Boolean);
}

export function resolvePickedData(hit) {
    let data = hit?.object?.userData || null;
    // Generic InstancedMesh resolution: works for minerals, boreholes, caps, etc.
    if (data && hit.instanceId != null && data.instances) {
        data = data.instances[hit.instanceId] || data;
    }
    if (!data) return null;

    const pickedPoint = hit?.point
        ? { x: hit.point.x, y: hit.point.y, z: hit.point.z }
        : null;
    const resolved = pickedPoint ? { ...data, pickedPoint } : data;
    resolveFeatureOntologyIds(resolved);
    return resolved;
}

export function describeFeatureOntologySummary(data) {
    const ids = resolveFeatureOntologyIds(data);
    if (!ids.length) return '';
    const sources = getOntologySourcesForFeature(data);
    if (!sources.length) {
        return 'Ontology: ' + ids.length + ' linked source' + (ids.length === 1 ? '' : 's');
    }
    const names = sources.slice(0, 2).map(src => src.name).filter(Boolean);
    if (!names.length) {
        return 'Ontology: ' + ids.length + ' linked source' + (ids.length === 1 ? '' : 's');
    }
    return 'Ontology: ' + names.join(' • ') + (sources.length > 2 ? ' +' + (sources.length - 2) + ' more' : '');
}

export function buildOntologyInfoItem(src) {
    const item = document.createElement('div');
    item.className = 'ip-source-item';

    const head = document.createElement('div');
    head.className = 'ip-source-head';

    const href = resolveOntologySourceHref(src);
    const nameEl = href ? document.createElement('a') : document.createElement('div');
    nameEl.className = 'ip-source-name';
    nameEl.textContent = src.name || src.id;
    if (href) {
        nameEl.href = href;
        nameEl.target = '_blank';
        nameEl.rel = 'noopener noreferrer';
        nameEl.addEventListener('click', () => {
            trackEvent('ontology_source_opened_from_feature', { source_id: src.id, url: href });
        });
    }
    head.appendChild(nameEl);

    if (href) {
        const linkEl = document.createElement('a');
        linkEl.className = 'ip-source-link';
        linkEl.href = href;
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.textContent = '↗';
        linkEl.addEventListener('click', () => {
            trackEvent('ontology_source_opened_from_feature', { source_id: src.id, url: href });
        });
        head.appendChild(linkEl);
    }
    item.appendChild(head);

    const metaParts = [
        src.provider,
        src.protocol,
        src.confidence != null ? Math.round(src.confidence * 100) + '% confidence' : null,
    ].filter(Boolean);
    if (metaParts.length) {
        const meta = document.createElement('div');
        meta.className = 'ip-source-meta';
        meta.textContent = metaParts.join(' • ');
        item.appendChild(meta);
    }

    const detailLines = [];
    if (src.viewer_file) detailLines.push('Viewer: ' + src.viewer_file);
    if (src.local_copy) detailLines.push('Local: ' + src.local_copy);
    if (!detailLines.length && src.backend_module) {
        detailLines.push('Backend: ' + src.backend_module + (src.backend_function ? '#' + src.backend_function : ''));
    }
    for (const line of detailLines.slice(0, 2)) {
        const detail = document.createElement('div');
        detail.className = 'ip-source-detail';
        detail.textContent = line;
        item.appendChild(detail);
    }

    return item;
}

export function appendInfoPanelOntology(data, requestId) {
    const ids = resolveFeatureOntologyIds(data);
    if (!ids.length) return;

    const ipBody = document.getElementById('ip-body');

    const divider = document.createElement('div');
    divider.className = 'ip-divider';
    ipBody.appendChild(divider);

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'ip-section-title';
    sectionTitle.textContent = 'Linked Ontology Sources';
    ipBody.appendChild(sectionTitle);

    const note = document.createElement('div');
    note.className = 'ip-note';
    note.textContent = ontologyInventory?.sources ? 'Matching linked sources…' : 'Loading linked ontology sources…';
    ipBody.appendChild(note);

    const list = document.createElement('div');
    list.className = 'ip-source-list';
    ipBody.appendChild(list);

    const render = () => {
        if (requestId !== state.infoPanelOntologyNonce) return;
        while (list.firstChild) list.removeChild(list.firstChild);
        const sources = getOntologySourcesForFeature(data);
        if (!sources.length) {
            note.textContent = 'No ontology source records were resolved for this feature.';
            return;
        }
        note.remove();
        for (const src of sources) {
            list.appendChild(buildOntologyInfoItem(src));
        }
    };

    if (ontologyInventory?.sources) {
        render();
        return;
    }

    ensureOntologyInventoryLoaded().then(render).catch(err => {
        if (requestId !== state.infoPanelOntologyNonce) return;
        console.warn('[ontology] Info panel ontology load failed:', err.message || err);
        note.textContent = '';

        const errText = document.createElement('span');
        errText.textContent = 'Unable to load ontology sources. ';
        note.appendChild(errText);

        const retryLink = document.createElement('a');
        retryLink.textContent = 'Retry';
        retryLink.href = '#';
        retryLink.style.cssText = 'color:#58a6ff;cursor:pointer;text-decoration:underline;';
        retryLink.addEventListener('click', (e) => {
            e.preventDefault();
            note.textContent = 'Loading linked ontology sources…';
            ensureOntologyInventoryLoaded().then(render).catch(err2 => {
                if (requestId !== state.infoPanelOntologyNonce) return;
                note.textContent = 'Failed: ' + (err2.message || err2);
            });
        });
        note.appendChild(retryLink);
        note.title = String(err && err.message ? err.message : err);
    });
}
