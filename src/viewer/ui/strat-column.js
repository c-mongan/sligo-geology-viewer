import { state } from '../state.js';
import { COLORS, NAMES, ROCK_TYPE } from '../config.js';
import { trackEvent } from '../analytics.js';

export function buildStratColumn() {
    const col = document.getElementById('strat-column');
    const formations = state.metadata.formations;

    // Show youngest (top) first
    for (let i = 0; i < formations.length; i++) {
        const fm = formations[i];
        const row = document.createElement('div');
        row.className = 'strat-row';

        const cb = document.createElement('div');
        cb.className = 'strat-cb';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = true;
        input.id = 'strat-' + fm.code;
        input.setAttribute('data-code', fm.code);
        input.setAttribute('aria-label', 'Toggle ' + fm.name);
        input.addEventListener('change', () => {
            state.formationGroup.children.forEach(m => {
                if (m.userData.code === fm.code) m.visible = input.checked;
            });
        });
        cb.appendChild(input);

        const bar = document.createElement('div');
        bar.className = 'strat-bar';
        bar.style.background = COLORS[fm.code] || fm.color;
        // Height proportional to thickness
        const minH = 28;
        const maxH = 56;
        const t = fm.thickness_typical;
        const barH = minH + (t / 200) * (maxH - minH);
        bar.style.minHeight = barH + 'px';

        const info = document.createElement('div');
        info.className = 'strat-info';

        const name = document.createElement('div');
        name.className = 'strat-name';
        name.textContent = NAMES[fm.code] || fm.name;

        const detail = document.createElement('div');
        detail.className = 'strat-detail';
        detail.textContent = ROCK_TYPE[fm.code] + ' \u2022 ~' + fm.thickness_typical + 'm \u2022 ' + fm.conductivity + ' W/mK';

        info.appendChild(name);
        info.appendChild(detail);

        row.appendChild(cb);
        row.appendChild(bar);
        row.appendChild(info);

        // Click row to isolate
        row.addEventListener('dblclick', () => {
            const allChecked = formations.every((f) => {
                const el = document.getElementById('strat-' + f.code);
                return el && el.checked;
            });
            if (allChecked) {
                // Isolate this one
                formations.forEach(f => {
                    const el = document.getElementById('strat-' + f.code);
                    if (el) {
                        el.checked = (f.code === fm.code);
                        state.formationGroup.children.forEach(m => {
                            if (m.userData.code === f.code) m.visible = el.checked;
                        });
                    }
                });
                trackEvent('formation_isolated', { formation: fm.code, name: NAMES[fm.code] || fm.name });
            } else {
                // Show all
                formations.forEach(f => {
                    const el = document.getElementById('strat-' + f.code);
                    if (el) {
                        el.checked = true;
                        state.formationGroup.children.forEach(m => {
                            if (m.userData.code === f.code) m.visible = true;
                        });
                    }
                });
                trackEvent('formations_show_all');
            }
        });

        col.appendChild(row);
    }

    // Depth label at bottom
    const depthNote = document.createElement('div');
    depthNote.style.cssText = 'padding: 6px 14px; font-size: 10px; color: #484f58; border-top: 1px solid #21262d; text-align: center;';
    depthNote.textContent = 'Youngest (top) \u2192 Oldest (bottom) \u2022 Double-click to isolate';
    document.getElementById('strat-panel').appendChild(depthNote);
}

export function buildSiteCard() {
    if (!state.gsiData || !state.gsiData.site_classification) return;

    const sc = state.gsiData.site_classification;
    const body = document.getElementById('site-card-body');
    if (!body) return;
    body.textContent = '';

    const bedrock = (sc.bedrock_geology || '').split(' - ')[0] || 'Unknown';
    const vulnerability = (sc.vulnerability || '').split(' (')[0] || 'Unknown';
    const recharge = /mm\/?yr/i.test(sc.recharge_mm_yr || '')
        ? sc.recharge_mm_yr
        : (sc.recharge_mm_yr ? sc.recharge_mm_yr + ' mm/yr' : 'Unknown');
    const rows = [
        ['Bedrock', bedrock],
        ['Aquifer', sc.aquifer || 'Unknown'],
        ['Vulnerability', vulnerability],
        ['Depth to bedrock', sc.depth_to_bedrock_range || 'Unknown'],
        ['Bedding dip', sc.bedding_dip || 'Unknown'],
        ['Recharge', recharge],
    ];

    for (const [label, value] of rows) {
        const row = document.createElement('div');
        row.className = 'sc-row';

        const lbl = document.createElement('span');
        lbl.className = 'sc-label';
        lbl.textContent = label;

        const val = document.createElement('span');
        val.className = 'sc-value';
        val.textContent = value;

        row.append(lbl, val);
        body.appendChild(row);
    }

    const scoreMatch = String(sc.geothermal_suitability || '').match(/(\d+)\s*\/\s*5/);
    const scoreNum = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
    const scoreLabelText = sc.geothermal_suitability || 'Unknown';
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'sc-score';

    for (let i = 1; i <= 5; i++) {
        const pip = document.createElement('span');
        pip.className = 'pip' + (i > scoreNum ? ' empty' : '');
        scoreDiv.appendChild(pip);
    }

    const scoreLabel = document.createElement('span');
    scoreLabel.textContent = scoreLabelText;
    scoreDiv.appendChild(scoreLabel);
    body.appendChild(scoreDiv);
}

export function buildThermalCard() {
    const grid = document.getElementById('thermal-grid');
    const totalKW = state.boreholeData.reduce((s, b) => s + b.heat_extraction_kW, 0);
    const avgTemp = state.boreholeData.reduce((s, b) => s + b.temp_at_bottom, 0) / state.boreholeData.length;
    const highRisk = state.boreholeData.filter(b => b.karst_risk === 'high').length;
    const medRisk = state.boreholeData.filter(b => b.karst_risk === 'medium').length;

    const stats = [
        { value: totalKW.toFixed(0), unit: 'kW', label: 'Total extraction' },
        { value: (totalKW / state.boreholeData.length).toFixed(1), unit: 'kW', label: 'Per borehole' },
        { value: avgTemp.toFixed(1), unit: '\u00B0C', label: 'Temp at 200m' },
        { value: highRisk + medRisk === 0 ? 'None' : (highRisk + '+' + medRisk), unit: highRisk + medRisk > 0 ? 'risk' : '', label: 'Karst risk (high+med)' },
    ];

    for (const s of stats) {
        const div = document.createElement('div');
        div.className = 'thermal-stat';

        const val = document.createElement('div');
        const valSpan = document.createElement('span');
        valSpan.className = 'value';
        valSpan.textContent = s.value;
        val.appendChild(valSpan);
        if (s.unit) {
            const unitSpan = document.createElement('span');
            unitSpan.className = 'unit';
            unitSpan.textContent = s.unit;
            val.appendChild(unitSpan);
        }

        const lbl = document.createElement('div');
        lbl.className = 'label';
        lbl.textContent = s.label;

        div.appendChild(val);
        div.appendChild(lbl);
        grid.appendChild(div);
    }
}
