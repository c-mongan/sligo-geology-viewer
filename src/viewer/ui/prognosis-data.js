import { state } from '../state.js';
import { NAMES } from '../config.js';

function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return 'unknown';
    return Number(value).toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
    });
}

function claim(tag, text, evidence) {
    const labels = { observed: 'Observed', official: 'Official', processed: 'Processed', interpreted: 'Interpreted', design: 'Design' };
    return { tag, label: labels[tag] || tag, text, evidence };
}

function normalizeRisk(value) {
    const risk = String(value || 'unknown').toLowerCase();
    if (risk === 'moderate') return 'medium';
    if (['high', 'medium', 'low'].includes(risk)) return risk;
    return 'unknown';
}

function clampScore(score) {
    return Math.max(0, Math.min(100, Math.round(score)));
}

function interpretationFromInputs({ avgCond, karstRating, directObservation = false, voxelSampled = true }) {
    const risk = normalizeRisk(karstRating);
    let score = 52;
    const badges = [];
    const reasons = [];

    if (Number.isFinite(avgCond)) {
        if (avgCond >= 2.5) {
            score += 22;
            reasons.push(`Strong thermal conductivity proxy (${avgCond.toFixed(1)} W/mK).`);
        } else if (avgCond >= 2.0) {
            score += 10;
            reasons.push(`Moderate thermal conductivity proxy (${avgCond.toFixed(1)} W/mK).`);
        } else {
            score -= 10;
            reasons.push(`Lower thermal conductivity proxy (${avgCond.toFixed(1)} W/mK).`);
        }
    } else {
        score -= 8;
        reasons.push('Thermal conductivity is inferred from model context, not directly sampled here.');
    }

    if (risk === 'high') {
        score -= 26;
        badges.push({ label: 'Karst caution', tone: 'poor' });
        reasons.push('Mapped karst is close enough to dominate screening risk.');
    } else if (risk === 'medium') {
        score -= 12;
        badges.push({ label: 'Karst caution', tone: 'moderate' });
        reasons.push('Mapped karst is nearby; drilling controls and contingencies should be explicit.');
    } else if (risk === 'low') {
        score += 8;
        reasons.push('Nearest mapped karst is outside the near-site caution threshold.');
    } else {
        score -= 6;
        reasons.push('Nearest mapped karst could not be resolved from the loaded payload.');
    }

    if (!directObservation) {
        score -= 10;
        badges.push({ label: 'Needs borehole confirmation', tone: 'moderate' });
        reasons.push('This is a screening result; final siting still needs direct borehole/GPR/services confirmation.');
    }

    if (!voxelSampled) {
        score -= 8;
        badges.push({ label: 'Low data confidence', tone: 'poor' });
        reasons.push('Voxel sampling was unavailable, so the geology falls back to a less precise proxy.');
    }

    badges.push({ label: 'Flood follow-up', tone: 'moderate' });
    reasons.push('OPW flood data is currently a source catalogue/follow-up item, not a rendered constraint geometry.');

    const finalScore = clampScore(score);
    if (finalScore >= 70 && risk !== 'high') {
        badges.unshift({ label: 'Good candidate', tone: 'good' });
    } else if (finalScore >= 50) {
        badges.unshift({ label: 'Screen with controls', tone: 'moderate' });
    } else {
        badges.unshift({ label: 'Constrained candidate', tone: 'poor' });
    }

    return {
        score: finalScore,
        className: finalScore >= 70 && risk !== 'high' ? 'good' : (finalScore >= 50 ? 'moderate' : 'poor'),
        badges,
        reasons,
    };
}

function siteLocation() {
    return state.projectConfig?.site?.viewer_reference_location
        || state.metadata?.srsc_location
        || state.projectConfig?.site?.car_park_location
        || {};
}

