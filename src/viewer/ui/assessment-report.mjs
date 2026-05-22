const CLAIM_LABELS = {
    observed: 'Observed',
    official: 'Official',
    processed: 'Processed',
    interpreted: 'Interpreted',
    design: 'Design',
};

const REQUIRED_SECTION_TITLES = [
    'Executive summary',
    'Site/design basis',
    'Geology and hydrogeology context',
    'Suitability and constraints',
    'Drilling prognosis and risk register',
    'Data confidence/provenance',
    'Recommended next steps',
    'Limitations',
];

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

function uniqueValues(items, key) {
    return [...new Set(items.map(item => item?.[key]).filter(value => value !== null && value !== undefined))];
}

function average(values) {
    const nums = values.map(Number).filter(Number.isFinite);
    if (!nums.length) return null;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function extentSummary(config, metadata) {
    const extent = config?.model_extent || metadata?.extent;
    if (!extent) return 'Model extent unavailable in loaded metadata.';
    const widthKm = (extent.x_max - extent.x_min) / 1000;
    const heightKm = (extent.y_max - extent.y_min) / 1000;
    return `${formatNumber(widthKm, 1)} km x ${formatNumber(heightKm, 1)} km; ${formatNumber(extent.z_min)} m to ${formatNumber(extent.z_max)} m model frame`;
}

function locationSummary(config, metadata) {
    const site = config?.site || {};
    const loc = site.viewer_reference_location || metadata?.srsc_location || site.car_park_location;
    if (!loc) return 'Location unavailable in loaded metadata.';
    return `${formatNumber(loc.lat, 4)}, ${formatNumber(loc.lon, 4)} (${formatNumber(loc.itm_x || loc.itm_x_approx)} E, ${formatNumber(loc.itm_y || loc.itm_y_approx)} N ITM)`;
}

function nearestDistance(items, key = 'distance_to_srsc_m') {
    const distances = (items || []).map(item => Number(item?.[key])).filter(Number.isFinite);
    if (!distances.length) return null;
    return Math.min(...distances);
}

function claim(tag, text, evidence) {
    return { tag, label: CLAIM_LABELS[tag] || tag, text, evidence };
}

function countLineageItems(items) {
    return Array.isArray(items) ? items.length : 0;
}

export function buildAssessmentReportData(inputs = {}) {
    const config = inputs.projectConfig || {};
    const metadata = inputs.metadata || {};
    const boreholes = Array.isArray(inputs.boreholeData) ? inputs.boreholeData : [];
    const gsi = inputs.gsiData || {};
    const manifest = inputs.lineageManifest || {};
    const profile = inputs.siteAssessmentProfile || {};
    const riskRegister = inputs.drillingRiskRegister || {};
    const site = config.site || {};
    const design = config.design_assumptions || {};
    const readiness = config.data_readiness || {};
    const crs = config.coordinate_reference_system?.model || metadata.coordinate_system || manifest.model_extent_crs || 'CRS unavailable';

    const boreholeCount = design.borehole_count || boreholes.length;
    const depthValues = uniqueValues(boreholes, 'depth');
    const boreholeDepth = design.borehole_depth_m || depthValues[0];
    const spacing = design.borehole_spacing_m;
    const rows = design.array_rows;
    const columns = design.array_columns;
    const bottomTemp = average(boreholes.map(bh => bh?.temp_at_bottom));
    const avgHeat = average(boreholes.map(bh => bh?.heat_extraction_kW));
    const formationCodes = [...new Set(boreholes.flatMap(bh => bh?.formations || []))];
    const formationNames = (metadata.formations || [])
        .filter(f => formationCodes.includes(f.code))
        .map(f => f.name || f.code);
    const karstCount = gsi.karst_features?.length || 0;
    const dyeTraceCount = gsi.dye_traces?.length || 0;
    const wellCount = gsi.groundwater_wells?.length || 0;
    const geotechCount = gsi.geotechnical_boreholes?.length || 0;
    const structuralCount = gsi.structural_measurements?.length || 0;
    const nearestKarst = nearestDistance(gsi.karst_features);
    const nearestWell = nearestDistance(gsi.groundwater_wells);
    const demGap = (manifest.known_gaps || []).some(gap => String(gap).toLowerCase().includes('dem'));
    const interpretiveLimits = Array.isArray(readiness.known_interpretive_limits) ? readiness.known_interpretive_limits : [];
    const generatedDate = manifest.generated_at ? new Date(manifest.generated_at).toISOString().slice(0, 10) : 'unknown';
    const siteName = `${site.short_name || 'SRSC'} - ${site.name || 'Sligo Regional Sports Centre'}`;
    const risks = Array.isArray(riskRegister.risks) ? riskRegister.risks : [];
    const highConsequenceRisks = risks.filter(risk => risk.consequence === 'high').map(risk => risk.title);
    const dataGaps = profile.critical_data_gaps || ['sparse subsurface data at site', 'GPR/services confirmation required'];

    const thermalText = bottomTemp
        ? `Design payload estimates about ${formatNumber(bottomTemp, 1)} C at ${formatNumber(boreholeDepth)} m bottom depth.`
        : 'Temperature-at-depth evidence is not loaded in this viewer session.';
    const heatText = avgHeat
        ? `Mean design heat extraction in the generated array is about ${formatNumber(avgHeat, 1)} kW per borehole.`
        : 'Heat extraction values are unavailable in the loaded borehole array.';

    const sections = [
        {
            title: 'Executive summary',
            claims: [
                claim('interpreted', 'Initial screening is cautiously positive for continued closed-loop geothermal assessment, subject to intrusive validation.', 'Viewer assessment synthesis from interpreted 3D geology and current design payloads.'),
                claim('processed', profile.decision || 'Decision focus is whether the proposed closed-loop borehole plan can proceed with appropriate contingencies.', 'site_assessment_profile.json'),
                claim('official', `Mapped GSI context includes ${karstCount} karst features, ${dyeTraceCount} dye traces, and ${wellCount} groundwater wells/springs in the loaded site payload.`, 'gsi_site_data.json'),
                claim('design', `${formatNumber(boreholeCount)} design boreholes are represented; this is a design scenario, not a record of drilled boreholes.`, 'project_config.json and borehole_array.json'),
            ],
        },
        {
            title: 'Site/design basis',
            claims: [
                claim('official', `${siteName}, ${site.county || 'Sligo'}, ${site.country || 'Ireland'}.`, 'project_config.json'),
                claim('processed', `Viewer reference location: ${locationSummary(config, metadata)}.`, 'project_config.json and model_metadata.json'),
                claim('processed', `Model extent: ${extentSummary(config, metadata)}; CRS: ${crs}.`, 'project_config.json, model_metadata.json, lineage_manifest.json'),
                claim('design', `${formatNumber(boreholeCount)} boreholes${rows && columns ? ` in a ${rows} x ${columns} array` : ''}, ${formatNumber(boreholeDepth)}m depth, ${formatNumber(spacing)}m spacing.`, 'project_config.json'),
                claim('design', 'The current viewer configuration supports a closed-loop borehole heat exchanger basis; it does not define an open-loop abstraction design.', 'project_config.json'),
            ],
        },
        {
            title: 'Geology and hydrogeology context',
            claims: [
                claim('interpreted', `${metadata.formations?.length || 0} interpreted Carboniferous formation surfaces are loaded for the viewer model.`, 'model_metadata.json and formation_surfaces.json lineage'),
                claim('design', formationNames.length ? `The design borehole payload samples: ${formationNames.join(', ')}.` : 'The borehole payload does not expose sampled formations.', 'borehole_array.json'),
                claim('official', `${structuralCount || 'Loaded'} structural measurements, ${geotechCount} geotechnical borehole groups, and ${karstCount} karst features are available in the site context payload.`, 'gsi_site_data.json'),
                claim('official', nearestKarst ? `Nearest listed karst feature in the payload is approximately ${formatNumber(nearestKarst)} m from SRSC.` : 'No nearest-karst distance is available in the loaded payload.', 'gsi_site_data.json'),
                claim('official', nearestWell ? `Nearest listed groundwater well/spring is approximately ${formatNumber(nearestWell)} m from SRSC.` : 'No nearest-well distance is available in the loaded payload.', 'gsi_site_data.json'),
            ],
        },
        {
            title: 'Suitability and constraints',
            claims: [
                claim('design', thermalText, 'borehole_array.json'),
                claim('design', heatText, 'borehole_array.json'),
                claim('official', 'Karst, dye-trace, well/spring, and groundwater mapping should be treated as constraints for drilling method, grouting, environmental protection, and any future open-loop concept.', 'GSI layers in gsi_site_data.json and viewer overlays'),
                claim('interpreted', 'Fault and formation geometries are decision-support context until checked by ground investigation, borehole logs, and thermal response testing.', 'lineage_manifest.json'),
            ],
        },
        {
            title: 'Drilling prognosis and risk register',
            claims: [
                claim('design', `Closed-loop basis: ${formatNumber(boreholeCount)} design boreholes at ${formatNumber(spacing)}m spacing and ${formatNumber(boreholeDepth)}m nominal depth; the prognosis assumes a 140-${formatNumber(boreholeDepth)}m drilling envelope.`, 'site_assessment_profile.json and project_config.json'),
                claim('interpreted', formationNames.length ? `Expected lithology is interpreted from the modelled stack: ${formationNames.join(', ')}.` : 'Expected lithology is interpreted from the 3D model because site-specific drilling logs are sparse.', 'model_metadata.json and borehole_array.json'),
                claim('official', highConsequenceRisks.length ? `High-consequence watch-outs include ${highConsequenceRisks.join(', ')}.` : 'The loaded risk register has no high-consequence entries.', 'drilling_risk_register.json'),
                claim('observed', `Known evidence gaps: ${dataGaps.join('; ')}.`, 'site_assessment_profile.json'),
            ],
        },
        {
            title: 'Data confidence/provenance',
            claims: [
                claim('official', `${countLineageItems(manifest.raw_gsi_extracts)} raw GSI extracts are listed in the lineage manifest.`, 'lineage_manifest.json'),
                claim('processed', `${countLineageItems(manifest.viewer_outputs)} viewer outputs are listed; generated at ${generatedDate}.`, 'lineage_manifest.json'),
                claim('interpreted', `${countLineageItems(manifest.model_inputs)} model input files are listed, including contacts, structures, faults, boreholes, and karst inputs where present.`, 'lineage_manifest.json'),
                claim('processed', manifest.summary?.rebuild_self_contained ? 'Lineage marks the rebuild as self-contained for the listed inputs.' : 'Lineage does not confirm a fully self-contained rebuild.', 'lineage_manifest.json'),
                claim('processed', demGap ? 'The lineage manifest records a DEM raster source gap for terrain rebuilds.' : 'No DEM source gap is currently recorded in the lineage manifest.', 'lineage_manifest.json'),
            ],
        },
        {
            title: 'Recommended next steps',
            claims: [
                claim('design', 'Confirm the target system type and whether the design remains closed-loop only.', 'project_config.json'),
                claim('design', 'Check the 48-borehole, 200 m depth, 10 m spacing layout against utilities, access, buildings, setbacks, and drilling logistics.', 'project_config.json'),
                claim('interpreted', 'Plan intrusive ground investigation and thermal response testing before detailed design or procurement.', 'Interpreted viewer model and borehole design payload'),
                claim('official', 'Review groundwater abstraction, discharge, source protection, and licensing requirements before considering open-loop geothermal.', 'GSI groundwater and geothermal context layers'),
            ],
        },
        {
            title: 'Limitations',
            claims: [
                claim('interpreted', 'This is a screening report generated from currently loaded viewer data/config/lineage only; it is not a final engineering design, statutory consent assessment, or construction recommendation.', 'viewer runtime state'),
                claim('interpreted', interpretiveLimits[0] || '3D formation surfaces are interpreted from available contacts, structural data, and borehole constraints.', 'project_config.json'),
                claim('processed', interpretiveLimits[1] || 'Terrain and overlay layers depend on the available generated viewer payloads.', 'project_config.json'),
                claim('official', 'Mapped datasets may be incomplete, generalized, clipped, or out of date relative to site-specific conditions.', 'Data provenance catalogue and lineage_manifest.json'),
            ],
        },
    ];

    return {
        title: 'SRSC Assessment Report',
        subtitle: 'First-pass geothermal screening export',
        siteName,
        generatedAt: new Date().toISOString(),
        sections,
        risks,
    };
}

export function renderAssessmentPanelHtml(report) {
    const sectionHtml = report.sections.map(section => `
        <section class="ass-section">
            <h4>${escapeHtml(section.title)}</h4>
            <ul class="ass-claims">
                ${section.claims.map(item => `
                    <li>
                        <span>${escapeHtml(item.text)} <em>${escapeHtml(item.evidence)}</em></span>
                        <span class="ass-chip ass-${escapeHtml(item.tag)}">${escapeHtml(item.label)}</span>
                    </li>
                `).join('')}
            </ul>
        </section>
    `).join('');

    return `
        <section class="ass-hero">
            <div>
                <div class="ass-kicker">Initial assessment report</div>
                <h4>Promising but requires intrusive validation.</h4>
                <p>All claims below are cautious and tagged as official, processed, interpreted, or design evidence.</p>
            </div>
            <span class="ass-chip ass-interpreted">Interpreted</span>
        </section>
        ${sectionHtml}
    `;
}

export function renderAssessmentReportMarkdown(report) {
    const lines = [
        `# ${report.title}`,
        '',
        report.subtitle,
        '',
        `Generated: ${report.generatedAt}`,
        `Site: ${report.siteName}`,
        '',
    ];
    for (const section of report.sections) {
        lines.push(`## ${section.title}`, '');
        for (const item of section.claims) {
            lines.push(`- [${item.label}] ${item.text} Evidence: ${item.evidence}`);
        }
        lines.push('');
    }
    if (report.risks?.length) {
        lines.push('## Risk register', '');
        for (const risk of report.risks) {
            lines.push(`- ${risk.title}: likelihood ${risk.likelihood}, consequence ${risk.consequence}. Evidence: ${(risk.evidence || []).join(', ')}. Mitigation: ${risk.mitigation}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

export function renderAssessmentReportHtml(report) {
    const sections = report.sections.map(section => `
        <section>
            <h2>${escapeHtml(section.title)}</h2>
            <ul>
                ${section.claims.map(item => `
                    <li>
                        <span class="tag tag-${escapeHtml(item.tag)}">${escapeHtml(item.label)}</span>
                        ${escapeHtml(item.text)}
                        <small>Evidence: ${escapeHtml(item.evidence)}</small>
                    </li>
                `).join('')}
            </ul>
        </section>
    `).join('');
    const riskRows = (report.risks || []).map(risk => `
        <tr>
            <td>${escapeHtml(risk.title)}</td>
            <td>${escapeHtml(risk.likelihood)}</td>
            <td>${escapeHtml(risk.consequence)}</td>
            <td>${escapeHtml((risk.affects || []).join(', '))}</td>
            <td>${escapeHtml(risk.mitigation)}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(report.title)}</title>
<style>
body{font-family:Arial,sans-serif;color:#1f2933;line-height:1.55;max-width:920px;margin:0 auto;padding:32px;background:#fff}
h1{font-size:28px;margin:0 0 4px}
.meta{color:#52606d;margin-bottom:28px}
h2{font-size:18px;margin:26px 0 10px;border-bottom:1px solid #d9e2ec;padding-bottom:5px}
li{margin:9px 0}
small{display:block;color:#66788a;margin-top:2px}
table{border-collapse:collapse;width:100%;margin-top:10px}td,th{border:1px solid #d9e2ec;padding:7px;text-align:left;font-size:13px;vertical-align:top}
.tag{display:inline-block;font-size:11px;font-weight:700;border:1px solid #bcccdc;border-radius:999px;padding:1px 7px;margin-right:6px}
.tag-observed{color:#1f7a43}.tag-official{color:#1f7a43}.tag-processed{color:#1864ab}.tag-interpreted{color:#7048a8}.tag-design{color:#9a6a00}
.note{margin-top:28px;padding:12px 14px;background:#f5f7fa;border:1px solid #d9e2ec;color:#52606d}
@media print{body{padding:18mm}h2{page-break-after:avoid}}
</style>
</head>
<body>
<h1>${escapeHtml(report.title)}</h1>
<div class="meta">${escapeHtml(report.subtitle)}<br>Generated: ${escapeHtml(report.generatedAt)}<br>Site: ${escapeHtml(report.siteName)}</div>
${riskRows ? `<section><h2>Risk register first-page table</h2><table><thead><tr><th>Risk</th><th>Likelihood</th><th>Consequence</th><th>Affects</th><th>Mitigation</th></tr></thead><tbody>${riskRows}</tbody></table></section>` : ''}
${sections}
<div class="note">This first export is generated from existing viewer data/config/lineage only. PDF export can be handled later from this HTML.</div>
</body>
</html>`;
}

export function assertAssessmentReport(report) {
    const titles = report.sections.map(section => section.title);
    const missing = REQUIRED_SECTION_TITLES.filter(title => !titles.includes(title));
    if (missing.length) {
        throw new Error(`Assessment report missing sections: ${missing.join(', ')}`);
    }
    for (const section of report.sections) {
        if (!section.claims?.length) throw new Error(`Assessment report section has no claims: ${section.title}`);
        for (const item of section.claims) {
            if (!item.tag || !item.text || !item.evidence) {
                throw new Error(`Assessment report claim is missing tag, text, or evidence in: ${section.title}`);
            }
        }
    }
    for (const risk of report.risks || []) {
        if (!risk.id || !risk.likelihood || !risk.consequence || !risk.mitigation || !risk.evidence?.length || !risk.affects?.length) {
            throw new Error(`Risk register item is incomplete: ${risk.id || risk.title || 'unknown'}`);
        }
    }
    return true;
}
