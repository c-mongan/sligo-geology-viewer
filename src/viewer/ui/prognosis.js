import { state } from '../state.js';
import { trackEvent } from '../analytics.js';
import {
    buildDefaultPrognosis,
    getRiskRegisterForPrognosis,
    prognosisToCsv,
} from './prognosis-data.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return 'unknown';
    return Number(value).toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
    });
}

function activePrognosis() {
    return state.selectedPrognosis || buildDefaultPrognosis();
}

function tagHtml(claim) {
    return `<span class="ass-chip ass-${escapeHtml(claim.tag)}">${escapeHtml(claim.label)}</span>`;
}

function renderStack(stack) {
    if (!stack?.length) return '<li>No formation stack available for this location.</li>';
    return stack.map(layer => {
        const depth = Number.isFinite(layer.startDepth) && Number.isFinite(layer.endDepth)
            ? ` <em>${formatNumber(layer.startDepth)}-${formatNumber(layer.endDepth)} m bgl</em>`
            : '';
        return `<li>${escapeHtml(layer.name)}${depth}</li>`;
    }).join('');
}

function renderRiskRows(risks) {
    return risks.map(risk => `
        <div class="prog-risk" data-risk="${escapeHtml(risk.id)}">
            <div>
                <strong>${escapeHtml(risk.title)}</strong>
                <span>${escapeHtml((risk.evidence || []).join(', '))}</span>
            </div>
            <div class="prog-risk-meta">
                <span class="risk-${escapeHtml(risk.likelihood)}">L: ${escapeHtml(risk.likelihood)}</span>
                <span>C: ${escapeHtml(risk.consequence)}</span>
            </div>
            <p>${escapeHtml(risk.mitigation)}</p>
        </div>
    `).join('');
}

function renderInterpretation(interpretation) {
    if (!interpretation) return '';
    const badges = (interpretation.badges || []).map(badge => (
        `<span class="decision-chip decision-${escapeHtml(badge.tone)}">${escapeHtml(badge.label)}</span>`
    )).join('');
    const reasons = (interpretation.reasons || []).map(reason => `<li>${escapeHtml(reason)}</li>`).join('');
    return `
        <section class="ass-section">
            <h4>Decision signal</h4>
            <div class="decision-card decision-${escapeHtml(interpretation.className)}">
                <div>
                    <strong>${formatNumber(interpretation.score)} / 100</strong>
                    <span>Screening score</span>
                </div>
                <div class="decision-badges">${badges}</div>
            </div>
            <ul class="ass-steps decision-reasons">${reasons}</ul>
        </section>
    `;
}

function renderHtml(prognosis) {
    const risks = getRiskRegisterForPrognosis(prognosis);
    const design = prognosis.design;
    const gaps = state.siteAssessmentProfile?.critical_data_gaps || [];
    const externalGaps = state.siteAssessmentProfile?.external_evidence_gaps || [];
    return `
        <section class="ass-hero prog-hero">
            <div>
                <div class="ass-kicker">Drilling prognosis</div>
                <h4>${escapeHtml(prognosis.title)}</h4>
                <p>${escapeHtml(prognosis.verdict)}</p>
            </div>
            <span class="ass-chip ass-design">Closed loop</span>
        </section>

        <section class="ass-section">
            <h4>Selected location</h4>
            <ul class="ass-claims">
                <li><span>${escapeHtml(prognosis.locationLabel)} <em>Selected by SRSC default or Shift + double-click virtual drill.</em></span><span class="ass-chip ass-processed">Processed</span></li>
                <li><span>${formatNumber(design.count)} design BHEs, ${formatNumber(design.spacingM)} m spacing, ${formatNumber(design.depthRangeM?.[0])}-${formatNumber(design.depthRangeM?.[1])} m depth. <em>Design BHEs are not observed boreholes.</em></span><span class="ass-chip ass-design">Design</span></li>
            </ul>
        </section>

        ${renderInterpretation(prognosis.interpretation)}

        <section class="ass-section">
            <h4>Expected lithology</h4>
            <ul class="prog-stack">${renderStack(prognosis.formationStack)}</ul>
            <div class="prog-driller">
                <strong>Driller notes</strong>
                <span>Expect limestone/shale variability; prepare containment, packers, casing decisions, and karst/groundwater stop-work criteria.</span>
            </div>
        </section>

        <section class="ass-section">
            <h4>Evidence-backed claims</h4>
            <ul class="ass-claims">
                ${prognosis.claims.map(item => `
                    <li>
                        <span>${escapeHtml(item.text)} <em>${escapeHtml(item.evidence)}</em></span>
                        ${tagHtml(item)}
                    </li>
                `).join('')}
            </ul>
        </section>

        <section class="ass-section">
            <h4>Risk register</h4>
            <div class="prog-risks">${renderRiskRows(risks)}</div>
        </section>

        <section class="ass-section">
            <h4>Evidence gaps</h4>
            <ul class="ass-steps">
                ${[...gaps, ...externalGaps].map(gap => `<li>${escapeHtml(gap)}</li>`).join('')}
            </ul>
        </section>
    `;
}

