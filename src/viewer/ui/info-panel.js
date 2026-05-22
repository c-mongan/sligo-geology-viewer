// ── Info panel & extended tooltip content (split from drill.js + tooltips.js) ──
import { state } from '../state.js';
import { COLORS, NAMES, DATA_PROVENANCE } from '../config.js';
import { trackEvent } from '../analytics.js';
import { coordinateInfoForFeature } from '../utils.js';
import { resolveFeatureOntologyIds, appendInfoPanelOntology } from './ontology-utils.js';

const FEATURE_DATASET_NAMES = {
    formation: '3D Geological Interpretation',
    srsc_column: '3D Geological Interpretation',
    depthslice: 'Voxel Model',
    borehole: 'Borehole Array',
    bh_marker: 'Borehole Array',
    bh_array_envelope: 'Borehole Array',
    proposed_site: 'Borehole Array',
    srsc: 'GEMINI Project Site',
    gemini_site: 'GEMINI Project Site',
    karst: 'Karst Features',
    dyetrace: 'Karst Features',
    karst_connection: 'Karst Features',
    gsi_well: 'Groundwater Wells',
    geotech: 'Geotechnical Boreholes',
    structural: 'Bedrock Structural Measurements',
    bedrock_geol: 'Bedrock Structural Measurements',
    vulnerability: 'Groundwater Vulnerability',
    subsoil: 'Subsoil Permeability',
    aquifer: 'Aquifer Classification',
    recharge: 'Groundwater Recharge',
    'gshp-closed': 'Geothermal Closed Loop',
    'gshp-open-dom': 'Open Loop Domestic',
    'gshp-open-com': 'Open Loop Commercial',
    thermal_cond: 'Thermal Conductivity',
    temp_depth: 'Temperature at Depth',
    bedrock_bh: 'Verified Boreholes',
    bedrock_bh_unverified: 'Unverified Bedrock Boreholes',
    bedrock_cross_section: 'GSI Bedrock Cross-Section',
    landslide_loc: 'Landslide Locations',
    mineral: 'Mineral Locations',
    hist_inv: 'GSI Site Investigation Areas',
    quaternary: 'Quaternary Sediments',
    hydrostrat: 'Hydrostratigraphic Units',
    'landslide-susc': 'Landslide Susceptibility',
    geoheritage: 'Geoheritage Sites',
};

const FEATURE_DATASET_OVERRIDES = {
    heat_flow: {
        name: 'GSI/DIAS Surface Heat Flow 100K',
        badge: 'GSI/DIAS',
        trust: 'observed',
        confidence: 'high',
        source: 'https://gsi.geodata.gov.ie/server/rest/services/Energy/',
    },
};

function datasetForFeature(data) {
    const override = FEATURE_DATASET_OVERRIDES[data.type];
    if (override) return override;
    const name = FEATURE_DATASET_NAMES[data.type];
    if (!name) return null;
    return DATA_PROVENANCE.datasets.find(d => d.name === name) || { name };
}