function designBasis() {
    const profileDesign = state.siteAssessmentProfile?.borehole_design || {};
    const configDesign = state.projectConfig?.design_assumptions || {};
    const depthRange = profileDesign.depth_range_m || [140, configDesign.borehole_depth_m || 200];
    return {
        systemType: state.siteAssessmentProfile?.system_type || 'closed_loop',
        spacingM: profileDesign.spacing_m || configDesign.borehole_spacing_m || 10,
        depthRangeM: depthRange,
        count: profileDesign.count || configDesign.borehole_count || state.boreholeData?.length || 48,
    };
}

function nearestKarst(itmX, itmY) {
    let distance = Infinity;
    let name = '';
    for (const feature of state.gsiData?.karst_features || []) {
        if (!Number.isFinite(feature?.itm_x) || !Number.isFinite(feature?.itm_y)) continue;
        const dist = Math.hypot(itmX - feature.itm_x, itmY - feature.itm_y);
        if (dist < distance) {
            distance = dist;
            name = feature.name || feature.type || 'Mapped karst feature';
        }
    }
    if (!Number.isFinite(distance)) return { distance: null, name: 'No mapped feature', rating: 'unknown' };
    return {
        distance,
        name,
        rating: distance < 500 ? 'high' : (distance < 1500 ? 'medium' : 'low'),
    };
}

function formationNamesFromLayers(layers) {
    return (layers || []).map(layer => {
        const fm = state.metadata?.formations?.find(item => item.code === layer.code);
        return {
            name: NAMES[layer.code] || fm?.name || layer.code,
            startDepth: layer.startDepth,
            endDepth: layer.endDepth,
        };
    });
}

function fallbackFormationStack() {
    const codes = [...new Set((state.boreholeData || []).flatMap(bh => bh?.formations || []))];
    return codes.map(code => {
        const fm = state.metadata?.formations?.find(item => item.code === code);
        return { name: NAMES[code] || fm?.name || code, startDepth: null, endDepth: null };
    }).slice(0, 5);
}

