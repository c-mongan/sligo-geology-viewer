import { state } from '../state.js';
import { COLORS, NAMES } from '../config.js';
import { trackEvent } from '../analytics.js';
import { getDesignFocusModel } from '../utils.js';
import { nearestGridIndex } from './drill-report.js';

const SECTION_DEPTH_MIN = -300;
const SECTION_DEPTH_MAX = 60;

function formationCode(index) {
    if (!Number.isInteger(index) || index < 0) return null;
    return state.metadata?.formations?.[index]?.code || null;
}

function sampleCode(xi, yi, zi) {
    const index = state.voxelData?.formation_ids?.[xi]?.[yi]?.[zi];
    return formationCode(index);
}

function drawSection(axis = 'ew') {
    const canvas = document.getElementById('subsurface-section-canvas');
    const caption = document.getElementById('subsurface-section-caption');
    if (!canvas || !state.voxelData) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 520;
    const height = canvas.clientHeight || 220;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const xGrid = state.voxelData.x_grid || [];
    const yGrid = state.voxelData.y_grid || [];
    const zGrid = state.voxelData.z_grid || [];
    const focus = getDesignFocusModel();
    const fixedX = state.cx + focus.x;
    const fixedY = state.cy - focus.z;
    const fixedXi = nearestGridIndex(xGrid, fixedX);
    const fixedYi = nearestGridIndex(yGrid, fixedY);
    const horizontal = axis === 'ns' ? yGrid : xGrid;
    const fixedLabel = axis === 'ns'
        ? `N-S section near ITM X ${Math.round(fixedX)}`
        : `E-W section near ITM Y ${Math.round(fixedY)}`;

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    const padL = 42;
    const padR = 10;
    const padT = 12;
    const padB = 28;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const stepW = plotW / Math.max(1, horizontal.length);
    const stepH = plotH / Math.max(1, zGrid.length);

    for (let i = 0; i < horizontal.length; i++) {
        for (let k = 0; k < zGrid.length; k++) {
            const xi = axis === 'ns' ? fixedXi : i;
            const yi = axis === 'ns' ? i : fixedYi;
            const code = sampleCode(xi, yi, k);
            if (!code) continue;
            const y = padT + (zGrid.length - 1 - k) * stepH;
            ctx.fillStyle = COLORS[code] || '#6e7681';
            ctx.fillRect(padL + i * stepW, y, Math.ceil(stepW) + 0.5, Math.ceil(stepH) + 0.5);
        }
    }

    ctx.strokeStyle = 'rgba(230, 237, 243, 0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, plotW, plotH);

    ctx.fillStyle = '#8b949e';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (const z of [50, 0, -100, -200, -300]) {
        const t = (SECTION_DEPTH_MAX - z) / (SECTION_DEPTH_MAX - SECTION_DEPTH_MIN);
        const y = padT + t * plotH;
        ctx.strokeStyle = 'rgba(230, 237, 243, 0.08)';
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
        ctx.fillText(`${z}m`, padL - 8, y + 4);
    }

    const centerX = padL + plotW / 2;
    ctx.strokeStyle = 'rgba(126, 231, 135, 0.8)';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(centerX, padT);
    ctx.lineTo(centerX, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#c9d1d9';
    ctx.textAlign = 'center';
    ctx.fillText(axis === 'ns' ? 'South to North' : 'West to East', padL + plotW / 2, height - 8);

    if (caption) {
        caption.textContent = `${fixedLabel}. Colours are sampled from the interpreted voxel grid, not observed contacts.`;
    }
}

function buildSelectedLog() {
    const body = document.getElementById('subsurface-log');
    if (!body || !state.voxelData) return;
    body.textContent = '';

    const focus = getDesignFocusModel();
    const itmX = state.cx + focus.x;
    const itmY = state.cy - focus.z;
    const xi = nearestGridIndex(state.voxelData.x_grid, itmX);
    const yi = nearestGridIndex(state.voxelData.y_grid, itmY);
    const zGrid = state.voxelData.z_grid || [];
    const intervals = [];
    let currentCode = null;
    let top = null;

    for (let k = zGrid.length - 1; k >= 0; k--) {
        const code = sampleCode(xi, yi, k);
        const z = zGrid[k];
        if (code !== currentCode) {
            if (currentCode) intervals.push({ code: currentCode, top, bottom: zGrid[k + 1] ?? z });
            currentCode = code;
            top = z;
        }
    }
    if (currentCode) intervals.push({ code: currentCode, top, bottom: zGrid[0] });

    for (const interval of intervals.slice(0, 7)) {
        const row = document.createElement('div');
        row.className = 'subsurface-log-row';

        const swatch = document.createElement('span');
        swatch.className = 'subsurface-swatch';
        swatch.style.backgroundColor = COLORS[interval.code] || '#6e7681';

        const label = document.createElement('span');
        label.className = 'subsurface-log-name';
        label.textContent = NAMES[interval.code] || interval.code;

        const depth = document.createElement('span');
        depth.className = 'subsurface-log-depth';
        depth.textContent = `${Math.round(interval.top)} to ${Math.round(interval.bottom)} mOD`;

        row.append(swatch, label, depth);
        body.appendChild(row);
    }
}

function renderEvidenceSummary() {
    const body = document.getElementById('subsurface-evidence');
    if (!body) return;
    body.textContent = '';

    const items = [
        ['Observed', `${state.bedrockBhData?.length || 6} verified boreholes and mapped GSI point/line records constrain the regional story.`],
        ['Interpreted', 'Formation surfaces and depth slices come from interpolation, thickness stacking, and virtual borehole constraints.'],
        ['Design', `${state.boreholeData?.length || 48} BHEs are planned/synthetic positions for screening, not drilled logs.`],
        ['Gap', 'Local cavities, fractures, weathered zones, and exact contacts still need site investigation or geophysics.'],
    ];

    for (const [tag, text] of items) {
        const row = document.createElement('div');
        row.className = 'subsurface-evidence-row';
        const chip = document.createElement('span');
        chip.className = `trust-chip trust-${tag.toLowerCase() === 'gap' ? 'interpreted' : tag.toLowerCase()}`;
        chip.textContent = tag;
        const copy = document.createElement('span');
        copy.textContent = text;
        row.append(chip, copy);
        body.appendChild(row);
    }
}

function renderPanel(axis = 'ew') {
    document.querySelectorAll('.subsurface-axis-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.axis === axis);
    });
    drawSection(axis);
    buildSelectedLog();
    renderEvidenceSummary();
}

export function openSubsurfacePanel(axis = 'ew') {
    const panel = document.getElementById('subsurface-panel');
    if (!panel) return;
    panel.classList.add('open');
    renderPanel(axis);
    trackEvent('panel_opened', { panel_name: 'subsurface_interpretation', axis });
}

export function closeSubsurfacePanel() {
    const panel = document.getElementById('subsurface-panel');
    if (!panel) return;
    panel.classList.remove('open');
    trackEvent('panel_closed', { panel_name: 'subsurface_interpretation' });
}

export function initSubsurfacePanel() {
    document.getElementById('subsurface-close')?.addEventListener('click', closeSubsurfacePanel);
    document.querySelectorAll('.subsurface-axis-btn').forEach(btn => {
        btn.addEventListener('click', () => renderPanel(btn.dataset.axis || 'ew'));
    });
    window.addEventListener('resize', () => {
        if (document.getElementById('subsurface-panel')?.classList.contains('open')) {
            const active = document.querySelector('.subsurface-axis-btn.active')?.dataset.axis || 'ew';
            drawSection(active);
        }
    });
}