function sourceLabel(dataset) {
    if (!dataset) return null;
    const seen = new Set();
    const parts = [dataset.badge, dataset.trust, dataset.confidence]
        .filter(Boolean)
        .map(part => String(part).replace(/_/g, ' '))
        .filter(part => {
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    return parts.length ? `${dataset.name} (${parts.join(' / ')})` : dataset.name;
}

function linkValue(label, href) {
    return { label, href };
}

export function buildTooltipSource(tooltip, text) {
    const srcDiv = document.createElement('div');
    srcDiv.style.cssText = 'margin-top:6px;padding-top:4px;border-top:1px solid #30363d;font-size:9px;color:#7d8590';
    srcDiv.textContent = text;
    tooltip.appendChild(srcDiv);
}

/**
 * Build hover tooltip content for extended marker types.
 * Called from initTooltips for types not handled in the primary batch.
 */
export function buildExtendedTooltipContent(tooltip, d) {
    const pushVisualOffset = (rows) => {
        if (Number.isFinite(Number(d.visualOffsetM))) {
            rows.push(['Display offset', `${d.visualOffsetM}m from co-located source point`]);
        }
    };

    if (d.type === 'thermal_cond') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#ff6b35';
        title.textContent = 'Thermal Conductivity';
        tooltip.appendChild(title);
        const rows = [
            ['Value', d.conductivity.toFixed(2) + ' W/mK'],
            ['Borehole', d.name],
            ['Depth', (d.topDepth || '?') + ' - ' + (d.baseDepth || '?') + ' m'],
            ['Measurements', d.measurements || 'N/A'],
        ];
        pushVisualOffset(rows);
        for (const [label, val] of rows) {
            const r = document.createElement('div');
            r.className = 'tt-row';
            r.textContent = label + ': ';
            const s = document.createElement('span');
            s.textContent = val;
            r.appendChild(s);
            tooltip.appendChild(r);
        }
        buildTooltipSource(tooltip, 'Source: GSI Geothermal Thermal Conductivity 100K');
    } else if (d.type === 'temp_depth') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#e63946';
        title.textContent = 'Temperature at Depth';
        tooltip.appendChild(title);
        const rows = [
            ['Temperature', d.temperature.toFixed(1) + '\u00B0C'],
            ['Depth', d.depth + ' m'],
            ['Gradient', d.gradient ? d.gradient.toFixed(1) + ' \u00B0C/km' : 'N/A'],
            ['Borehole', d.name],
            ['Type', d.observationType || 'Unknown'],
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
        buildTooltipSource(tooltip, 'Source: GSI Geothermal Temperature 100K');
    } else if (d.type === 'heat_flow') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#ff00ff';
        title.textContent = 'Surface Heat Flow';
        tooltip.appendChild(title);
        const rows = [
            ['Heat flow', d.heatFlow_mW != null ? d.heatFlow_mW + ' mW/m\u00B2' : 'Unknown'],
            ['Correction', d.correction != null ? d.correction + ' mW/m\u00B2' : 'Unknown'],
            ['Error', d.error != null ? d.error + ' mW/m\u00B2' : 'Unknown'],
            ['Depth', (d.topDepth ?? '?') + ' - ' + (d.baseDepth ?? '?') + ' m'],
        ];
        for (const [label, val] of rows) {
            const r = document.createElement('div');
            r.className = 'tt-row';
            r.textContent = label + ': ' + val;
            tooltip.appendChild(r);
        }
        buildTooltipSource(tooltip, 'Source: GSI/DIAS Surface Heat Flow 100K');
    } else if (d.type === 'bh_marker') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#3fb950';
        title.textContent = d.id;
        tooltip.appendChild(title);
        const rows = [
            ['Extraction', d.kW + ' kW (' + d.Wm + ' W/m)'],
            ['Temp at 200m', d.temp + '\u00B0C'],
            ['Karst risk', d.risk],
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
        buildTooltipSource(tooltip, 'Source: GEMINI Project / ATU PMP Training Document');
    } else if (d.type === 'bedrock_geol') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#ffa657';
        title.textContent = 'Bedrock: Strike ' + d.strike + '\u00B0 / Dip ' + d.dip + '\u00B0';
        tooltip.appendChild(title);
        if (d.desc) {
            const r = document.createElement('div');
            r.className = 'tt-row';
            r.textContent = d.desc;
            tooltip.appendChild(r);
        }
        buildTooltipSource(tooltip, 'Source: GSI Bedrock Geology 100K');
    } else if (d.type === 'bedrock_bh') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#7ee787';
        title.textContent = d.name || 'Verified Borehole';
        tooltip.appendChild(title);
        const r = document.createElement('div');
        r.className = 'tt-row';
        r.textContent = 'Depth: ' + (d.depth || '?') + 'm';
        tooltip.appendChild(r);
        if (d.comments) {
            const r2 = document.createElement('div');
            r2.className = 'tt-row';
            r2.textContent = d.comments;
            tooltip.appendChild(r2);
        }
        buildTooltipSource(tooltip, 'Source: GSI Bedrock Boreholes / Geotechnical Boreholes');
    } else if (d.type === 'bedrock_bh_unverified') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#d29922';
        title.textContent = d.name || 'Unverified Borehole';
        tooltip.appendChild(title);
        const rows = [
            ['Depth', d.depth ? d.depth + 'm' : 'Unknown'],
            ['Rockhead', d.rockhead != null ? d.rockhead + 'm' : 'Unknown'],
        ];
        pushVisualOffset(rows);
        for (const [label, val] of rows) {
            const r = document.createElement('div');
            r.className = 'tt-row';
            r.textContent = label + ': ' + val;
            tooltip.appendChild(r);
        }
        buildTooltipSource(tooltip, 'Source: GSI unverified bedrock boreholes');
    } else if (d.type === 'bedrock_cross_section') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#f778ba';
        title.textContent = d.name || 'GSI Bedrock Cross-Section';
        tooltip.appendChild(title);
        const r = document.createElement('div');
        r.className = 'tt-row';
        r.textContent = d.lengthM ? 'Length: ' + (d.lengthM / 1000).toFixed(1) + 'km' : 'Official GSI interpreted section';
        tooltip.appendChild(r);
        buildTooltipSource(tooltip, 'Source: GSI bedrock cross-sections');
    } else if (d.type === 'landslide_loc') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#f85149';
        title.textContent = d.name || 'Landslide Event';
        tooltip.appendChild(title);
        const rows = [];
        if (d.date) rows.push(['Date', d.date]);
        if (d.status) rows.push(['Status', d.status]);
        if (d.length) rows.push(['Length', d.length + 'm']);
        for (const [label, val] of rows) {
            const r = document.createElement('div');
            r.className = 'tt-row';
            r.textContent = label + ': ';
            const s = document.createElement('span');
            s.textContent = val;
            r.appendChild(s);
            tooltip.appendChild(r);
        }
        buildTooltipSource(tooltip, 'Source: GSI Landslide Locations 5K');
    } else if (d.type === 'mineral') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#DDA0DD';
        title.textContent = d.mineral || 'Mineral Occurrence';
        tooltip.appendChild(title);
        const rows = [['Type', d.minType]];
        if (d.townland) rows.push(['Townland', d.townland]);
        pushVisualOffset(rows);
        if (d.desc) rows.push(['', d.desc]);
        for (const [label, val] of rows) {
            const r = document.createElement('div');
            r.className = 'tt-row';
            r.textContent = label ? label + ': ' + val : val;
            tooltip.appendChild(r);
        }
        buildTooltipSource(tooltip, 'Source: GSI Mineral Locations');
    } else if (d.type === 'hist_inv') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#b8860b';
        title.textContent = d.name;
        tooltip.appendChild(title);
        const rows = [
            ['Source', d.source],
            ['Type', d.invType],
        ];
        if (d.bedrockDepth != null) rows.push(['Bedrock depth', d.bedrockDepth + 'm']);
        if (d.bedrockType) rows.push(['Bedrock', d.bedrockType]);
        if (d.gwLevel != null) rows.push(['GW level', d.gwLevel + 'm']);
        if (d.date) rows.push(['Date', d.date]);
        for (const [label, val] of rows) {
            const r = document.createElement('div');
            r.className = 'tt-row';
            r.textContent = label + ': ' + val;
            tooltip.appendChild(r);
        }
    } else if (d.type === 'gemini_site') {
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.style.color = '#3fb950';
        title.textContent = d.name + ' \u2014 ' + d.desc;
        tooltip.appendChild(title);
        const details = [d.boreholes, d.heatPump, d.lead];
        for (const detail of details) {
            const r = document.createElement('div');
            r.className = 'tt-row';
            r.textContent = detail;
            tooltip.appendChild(r);
        }
        buildTooltipSource(tooltip, 'Source: GEMINI Project / ATU PMP Training Document');
    } else if (d.catName) {
        // Generic overlay tooltip
        const title = document.createElement('div');
        title.className = 'tt-title';
        title.textContent = d.catName;
        tooltip.appendChild(title);
        const r = document.createElement('div');
        r.className = 'tt-row';
        r.textContent = 'Layer: ' + d.type;
        tooltip.appendChild(r);
        const genericSources = {
            'fault': 'GSI Bedrock Geology 100K (Sheet 7)',
            'geoheritage': 'GSI Geoheritage Audited Sites',
            'hydrostrat': 'GSI Hydrostratigraphic Classification',
            'landslide-susc': 'GSI Landslide Susceptibility',
            'quaternary': 'GSI Quaternary Sediments 100K',
            'recharge': 'GSI Groundwater Recharge',
        };
        const srcText = genericSources[d.type] || 'GSI Open Data';
        buildTooltipSource(tooltip, 'Source: ' + srcText);
    }
}