function averageConductivityFromStack(stack) {
    const values = [];
    for (const layer of stack || []) {
        const code = layer.code || state.metadata?.formations?.find(fm => fm.name === layer.name)?.code;
        const fm = state.metadata?.formations?.find(item => item.code === code || item.name === layer.name);
        const conductivity = Number(fm?.conductivity);
        if (Number.isFinite(conductivity)) values.push(conductivity);
    }
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function adjustRisksForLocation(risks, karstRating) {
    return risks.map(risk => {
        if (risk.id !== 'karst-collapse') return risk;
        if (karstRating === 'high') return { ...risk, likelihood: 'high' };
        if (karstRating === 'low') return { ...risk, likelihood: 'low' };
        return risk;
    });
}

export function getRiskRegisterForPrognosis(prognosis = null) {
    const risks = state.drillingRiskRegister?.risks || [];
    return adjustRisksForLocation(risks, prognosis?.karst?.rating);
}

export function buildDefaultPrognosis() {
    const loc = siteLocation();
    const itmX = Number(loc.itm_x || loc.itm_x_approx);
    const itmY = Number(loc.itm_y || loc.itm_y_approx);
    const karst = Number.isFinite(itmX) && Number.isFinite(itmY) ? nearestKarst(itmX, itmY) : { distance: null, name: 'Unknown', rating: 'unknown' };
    const design = designBasis();
    const stack = fallbackFormationStack();
    const avgHeat = state.boreholeData?.length
        ? state.boreholeData.reduce((sum, bh) => sum + Number(bh?.heat_extraction_kW || 0), 0) / state.boreholeData.length
        : null;
    const avgCond = averageConductivityFromStack(stack);

    return {
        mode: 'srsc',
        title: 'SRSC drilling prognosis',
        locationLabel: 'SRSC baseline location',
        itmX,
        itmY,
        design,
        formationStack: stack,
        karst,
        thermal: { totalKW: avgHeat, depthM: design.depthRangeM[1], avgCond },
        verdict: 'Proceed only as a screened closed-loop design with karst, groundwater, and services contingencies.',
        interpretation: interpretationFromInputs({ avgCond, karstRating: karst.rating, directObservation: false }),
        claims: [
            claim('design', `${formatNumber(design.count)} design BHEs are assumed at ${formatNumber(design.spacingM)} m spacing and ${formatNumber(design.depthRangeM[0])}-${formatNumber(design.depthRangeM[1])} m depth. These are not observed boreholes.`, 'site_assessment_profile.json and borehole_array.json'),
            claim('interpreted', stack.length ? `Expected geology is dominated by the loaded Carboniferous formation stack, including ${stack.map(item => item.name).join(', ')}.` : 'Expected lithology is interpreted from the viewer model where direct logs are sparse.', 'interpreted 3D model and model_metadata.json'),
            claim('official', karst.distance ? `Nearest mapped karst feature is about ${formatNumber(karst.distance)} m away (${karst.name}).` : 'No nearest karst distance is available in the loaded GSI payload.', 'gsi_site_data.json'),
            claim('observed', 'Direct observed subsurface data at the SRSC collar locations is sparse; GPR/services confirmation is required before final layout.', 'site_assessment_profile.json'),
            claim('processed', 'Model edge effects and sparse-control zones must remain visible caveats when interpreting selected locations.', 'lineage_manifest.json and site_assessment_profile.json'),
        ],
    };
}

export function buildSelectedPrognosis(input) {
    const stack = formationNamesFromLayers(input.layers);
    const design = designBasis();
    const karst = {
        distance: input.nearestKarst,
        name: input.nearestKarstName || 'Mapped karst feature',
        rating: normalizeRisk(input.karstRisk),
    };
    const interpretation = interpretationFromInputs({
        avgCond: input.avgCond,
        karstRating: karst.rating,
        directObservation: false,
        voxelSampled: input.usedVoxelColumn !== false,
    });
    return {
        mode: 'selected',
        title: 'Selected-location drilling prognosis',
        locationLabel: `ITM ${formatNumber(input.itmX)}, ${formatNumber(input.itmY)}`,
        itmX: input.itmX,
        itmY: input.itmY,
        design,
        formationStack: stack,
        karst,
        thermal: { totalKW: input.totalKW, depthM: input.drillDepth, avgCond: input.avgCond, bottomTemp: input.bottomTemp },
        verdict: input.verdictText || 'Selected virtual borehole sampled.',
        interpretation,
        claims: [
            claim('processed', `Virtual drill sampled ${formatNumber(input.drillDepth)} m below ground at ${formatNumber(input.surfaceElev)} mOD.`, 'double-click virtual drill result'),
            claim('interpreted', stack.length ? `Expected lithology at this point: ${stack.map(item => item.name).join(', ')}.` : 'Formation stack could not be resolved at this point.', 'voxel_model.json and formation_surfaces.json'),
            claim('design', `${formatNumber(design.count)} design BHEs remain a planning assumption, not observed boreholes.`, 'site_assessment_profile.json'),
            claim('official', Number.isFinite(input.nearestKarst) ? `Nearest mapped karst is about ${formatNumber(input.nearestKarst)} m away (${karst.name}).` : 'No mapped karst feature found in the loaded local payload.', 'gsi_site_data.json'),
            claim('observed', 'GPR/services and drilling observations must override this prognosis during final siting and construction.', 'site_assessment_profile.json'),
        ],
    };
}

export function prognosisToCsv(prognosis) {
    const rows = [['risk_id', 'title', 'likelihood', 'consequence', 'affects', 'evidence', 'mitigation']];
    for (const risk of getRiskRegisterForPrognosis(prognosis)) {
        rows.push([
            risk.id,
            risk.title,
            risk.likelihood,
            risk.consequence,
            (risk.affects || []).join('|'),
            (risk.evidence || []).join('|'),
            risk.mitigation,
        ]);
    }
    return rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}