function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function htmlReport(prognosis) {
    const interpretation = prognosis.interpretation;
    const decisionItems = interpretation
        ? `<h2>Decision signal</h2>
<p>Screening score: ${formatNumber(interpretation.score)} / 100</p>
<ul>${(interpretation.badges || []).map(badge => `<li>${escapeHtml(badge.label)}</li>`).join('')}</ul>
<ul>${(interpretation.reasons || []).map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>`
        : '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>SRSC Drilling Prognosis</title>
<style>body{font-family:Arial,sans-serif;max-width:920px;margin:0 auto;padding:32px;color:#1f2933;line-height:1.5}h1{margin-bottom:4px}h2{font-size:18px;border-bottom:1px solid #d9e2ec;padding-bottom:5px}.tag{font-weight:700;color:#1864ab}.risk{border:1px solid #d9e2ec;padding:10px;margin:8px 0}.gap{color:#9a3412}</style></head><body>
<h1>SRSC Drilling Prognosis Report</h1>
<p>${escapeHtml(prognosis.locationLabel)} · ${escapeHtml(prognosis.verdict)}</p>
${decisionItems}
<h2>Summary and main findings</h2>
<ul>${prognosis.claims.map(item => `<li><span class="tag">${escapeHtml(item.label)}</span> ${escapeHtml(item.text)} <small>Evidence: ${escapeHtml(item.evidence)}</small></li>`).join('')}</ul>
<h2>Risk table</h2>
${getRiskRegisterForPrognosis(prognosis).map(risk => `<div class="risk"><strong>${escapeHtml(risk.title)}</strong><br>Likelihood: ${escapeHtml(risk.likelihood)} · Consequence: ${escapeHtml(risk.consequence)}<br>${escapeHtml(risk.mitigation)}</div>`).join('')}
<h2>Next investigations and caveats</h2>
<p class="gap">${escapeHtml((state.siteAssessmentProfile?.critical_data_gaps || []).join('; '))}</p>
</body></html>`;
}

export function initPrognosis() {
    const btn = document.getElementById('btn-prognosis');
    const panel = document.getElementById('prognosis-panel');
    const body = document.getElementById('prognosis-body');
    const closeBtn = document.getElementById('prognosis-close');
    const downloadBtn = document.getElementById('prognosis-download');
    const csvBtn = document.getElementById('prognosis-csv');
    if (!btn || !panel || !body) return;

    const render = () => { body.innerHTML = renderHtml(activePrognosis()); };
    const close = () => {
        panel.classList.remove('open');
        btn.classList.remove('active');
        trackEvent('panel_closed', { panel_name: 'drilling_prognosis' });
    };

    btn.addEventListener('click', () => {
        if (panel.classList.contains('open')) {
            close();
            return;
        }
        document.getElementById('assessment-panel')?.classList.remove('open');
        document.getElementById('provenance-panel')?.classList.remove('open');
        document.getElementById('ontology-panel')?.classList.remove('open');
        document.getElementById('chat-panel')?.classList.remove('open');
        document.getElementById('btn-assessment')?.classList.remove('active');
        document.getElementById('btn-provenance')?.classList.remove('active');
        document.getElementById('btn-ontology')?.classList.remove('active');
        render();
        panel.classList.add('open');
        btn.classList.add('active');
        trackEvent('panel_opened', { panel_name: 'drilling_prognosis' });
    });

    window.addEventListener('viewer:prognosis-selected', () => {
        if (panel.classList.contains('open')) render();
    });

    downloadBtn?.addEventListener('click', () => download('srsc-drilling-prognosis-report.html', htmlReport(activePrognosis()), 'text/html;charset=utf-8'));
    csvBtn?.addEventListener('click', () => download('srsc-drilling-risk-register.csv', prognosisToCsv(activePrognosis()), 'text/csv;charset=utf-8'));
    closeBtn?.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open')) close();
    });
}
