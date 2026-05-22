import { state } from '../state.js';
import { trackEvent } from '../analytics.js';
import * as THREE from 'three';

export function initMeasure() {
    const measureBtn = document.getElementById('btn-measure');
    const measureLabel = document.getElementById('measure-label');
    let measurePoints = [];
    let measureLine = null;
    const measureGroup = new THREE.Group();
    state.scene.add(measureGroup);

    measureBtn.addEventListener('click', () => {
        state.measuringActive = !state.measuringActive;
        measureBtn.classList.toggle('active', state.measuringActive);
        if (!state.measuringActive) {
            clearMeasure();
        } else {
            measureLabel.style.display = 'block';
            measureLabel.textContent = 'Click two points to measure distance';
            trackEvent('measure_started');
        }
    });

    function clearMeasure() {
        measurePoints = [];
        while (measureGroup.children.length > 0) {
            const child = measureGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            measureGroup.remove(child);
        }
        measureLine = null;
        measureLabel.style.display = 'none';
    }

    state.renderer.domElement.addEventListener('click', (e) => {
        if (!state.measuringActive) return;

        const mouse = new THREE.Vector2(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(mouse, state.camera);

        const targets = [
            ...(state.formationGroup.visible ? state.formationGroup.children.filter(m => m.visible) : []),
            ...state.boreholeGroup.children,
        ];
        const hits = ray.intersectObjects(targets);
        if (hits.length === 0) return;

        const pt = hits[0].point.clone();
        measurePoints.push(pt);

        // Add point marker
        const dotGeo = new THREE.SphereGeometry(30, 8, 8);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0x58a6ff });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(pt);
        measureGroup.add(dot);

        if (measurePoints.length === 2) {
            // Draw line
            const lineGeo = new THREE.BufferGeometry().setFromPoints(measurePoints);
            const lineMat = new THREE.LineBasicMaterial({ color: 0x58a6ff, linewidth: 2 });
            measureLine = new THREE.Line(lineGeo, lineMat);
            measureGroup.add(measureLine);

            // Account for vertical exaggeration in distance calculation
            const p1 = measurePoints[0];
            const p2 = measurePoints[1];
            const dx = p2.x - p1.x;
            const dy = (p2.y - p1.y) / state.currentVertExag;
            const dz = p2.z - p1.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const distM = dist.toFixed(0);
            measureLabel.textContent = 'Distance: ' + distM + 'm';
            measureLabel.style.display = 'block';
            trackEvent('measure_completed', { distance_m: parseFloat(distM), point_count: 2 });

            // Reset for next measurement on next click
            state.measuringActive = false;
            measureBtn.classList.remove('active');
        } else {
            measureLabel.textContent = 'Click second point...';
        }
    });
}
