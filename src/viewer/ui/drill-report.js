// ── Drill report & geothermal utilities (split from drill.js) ──
import { state } from '../state.js';
import { trackEvent } from '../analytics.js';

// ── Geothermal utility functions ────────────────────

export function nearestGridIndex(grid, value) {
    if (!Array.isArray(grid) || !grid.length || !Number.isFinite(value)) return -1;
    const min = Math.min(grid[0], grid[grid.length - 1]);
    const max = Math.max(grid[0], grid[grid.length - 1]);
    if (value < min || value > max) return -1;
    if (grid.length === 1) return 0;
    const step = (grid[grid.length - 1] - grid[0]) / (grid.length - 1);
    if (Number.isFinite(step) && Math.abs(step) > 0) {
        const idx = Math.round((value - grid[0]) / step);
        return Math.max(0, Math.min(grid.length - 1, idx));
    }
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < grid.length; i++) {
        const dist = Math.abs(grid[i] - value);
        if (dist < nearestDist) {
            nearest = i;
            nearestDist = dist;
        }
    }
    return nearest;
}

export function sampleFormationCodeAt(itmX, itmY, elev) {
    if (!state.voxelData || !Array.isArray(state.voxelData.x_grid) || !Array.isArray(state.voxelData.y_grid) || !Array.isArray(state.voxelData.z_grid)) {
        return null;
    }
    const ids = state.voxelData.formation_ids;
    if (!Array.isArray(ids)) return null;

    const xi = nearestGridIndex(state.voxelData.x_grid, itmX);
    const yi = nearestGridIndex(state.voxelData.y_grid, itmY);
    const zi = nearestGridIndex(state.voxelData.z_grid, elev);
    if (xi < 0 || yi < 0 || zi < 0) return null;

    const fmIndex = ids?.[xi]?.[yi]?.[zi];
    if (!Number.isInteger(fmIndex) || fmIndex < 0) return null;
    return state.metadata?.formations?.[fmIndex]?.code || null;
}

