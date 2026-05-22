import { state } from '../state.js';
import { trackEvent } from '../analytics.js';
import { updateKeyboardNav } from '../scene/setup.js';
import * as THREE from 'three';

let pulseTime = 0;

export function updateCompass() {
    // Get camera's horizontal angle relative to North (positive Z)
    const dir = new THREE.Vector3();
    state.camera.getWorldDirection(dir);
    const angle = Math.atan2(dir.x, dir.z);
    const compassSvg = document.getElementById('compass-svg');
    if (compassSvg) {
        compassSvg.style.transform = 'rotate(' + (angle * 180 / Math.PI) + 'deg)';
    }
}

export function animate() {
    requestAnimationFrame(animate);
    updateKeyboardNav();
    state.controls.update();

    // Pulse SRSC ring
    pulseTime += 0.03;
    if (state.srscGroup.userData.ring && state.srscGroup.userData.ringMat) {
        const scale = 1 + 0.3 * Math.sin(pulseTime);
        state.srscGroup.userData.ring.scale.set(scale, scale, 1);
        state.srscGroup.userData.ringMat.opacity = 0.3 + 0.2 * Math.cos(pulseTime);
    }

    for (const obj of state.gsiWellGroup.children) {
        const d = obj.userData;
        if (!d.isPulseRing) continue;
        const phase = pulseTime + (d.baseX + d.baseZ) * 0.0002;
        const minScale = d.pulseMinScale || 1;
        const maxScale = d.pulseMaxScale || 1.3;
        const t = 0.5 + 0.5 * Math.sin(phase);
        const ringScale = minScale + (maxScale - minScale) * t;
        obj.scale.set(ringScale, ringScale, 1);
        if (obj.material) {
            obj.material.opacity = (d.pulseOpacityBase || 0.15) + (d.pulseOpacityRange || 0.15) * (1 - t);
        }
    }

    updateCompass();
    state.renderer.render(state.scene, state.camera);
}

export function initResize() {
    window.addEventListener('resize', () => {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    });
}
