import { state } from '../state.js';
import { trackEvent } from '../analytics.js';
import { getDesignFocusModel } from '../utils.js';
import { setDesignBheDepthVisible } from './controls.js';
import * as THREE from 'three';

function setCheckbox(id, checked) {
    const input = document.getElementById(id);
    if (!input || input.checked === checked) return;
    input.checked = checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSubsurfaceForView(view) {
    const showSubsurface = view === 'ew-section' || view === 'ns-section' || view === 'proposed-site';
    const showGeology = showSubsurface;
    const showSurfaceContext = !showSubsurface;
    setCheckbox('tog-terrain', true);
    setCheckbox('tog-satellite', true);
    setCheckbox('tog-geology-surfaces', showGeology);
    setCheckbox('tog-faults', showSubsurface && view !== 'proposed-site');
    setCheckbox('tog-srsc-col', showSubsurface && view !== 'proposed-site');
    setDesignBheDepthVisible(showSubsurface);
    setCheckbox('tog-proposed-site', true);
    if (showSurfaceContext) {
        setCheckbox('tog-boreholes', true);
        setCheckbox('tog-srsc', true);
    }
}

export function animateCamera(pos, target, duration = 1200) {
    const startPos = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const endPos = new THREE.Vector3(...pos);
    const endTarget = new THREE.Vector3(...target);
    const startTime = performance.now();

    function step(now) {
        let t = Math.min((now - startTime) / duration, 1);
        // Ease in-out cubic
        t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        state.camera.position.lerpVectors(startPos, endPos, t);
        state.controls.target.lerpVectors(startTarget, endTarget, t);
        state.controls.update();

        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

export const viewPresets = {
    'overview': {
        setup: () => {
            const f = getDesignFocusModel();
            return { pos: [f.x + 10000, 5000, f.z + 10000], target: [f.x, -200, f.z] };
        },
    },
    'ew-section': {
        setup: () => {
            const f = getDesignFocusModel();
            return { pos: [f.x, 1000, f.z + 12000], target: [f.x, -400, f.z] };
        },
    },
    'ns-section': {
        setup: () => {
            const f = getDesignFocusModel();
            return { pos: [f.x + 12000, 1000, f.z], target: [f.x, -400, f.z] };
        },
    },
    'boreholes': {
        setup: () => {
            const f = getDesignFocusModel();
            return { pos: [f.x + 900, 950, f.z + 900], target: [f.x, 70, f.z] };
        },
    },
    'proposed-site': {
        setup: () => {
            const f = getDesignFocusModel();
            return { pos: [f.x + 760, 980, f.z + 1040], target: [f.x, -180, f.z] };
        },
    },
    'top': {
        setup: () => {
            const f = getDesignFocusModel();
            return { pos: [f.x, 15000, f.z], target: [f.x, 0, f.z] };
        },
    },
};

export function initViewButtons() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const view = btn.dataset.view;
            let preset = viewPresets[view];
            if (preset.setup) {
                const override = preset.setup();
                if (override) preset = override;
            }
            setSubsurfaceForView(view);
            animateCamera(preset.pos, preset.target);
            trackEvent('camera_fly_to', { preset_name: view });

            // Show section label + auto-enable cross-section clipping
            const label = document.getElementById('section-label');
            const ewClip = document.getElementById('tog-clip');
            const nsClip = document.getElementById('tog-clip-ns');
            if (view === 'ew-section') {
                label.textContent = 'East-West Cross-Section through SRSC';
                label.style.display = 'block';
                ewClip.checked = false; nsClip.checked = true;
                nsClip.dispatchEvent(new Event('change'));
                ewClip.dispatchEvent(new Event('change'));
            } else if (view === 'ns-section') {
                label.textContent = 'North-South Cross-Section through SRSC';
                label.style.display = 'block';
                nsClip.checked = false; ewClip.checked = true;
                ewClip.dispatchEvent(new Event('change'));
                nsClip.dispatchEvent(new Event('change'));
            } else {
                label.style.display = 'none';
                ewClip.checked = false; nsClip.checked = false;
                ewClip.dispatchEvent(new Event('change'));
                nsClip.dispatchEvent(new Event('change'));
            }
        });
    });
}