function pointInPolygon(px, py, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if (((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

const GSHP_NAMES = {
    '5': 'Highly Suitable',
    '4': 'Suitable',
    '3': 'Probably Suitable',
    '2': 'Possibly Unsuitable',
    '1': 'Generally Unsuitable',
    '6': 'Made Ground',
};

function queryGSHPSuitability(itmX, itmY, data) {
    if (!data || !data.length) return null;
    for (const feat of data) {
        if (feat.cat === '0') continue;
        for (const ring of feat.rings) {
            if (ring.length < 3) continue;
            if (pointInPolygon(itmX, itmY, ring)) {
                return { cat: feat.cat, name: GSHP_NAMES[feat.cat] || feat.props?.desc || feat.cat };
            }
        }
    }
    return null;
}

function findNearestThermalCond(itmX, itmY) {
    if (!state.thermalCondData || !state.thermalCondData.length) return null;
    let best = null;
    let bestDist = Infinity;
    for (const pt of state.thermalCondData) {
        if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
        const dist = Math.hypot(itmX - pt.x, itmY - pt.y);
        if (dist < bestDist) {
            bestDist = dist;
            best = pt;
        }
    }
    if (!best) return null;
    return {
        conductivity: best.TCONAVWMK || 0,
        distance: bestDist,
        name: best.BH_NAME || best.BOREHOLEID || 'Unknown',
        topDepth: best.TOPDEPTHM,
        baseDepth: best.BASEDEPTHM,
    };
}

function findNearestTempDepth(itmX, itmY) {
    if (!state.tempDepthData || !state.tempDepthData.length) return null;
    let best = null;
    let bestDist = Infinity;
    for (const pt of state.tempDepthData) {
        if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
        const dist = Math.hypot(itmX - pt.x, itmY - pt.y);
        if (dist < bestDist) {
            bestDist = dist;
            best = pt;
        }
    }
    if (!best) return null;
    return {
        temperature: best.TEMP_RCK_C || 0,
        depth: best.DEPTH_M || 0,
        gradient: best.TMPGRADCAL || best.TMPGRADREC || 0,
        distance: bestDist,
        name: best.BH_NAME || 'Unknown',
    };
}

function gshpCatColor(cat) {
    const colors = {
        '5': '#1a9850', '4': '#66bd63', '3': '#d4b84a',
        '2': '#fdae61', '1': '#d73027', '6': '#888888',
    };
    return colors[cat] || '#e6edf3';
}

export function addGSIRow(parent, label, value, valueColor, detail) {
    const row = document.createElement('div');
    row.className = 'ds-row';
    const lbl = document.createElement('span');
    lbl.className = 'ds-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'ds-value';
    val.textContent = value;
    if (valueColor) val.style.color = valueColor;
    row.append(lbl, val);
    parent.appendChild(row);
    if (detail) {
        const detailRow = document.createElement('div');
        detailRow.className = 'ds-row';
        const detailVal = document.createElement('span');
        detailVal.className = 'ds-value-detail';
        detailVal.style.marginLeft = 'auto';
        detailVal.textContent = detail;
        detailRow.appendChild(detailVal);
        parent.appendChild(detailRow);
    }
}

export function buildGSIGeothermalSection(itmX, itmY) {
    const section = document.createElement('div');
    section.className = 'drill-summary';
    section.id = 'drill-gsi-data';

    const title = document.createElement('div');
    title.className = 'ds-section-title';
    title.textContent = 'GSI Geothermal Data';
    section.appendChild(title);

    // GSHP Closed-Loop
    const closedResult = queryGSHPSuitability(itmX, itmY, state.gshpClosedData);
    addGSIRow(section, 'GSHP Closed-Loop', closedResult
        ? closedResult.cat + ' — ' + closedResult.name
        : 'Not mapped',
        closedResult ? gshpCatColor(closedResult.cat) : '#7d8590');

    // GSHP Open-Loop Domestic
    const openDomResult = queryGSHPSuitability(itmX, itmY, state.gshpOpenDomData);
    addGSIRow(section, 'GSHP Open-Loop', openDomResult
        ? openDomResult.cat + ' — ' + openDomResult.name
        : 'Not mapped',
        openDomResult ? gshpCatColor(openDomResult.cat) : '#7d8590');

    // Nearest thermal conductivity
    const tcResult = findNearestThermalCond(itmX, itmY);
    if (tcResult) {
        const distKm = (tcResult.distance / 1000).toFixed(1);
        addGSIRow(section, 'Nearest T. Conductivity',
            tcResult.conductivity.toFixed(2) + ' W/mK',
            '#e6edf3',
            distKm + ' km away, ' + tcResult.name);
    } else {
        addGSIRow(section, 'Nearest T. Conductivity', 'No data', '#7d8590');
    }

    // Nearest temperature at depth
    const tdResult = findNearestTempDepth(itmX, itmY);
    if (tdResult) {
        const distKm = (tdResult.distance / 1000).toFixed(1);
        addGSIRow(section, 'Nearest Temp/Depth',
            tdResult.temperature.toFixed(1) + '°C at ' + tdResult.depth + 'm',
            '#e6edf3',
            'Gradient ' + tdResult.gradient.toFixed(1) + '°C/km · ' + distKm + ' km away, ' + tdResult.name);
    } else {
        addGSIRow(section, 'Nearest Temp/Depth', 'No data', '#7d8590');
    }

    return section;
}

// ── exportDrillReport ───────────────────────────────

export function exportDrillReport() {
    const drillBody = document.getElementById('drill-body');

    trackEvent('drill_report_exported');
    var metaEl = drillBody.querySelector('.dp-meta');
    var metaText = metaEl ? metaEl.textContent : '';
    var itmMatch = metaText.match(/ITM\s+([\d]+),\s*([\d]+)/);
    var rItmX = itmMatch ? parseInt(itmMatch[1], 10) : 0;
    var rItmY = itmMatch ? parseInt(itmMatch[2], 10) : 0;
    var surfMatch = metaText.match(/Surface\s+([\d.-]+)\s*mOD/);
    var surfElev = surfMatch ? parseFloat(surfMatch[1]) : 0;
    var rLat = (53 + (rItmY - 750000) / 111000).toFixed(4);
    var rLon = (-8 + (rItmX - 200000) / 86000).toFixed(4);

    var layerEls = drillBody.querySelectorAll('.drill-layer');
    var depthEls = drillBody.querySelectorAll('.drill-depth');
    var rLayers = [];
    layerEls.forEach(function(el, i) {
        var bar = el.querySelector('.drill-layer-bar');
        var clr = bar ? bar.style.backgroundColor : '#888';
        var nm = el.querySelector('.drill-layer-name');
        var dt = el.querySelector('.drill-layer-detail');
        var dp = depthEls[i];
        rLayers.push({ name: nm ? nm.textContent : '', detail: dt ? dt.textContent : '', depth: dp ? dp.textContent : '', color: clr });
    });

    var sRows = [];
    drillBody.querySelectorAll('.drill-summary .ds-row').forEach(function(row) {
        var lb = row.querySelector('.ds-label');
        var vl = row.querySelector('.ds-value');
        if (lb && vl) sRows.push({ label: lb.textContent, value: vl.textContent, color: vl.style.color || '' });
    });

    var vEl = drillBody.querySelector('.ds-verdict');
    var vText = vEl ? vEl.textContent : '';
    var vGood = vEl ? vEl.classList.contains('good') : false;
    var vMod = vEl ? vEl.classList.contains('moderate') : false;

    var scBody = document.getElementById('site-card-body');
    var scRows = [];
    if (scBody) {
        scBody.querySelectorAll('.sc-row').forEach(function(row) {
            var lb = row.querySelector('.sc-label');
            var vl = row.querySelector('.sc-value');
            if (lb && vl) scRows.push([lb.textContent, vl.textContent]);
        });
        var scEl = scBody.querySelector('.sc-score');
        if (scEl) {
            var filled = scEl.querySelectorAll('.pip:not(.empty)').length;
            var total = scEl.querySelectorAll('.pip').length;
            var sTxt = scEl.textContent.trim();
            scRows.push(['Geothermal suitability', sTxt || (filled + '/' + total)]);
        }
    }

    var nBH = null, nBHD = Infinity;
    if (state.boreholeData && state.boreholeData.length && rItmX && rItmY) {
        for (var bi = 0; bi < state.boreholeData.length; bi++) {
            var d = Math.hypot(rItmX - state.boreholeData[bi].x, rItmY - state.boreholeData[bi].y);
            if (d < nBHD) { nBHD = d; nBH = state.boreholeData[bi]; }
        }
    }

    var kRisk = '', nKarst = '';
    for (var ri = 0; ri < sRows.length; ri++) {
        if (sRows[ri].label === 'Karst risk') kRisk = sRows[ri].value;
        if (sRows[ri].label === 'Nearest karst') nKarst = sRows[ri].value;
    }

    var today = new Date().toLocaleDateString('en-IE', { year: 'numeric', month: 'long', day: 'numeric' });

    var fmRows = '';
    for (var fi = 0; fi < rLayers.length; fi++) {
        var L = rLayers[fi];
        fmRows += '<tr><td style="text-align:center">' + L.depth.replace(' below ground', '') +
            '</td><td><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:' +
            L.color + ';vertical-align:middle;margin-right:6px;border:1px solid #ccc"></span>' +
            L.name + '</td><td style="text-align:center">' + L.detail + '</td></tr>';
    }

    var thRows = '';
    for (var ti = 0; ti < sRows.length; ti++) {
        var cs = sRows[ti].color ? ' style="color:' + sRows[ti].color + ';font-weight:600"' : '';
        thRows += '<tr><td>' + sRows[ti].label + '</td><td' + cs + '>' + sRows[ti].value + '</td></tr>';
    }

    var scHTML = '';
    for (var ci = 0; ci < scRows.length; ci++) {
        scHTML += '<tr><td>' + scRows[ci][0] + '</td><td>' + scRows[ci][1] + '</td></tr>';
    }

    var vColor = vGood ? '#16a34a' : vMod ? '#ca8a04' : '#dc2626';
    var vBg = vGood ? '#f0fdf4' : vMod ? '#fefce8' : '#fef2f2';
    var kColor = kRisk === 'High' ? '#dc2626' : kRisk === 'Moderate' ? '#ca8a04' : '#16a34a';

    var reportContent = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
        '<title>Site Assessment Report - ITM ' + rItmX + ', ' + rItmY + '</title>' +
        '<style>' +
        '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}' +
        'body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:11pt;color:#1a1a1a;' +
        'line-height:1.5;max-width:210mm;margin:0 auto;padding:20mm 18mm;background:#fff}' +
        'h1{font-size:18pt;font-weight:700;text-align:center;margin-bottom:2px;color:#111}' +
        '.sub{text-align:center;font-size:10pt;color:#555;margin-bottom:16px}' +
        '.date{text-align:center;font-size:10pt;color:#555;margin-bottom:4px}' +
        '.loc{text-align:center;font-size:10pt;color:#333;margin-bottom:20px}' +
        'h2{font-size:12pt;font-weight:700;color:#1a1a1a;border-bottom:2px solid #1a1a1a;' +
        'padding-bottom:4px;margin:24px 0 10px;text-transform:uppercase;letter-spacing:.5px}' +
        'table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:10pt}' +
        'th{background:#f3f4f6;font-weight:600;text-align:left;padding:6px 10px;border:1px solid #d1d5db}' +
        'td{padding:5px 10px;border:1px solid #d1d5db;vertical-align:middle}' +
        'tr:nth-child(even) td{background:#f9fafb}' +
        '.verdict{padding:10px 14px;border-radius:6px;text-align:center;font-weight:700;font-size:12pt;margin:12px 0}' +
        '.disc{margin-top:24px;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;' +
        'border-radius:6px;font-size:9pt;color:#6b7280;line-height:1.6}' +
        '.disc strong{color:#374151}' +
        '.dsrc{margin-top:14px;font-size:9pt;color:#6b7280}' +
        '.dsrc dt{font-weight:600;float:left;clear:left;margin-right:4px;color:#374151}' +
        '@media print{body{padding:12mm 14mm}@page{size:A4;margin:10mm}h2{page-break-after:avoid}table{page-break-inside:avoid}}' +
        '</style></head><body>' +
        '<h1>Geothermal Site Assessment Report</h1>' +
        '<div class="sub">Ireland Digital Twin &mdash; Sligo Basin Model</div>' +
        '<div class="date">' + today + '</div>' +
        '<div class="loc">ITM ' + rItmX.toLocaleString() + ', ' + rItmY.toLocaleString() +
        ' &nbsp;|&nbsp; WGS84 ' + rLat + '&deg;N, ' + rLon + '&deg;W' +
        ' &nbsp;|&nbsp; Surface elevation: ' + surfElev + ' mOD</div>' +
        '<h2>Geological Profile</h2>' +
        '<table><thead><tr><th>Depth</th><th>Formation</th><th>Properties</th></tr></thead>' +
        '<tbody>' + fmRows + '</tbody></table>' +
        '<h2>Thermal Summary</h2>' +
        '<table><tbody>' + thRows + '</tbody></table>' +
        '<div class="verdict" style="background:' + vBg + ';color:' + vColor + ';border:1px solid ' + vColor + '">' + vText + '</div>' +
        '<h2>GSI Site Classification</h2>' +
        (scHTML ? '<table><tbody>' + scHTML + '</tbody></table>'
            : '<p style="color:#6b7280;font-style:italic">No site classification data available at this location.</p>') +
        '<h2>Risk Assessment</h2>' +
        '<table><tbody>' +
        '<tr><td style="font-weight:500">Karst risk</td><td style="font-weight:600;color:' + kColor + '">' + (kRisk || 'Not assessed') + '</td></tr>' +
        '<tr><td style="font-weight:500">Nearest karst feature</td><td>' + (nKarst || 'No mapped feature') + '</td></tr>' +
        '<tr><td style="font-weight:500">Nearest modelled borehole</td><td>' +
        (nBH ? (nBH.id || 'BH') + ' (' + Math.round(nBHD) + 'm away, ' + nBH.depth + 'm depth)' : 'No boreholes in model') +
        '</td></tr></tbody></table>' +
        '<h2>Data Sources</h2>' +
        '<dl class="dsrc">' +
        '<dt>Geology:</dt><dd>Geological Survey Ireland (GSI) &mdash; Bedrock Geology, Aquifers, Karst Database</dd><br>' +
        '<dt>Thermal:</dt><dd>VDI 4640 guidelines for ground source heat pump design</dd><br>' +
        '<dt>Model:</dt><dd>GEMINI Project &mdash; SRSC Sligo</dd><br>' +
        '<dt>Licence:</dt><dd>CC-BY 4.0 (GSI data)</dd></dl>' +
        '<div class="disc"><strong>Disclaimer:</strong> This assessment is based on publicly available geological data and ' +
        'simplified thermal models. It does not replace a professional site investigation, detailed geological ' +
        'survey, or thermal response test (TRT). Formation boundaries are interpolated from regional mapping ' +
        'and may not reflect local conditions. All thermal conductivity values are literature estimates ' +
        '(VDI 4640) and actual values may vary significantly. A qualified geothermal engineer should be ' +
        'consulted before any drilling or installation.</div>' +
        '</body></html>';

    // Open report as a Blob URL in a new tab
    var blob = new Blob([reportContent], { type: 'text/html; charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var rw = window.open(url, '_blank');
    if (rw) {
        rw.addEventListener('afterprint', function() { URL.revokeObjectURL(url); });
        setTimeout(function() { rw.print(); }, 500);
    } else {
        URL.revokeObjectURL(url);
        alert('Please allow pop-ups to export the report.');
    }
}
