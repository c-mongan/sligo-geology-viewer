import { state } from '../state.js';
import { trackEvent } from '../analytics.js';
import {
    assertAssessmentReport,
    buildAssessmentReportData,
    renderAssessmentPanelHtml,
    renderAssessmentReportHtml,
} from './assessment-report.mjs';

function currentReport() {
    const report = buildAssessmentReportData({
        projectConfig: state.projectConfig,
        metadata: state.metadata,
        boreholeData: state.boreholeData,
        gsiData: state.gsiData,
        lineageManifest: state.lineageManifest,
        siteAssessmentProfile: state.siteAssessmentProfile,
        drillingRiskRegister: state.drillingRiskRegister,
    });
    assertAssessmentReport(report);
    return report;
}

function downloadReport() {
    const report = currentReport();
    const html = renderAssessmentReportHtml(report);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'srsc-assessment-report.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    trackEvent('assessment_report_downloaded', { format: 'html' });
}

export function initAssessment() {
    const btn = document.getElementById('btn-assessment');
    const panel = document.getElementById('assessment-panel');
    const closeBtn = document.getElementById('assessment-close');
    const body = document.getElementById('assessment-body');
    const downloadBtn = document.getElementById('assessment-download');
    if (!btn || !panel || !body) return;

    const close = () => {
        panel.classList.remove('open');
        btn.classList.remove('active');
        trackEvent('panel_closed', { panel_name: 'srsc_assessment' });
    };

    btn.addEventListener('click', () => {
        const isOpen = panel.classList.contains('open');
        if (isOpen) {
            close();
            return;
        }
        document.getElementById('provenance-panel')?.classList.remove('open');
        document.getElementById('ontology-panel')?.classList.remove('open');
        document.getElementById('chat-panel')?.classList.remove('open');
        document.getElementById('btn-provenance')?.classList.remove('active');
        document.getElementById('btn-ontology')?.classList.remove('active');
        body.innerHTML = renderAssessmentPanelHtml(currentReport());
        panel.classList.add('open');
        btn.classList.add('active');
        trackEvent('panel_opened', { panel_name: 'srsc_assessment' });
        trackEvent('assessment_summary_viewed');
    });

    downloadBtn?.addEventListener('click', downloadReport);
    closeBtn?.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open')) close();
    });
}