// ── showInfoPanel ───────────────────────────────────

export function showInfoPanel(data) {
    const infoPanel = document.getElementById('info-panel');
    const ipTitle = document.getElementById('ip-title');
    const ipBody = document.getElementById('ip-body');
    const drillPanel = document.getElementById('drill-panel');

    trackEvent('feature_inspected', { type: data.type, name: data.name || data.id || data.cat || '' });
    trackEvent('panel_opened', { panel_name: 'info' });
    drillPanel.style.display = 'none';
    while (ipBody.firstChild) ipBody.removeChild(ipBody.firstChild);
    let title = '', rows = [];

    if (data.type === 'formation') {
        title = data.name;
        ipTitle.style.color = COLORS[data.code] || '#e6edf3';
        const fm = state.metadata.formations.find(f => f.code === data.code);
        rows = [
            ['Rock type', data.rockType],
            ['Typical thickness', '~' + data.thickness + 'm'],
            ['Thermal conductivity', data.conductivity + ' W/mK'],
            ['Aquifer class', fm ? fm.aquifer_class : '\u2014'],
            ['Rock unit', fm ? fm.rock_unit : '\u2014'],
            ['Description', fm ? fm.description : '\u2014'],
        ];
    } else if (data.type === 'borehole' || data.type === 'bh_marker') {
        title = 'Design BHE ' + data.id;
        ipTitle.style.color = '#3fb950';
        const surfaceT = 10;
        const temp = Number(data.temp);
        const gradient = Number.isFinite(temp) && data.depth ? ((temp - surfaceT) / data.depth * 1000).toFixed(1) : '\u2014';
        rows = [
            ['Depth', data.depth + 'm'],
            ['Bottom temperature', Number.isFinite(temp) ? temp.toFixed(1) + '\u00B0C' : '\u2014'],
            ['Geothermal gradient', gradient === '\u2014' ? '\u2014' : gradient + '\u00B0C/km'],
            ['Heat extraction', Number.isFinite(Number(data.kW)) ? Number(data.kW).toFixed(1) + ' kW' : '\u2014'],
            ['Karst risk', data.risk],
            ['Formations penetrated', (data.formations || []).map(c => NAMES[c] || c).join(', ')],
            ['Status', 'Synthetic design scenario, not an observed borehole'],
        ];
    } else if (data.type === 'bh_array_envelope') {
        title = 'Design BHE Field';
        ipTitle.style.color = '#3fb950';
        rows = [
            ['Boreholes', data.boreholes || '\u2014'],
            ['Approx. footprint', data.width && data.depth ? data.width + 'm x ' + data.depth + 'm' : '\u2014'],
            ['Status', 'Conceptual closed-loop borehole field envelope'],
        ];
    } else if (data.type === 'proposed_site') {
        title = data.title || 'Proposed Site';
        ipTitle.style.color = '#7ee787';
        rows = [
            ['Detail', data.detail || 'Conceptual closed-loop BHE design envelope'],
            ['Status', 'Design scenario, not observed construction'],
        ];
        if (data.coordSource) rows.push(['Interpretation source', data.coordSource]);
        if (data.coordAccuracy) rows.push(['Confidence', data.coordAccuracy]);
    } else if (data.type === 'karst') {
        title = data.name || 'Karst Feature';
        ipTitle.style.color = '#f0883e';
        rows = [
            ['Type', data.karstType],
            ['ID', data.id],
        ];
        if (Number.isFinite(Number(data.distance))) rows.push(['Distance to SRSC', data.distance + 'm']);
        if (data.details) rows.push(['Details', data.details]);
        if (data.comments) rows.push(['Comments', data.comments]);
        if (data.county) rows.push(['County', data.county]);
        if (data.sourceDataset) rows.push(['GSI source note', data.sourceDataset]);
        if (data.temp) rows.push(['Temperature', data.temp + '\u00B0C']);
    } else if (data.type === 'dyetrace') {
        title = data.name || 'Dye Trace';
        ipTitle.style.color = '#a371f7';
        rows = [
            ['Endpoint', data.endpoint || 'Path'],
            ['Length', data.length ? data.length + ' m' : '\u2014'],
            ['Date', data.date || '\u2014'],
            ['Result', data.result || '\u2014'],
        ];
    } else if (data.type === 'karst_connection') {
        title = 'Karst Connection';
        ipTitle.style.color = '#00ffcc';
        rows = [
            ['Input site', data.input || '\u2014'],
            ['Output site', data.output || '\u2014'],
        ];
    } else if (data.type === 'gsi_well') {
        title = data.name || 'GSI Well';
        ipTitle.style.color = '#79c0ff';
        rows = [
            ['Type', data.wellType],
            ['ID', data.id],
        ];
        if (data.depth) rows.push(['Depth', data.depth + 'm']);
        if (data.dtb) rows.push(['Depth to bedrock', data.dtb + 'm']);
        if (data.yield_m3d) rows.push(['Yield', data.yield_m3d + ' m\u00B3/d']);
        if (data.notes) rows.push(['Notes', data.notes]);
    } else if (data.type === 'geotech') {
        title = data.project || 'Geotechnical Investigation';
        ipTitle.style.color = '#d2a8ff';
        rows = [
            ['Report', data.report || '\u2014'],
            ['Boreholes', data.count || '\u2014'],
            ['Depth range', data.depthRange || '\u2014'],
            ['Bedrock met', data.bedrockMet || '\u2014'],
        ];
        if (data.confidenceNote) rows.push(['Confidence', data.confidenceNote]);
        if (data.pdfUrl) rows.push(['PDF', data.pdfUrl]);
    } else if (data.type === 'srsc') {
        title = 'SRSC \u2014 Sligo Regional Sports Centre';
        ipTitle.style.color = '#f85149';
        rows = [
            ['Proposed array', '48 boreholes to 200m'],
            ['Total extraction', state.boreholeData.reduce((s, b) => s + b.heat_extraction_kW, 0).toFixed(0) + ' kW'],
            ['Bedrock', 'Dartry Limestone (Rkc)'],
            ['Vulnerability', 'X \u2014 Rock at or near surface'],
            ['Nearest karst', '1,091m (Foxes Den Cave)'],
        ];
    } else if (data.type === 'srsc_column') {
        title = data.formation || 'Formation at SRSC';
        ipTitle.style.color = COLORS[data.code] || '#e6edf3';
        rows = [
            ['Rock type', data.rockType || '\u2014'],
            ['Top depth', data.depthTop != null ? Math.abs(data.depthTop).toFixed(0) + ' m' : '\u2014'],
            ['Base depth', data.depthBot != null ? Math.abs(data.depthBot).toFixed(0) + ' m' : '\u2014'],
        ];
    } else if (data.type === 'depthslice') {
        title = data.formation || 'Depth Slice';
        ipTitle.style.color = COLORS[data.code] || '#e6edf3';
        rows = [
            ['Formation', data.formation || '\u2014'],
            ['Slice depth', data.depth != null ? Math.abs(data.depth) + ' m' : '\u2014'],
        ];
    } else if (data.type === 'thermal_cond') {
        title = data.name || 'Thermal Conductivity';
        ipTitle.style.color = '#ff6b35';
        rows = [
            ['Conductivity', (data.conductivity || 0).toFixed(2) + ' W/m\u00B7K'],
            ['Depth range', (data.topDepth || '?') + ' \u2013 ' + (data.baseDepth || '?') + ' m'],
            ['Measurements', data.measurements || '\u2014'],
            ['Source', data.source || '\u2014'],
        ];
        if (Number.isFinite(Number(data.visualOffsetM))) rows.push(['Display offset', `${data.visualOffsetM} m from co-located source point`]);
    } else if (data.type === 'temp_depth') {
        title = data.name || 'Temperature';
        ipTitle.style.color = '#e63946';
        rows = [
            ['Rock temperature', (data.temperature || 0).toFixed(1) + '\u00B0C'],
            ['Depth', (data.depth || 0) + ' m'],
            ['Gradient', data.gradient ? data.gradient.toFixed(1) + ' \u00B0C/km' : '\u2014'],
            ['Surface temp', data.surfaceTemp ? data.surfaceTemp + '\u00B0C' : '\u2014'],
        ];
    } else if (data.type === 'heat_flow') {
        title = 'Surface Heat Flow';
        ipTitle.style.color = '#ff00ff';
        rows = [
            ['Heat flow', data.heatFlow_mW != null ? data.heatFlow_mW + ' mW/m\u00B2' : '\u2014'],
            ['Correction', data.correction != null ? data.correction + ' mW/m\u00B2' : '\u2014'],
            ['Error', data.error != null ? data.error + ' mW/m\u00B2' : '\u2014'],
            ['Depth range', (data.topDepth ?? '\u2014') + ' \u2013 ' + (data.baseDepth ?? '\u2014') + ' m'],
        ];
    } else if (data.type === 'bedrock_geol' || data.type === 'structural') {
        title = 'Structural Measurement';
        ipTitle.style.color = '#ffa657';
        rows = [
            ['Strike', data.strike + '\u00B0'],
            ['Dip', data.dip + '\u00B0'],
            ['Description', data.desc || '\u2014'],
        ];
    } else if (data.type === 'bedrock_bh') {
        title = data.name || 'Verified Borehole';
        ipTitle.style.color = '#7ee787';
        rows = [
            ['Depth', (data.depth || 0) + ' m'],
            ['County', data.county || '\u2014'],
            ['Comments', data.comments || '\u2014'],
        ];
        if (data.logUrl) rows.push(['Log', data.logUrl]);
    } else if (data.type === 'bedrock_bh_unverified') {
        title = data.name || 'Unverified Borehole';
        ipTitle.style.color = '#d29922';
        rows = [
            ['Depth', data.depth ? data.depth + ' m' : '\u2014'],
            ['Rockhead', data.rockhead != null ? data.rockhead + ' m' : '\u2014'],
            ['Company', data.company || '\u2014'],
            ['Year', data.year || '\u2014'],
            ['Lithology top', data.lithTop || '\u2014'],
            ['Lithology base', data.lithBase || '\u2014'],
            ['Stratigraphy base', data.stratBase || '\u2014'],
            ['Confidence', data.confidenceNote || 'Unverified GSI source record'],
        ];
        if (Number.isFinite(Number(data.visualOffsetM))) rows.push(['Display offset', `${data.visualOffsetM} m from co-located source point`]);
    } else if (data.type === 'bedrock_cross_section') {
        title = data.name || 'GSI Bedrock Cross-Section';
        ipTitle.style.color = '#f778ba';
        rows = [
            ['Section', data.sectionId || '\u2014'],
            ['Sheet', data.sheet || '\u2014'],
            ['Length', data.lengthM ? (data.lengthM / 1000).toFixed(1) + ' km' : '\u2014'],
        ];
        if (data.pdfUrl) rows.push(['Source PDF', linkValue('Open GSI PDF', data.pdfUrl)]);
    } else if (data.type === 'landslide_loc') {
        title = data.name || 'Landslide Event';
        ipTitle.style.color = '#f85149';
        rows = [
            ['Date', data.date || '\u2014'],
            ['Status', data.status || '\u2014'],
            ['Length', data.length ? data.length + ' m' : '\u2014'],
            ['Shape', data.shape || '\u2014'],
            ['Comment', data.comment || '\u2014'],
        ];
    } else if (data.type === 'mineral') {
        title = data.mineral || 'Mineral Occurrence';
        ipTitle.style.color = '#DDA0DD';
        rows = [
            ['Type', data.minType || '\u2014'],
            ['Townland', data.townland || '\u2014'],
            ['Description', data.desc || '\u2014'],
            ['Notes', data.notes || '\u2014'],
        ];
        if (Number.isFinite(Number(data.visualOffsetM))) rows.push(['Display offset', `${data.visualOffsetM} m from co-located source point`]);
    } else if (data.type === 'hist_inv') {
        title = data.name || 'IGSL Investigation';
        ipTitle.style.color = '#b8860b';
        rows = [
            ['Source report', data.source || '\u2014'],
            ['Investigation type', data.invType || '\u2014'],
            ['Bedrock depth', data.bedrockDepth != null ? data.bedrockDepth + ' m' : '\u2014'],
            ['Bedrock type', data.bedrockType || '\u2014'],
            ['GW level', data.gwLevel != null ? data.gwLevel + ' m' : '\u2014'],
            ['Date', data.date || '\u2014'],
        ];
    } else if (data.type === 'gemini_site') {
        title = data.name + ' \u2014 ' + data.desc;
        ipTitle.style.color = '#3fb950';
        rows = [
            ['Boreholes', data.boreholes],
            ['Heat pump', data.heatPump],
            ['Consortium', data.lead],
        ];
    } else if (data.type && data.catName) {
        // Generic overlay polygon click
        title = data.catName;
        ipTitle.style.color = '#c9d1d9';
        rows = [
            ['Category', data.cat || '\u2014'],
            ['Layer', data.type || '\u2014'],
        ];
    } else {
        return;
    }

    const coordInfo = coordinateInfoForFeature(data);
    if (coordInfo) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${coordInfo.lat.toFixed(7)},${coordInfo.lon.toFixed(7)}`;
        rows.push(
            ['Lat/Lon', `${coordInfo.lat.toFixed(6)}, ${coordInfo.lon.toFixed(6)}`],
            ['ITM', `${coordInfo.itmX.toFixed(1)}, ${coordInfo.itmY.toFixed(1)}`],
            ['Coordinate source', coordInfo.source],
            ['Google Maps', linkValue('Open exact point', mapsUrl)],
        );
        if (coordInfo.accuracy) rows.push(['Coordinate accuracy', coordInfo.accuracy]);
    }

    const dataset = datasetForFeature(data);
    if (dataset) {
        rows.push(['Dataset', sourceLabel(dataset)]);
        if (dataset.lineage) rows.push(['Viewer file', dataset.lineage]);
        if (dataset.source) rows.push(['Source service', linkValue('Open source', dataset.source)]);
    }

    ipTitle.textContent = title;
    for (const [label, value] of rows) {
        const row = document.createElement('div');
        row.className = 'ip-row';
        const lbl = document.createElement('span');
        lbl.className = 'ip-label';
        lbl.textContent = label;
        const val = document.createElement('span');
        val.className = 'ip-value';
        if (value && typeof value === 'object' && value.href) {
            const a = document.createElement('a');
            a.href = value.href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = value.label || value.href;
            val.appendChild(a);
        } else {
            val.textContent = value;
        }
        if (label === 'Karst risk') {
            val.style.color = value === 'high' ? '#f85149' : value === 'medium' ? '#d29922' : '#3fb950';
        }
        row.append(lbl, val);
        ipBody.appendChild(row);
    }
    const ontologyRequestId = ++state.infoPanelOntologyNonce;
    appendInfoPanelOntology(data, ontologyRequestId);
    infoPanel.style.display = 'block';
}
