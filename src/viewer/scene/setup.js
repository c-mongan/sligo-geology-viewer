// ── Scene setup module ──────────────────────────────────
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { state } from '../state.js';
import { trackEvent } from '../analytics.js';

/**
 * Forward wheel events from UI overlays to the 3D canvas so
 * scroll-zoom works even when the cursor is over panels/toolbar.
 */
export function initWheelForwarding() {
    document.querySelectorAll('#strat-panel, #controls-panel, #top-bar, #compass, #info-panel, #thermal-card, #site-card, #overlay-legend, #drill-panel').forEach(el => {
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.renderer.domElement.dispatchEvent(new WheelEvent('wheel', {
                deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ,
                deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY,
                bubbles: false, cancelable: true,
            }));
        }, { passive: false });
    });
}

/**
 * Keyboard zoom: +/- keys (skip when typing in chat).
 * Directly move camera rather than dispatching synthetic WheelEvents
 * because OrbitControls ignores untrusted (isTrusted=false) events.
 */
export function initKeyboardZoom() {
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        let scale = 0;
        if (e.key === '+' || e.key === '=') scale = 0.9;       // zoom in 10%
        else if (e.key === '-' || e.key === '_') scale = 1.1;   // zoom out 10%
        if (scale) {
            e.preventDefault();
            const offset = state.camera.position.clone().sub(state.controls.target);
            offset.multiplyScalar(scale);
            state.camera.position.copy(state.controls.target).add(offset);
            state.controls.update();
        }
    });
}

// ── WASD + keyboard navigation ─────────────────────────
const keysPressed = {};

export function initKeyboardNav() {
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        keysPressed[e.key.toLowerCase()] = true;

        // Home / 0: reset view
        if (e.key === 'Home' || e.key === '0') {
            e.preventDefault();
            state.camera.position.set(10000, 5000, 10000);
            state.controls.target.set(0, -200, 0);
            state.controls.update();
            trackEvent('keyboard_reset_view');
        }
        // ? or H: toggle help overlay
        if (e.key === '?' || (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey)) {
            e.preventDefault();
            toggleKeyboardHelp();
        }
    });

    window.addEventListener('keyup', (e) => {
        keysPressed[e.key.toLowerCase()] = false;
    });

    // Lose all keys on window blur to prevent stuck keys
    window.addEventListener('blur', () => {
        for (const k in keysPressed) keysPressed[k] = false;
    });

    buildKeyboardHelp();
}

/**
 * Called every frame from animate() to apply smooth WASD movement.
 * Moves both camera and target together so the view pans without rotating.
 */
export function updateKeyboardNav() {
    if (!state.camera || !state.controls) return;
    const isTyping = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
    if (isTyping) return;

    const speed = keysPressed['shift'] ? 300 : 100;

    // Camera forward/right vectors (horizontal plane only)
    const forward = new THREE.Vector3();
    state.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3();

    // WASD / arrow keys for pan
    if (keysPressed['w'] || keysPressed['arrowup']) move.add(forward.clone().multiplyScalar(speed));
    if (keysPressed['s'] || keysPressed['arrowdown']) move.add(forward.clone().multiplyScalar(-speed));
    if (keysPressed['a'] || keysPressed['arrowleft']) move.add(right.clone().multiplyScalar(-speed));
    if (keysPressed['d'] || keysPressed['arrowright']) move.add(right.clone().multiplyScalar(speed));

    // Q/E for vertical movement
    if (keysPressed['q']) move.y -= speed;
    if (keysPressed['e']) move.y += speed;

    // R/F for orbit rotate (yaw around target)
    if (keysPressed['r'] || keysPressed['f']) {
        const angle = (keysPressed['r'] ? 1 : -1) * 0.02;
        const offset = state.camera.position.clone().sub(state.controls.target);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const x = offset.x * cos - offset.z * sin;
        const z = offset.x * sin + offset.z * cos;
        offset.x = x;
        offset.z = z;
        state.camera.position.copy(state.controls.target).add(offset);
        state.controls.update();
    }

    if (move.lengthSq() > 0) {
        state.camera.position.add(move);
        state.controls.target.add(move);
        state.controls.update();
    }
}

// ── Keyboard help overlay ──────────────────────────────
function buildKeyboardHelp() {
    const overlay = document.createElement('div');
    overlay.id = 'keyboard-help';
    overlay.style.cssText = `
        display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        background:rgba(12,17,23,0.95); border:1px solid rgba(110,168,254,0.3);
        border-radius:12px; padding:24px 32px; z-index:10000; color:#e6edf3;
        font-family:system-ui,sans-serif; min-width:340px; backdrop-filter:blur(10px);
        box-shadow:0 8px 32px rgba(0,0,0,0.5);
    `;
    overlay.innerHTML = `
        <h3 style="margin:0 0 16px; font-size:16px; color:#6ea8fe; display:flex; align-items:center; gap:8px;">
            ⌨️ Keyboard Shortcuts
            <span style="margin-left:auto; font-size:12px; color:#484f58; cursor:pointer;" onclick="this.closest('#keyboard-help').style.display='none'">✕ ESC</span>
        </h3>
        <table style="border-collapse:collapse; width:100%; font-size:13px;">
            <tr><td style="padding:4px 12px 4px 0; color:#8b949e;">W A S D</td><td>Pan forward / left / back / right</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#8b949e;">Arrow keys</td><td>Pan (same as WASD)</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#8b949e;">Q / E</td><td>Move down / up</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#8b949e;">R / F</td><td>Orbit left / right</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#8b949e;">+ / −</td><td>Zoom in / out</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#8b949e;">Shift</td><td>Hold for 3× speed</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#8b949e;">Home / 0</td><td>Reset view</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#8b949e;">Escape</td><td>Close panel / this help</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#8b949e;">Enter</td><td>Open chat</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#8b949e;">H / ?</td><td>Toggle this help</td></tr>
        </table>
        <p style="margin:12px 0 0; font-size:11px; color:#484f58;">Mouse: Left-drag rotate · Right-drag pan · Scroll zoom</p>
    `;
    document.body.appendChild(overlay);
}

function toggleKeyboardHelp() {
    const el = document.getElementById('keyboard-help');
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
    trackEvent('keyboard_help_toggled', { visible: el.style.display !== 'none' });
}

/**
 * Creates scene, camera, renderer, controls, lights, sky, environment map.
 * Stores everything in state.
 * @returns {{ scene, camera, renderer, controls }}
 */
export function initScene() {
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1117);
    scene.fog = new THREE.FogExp2(0x0c1117, 0.000025); // subtle depth fog

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 100000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    renderer.domElement.addEventListener('webglcontextlost', (e) => {
        trackEvent('webgl_context_lost', { message: e.statusMessage || '' });
    });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 500;
    controls.maxDistance = 50000;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.listenToKeyEvents(window);
    controls.keyPanSpeed = 25;

    // Better lighting
    // HemisphereLight: sky blue from above, warm earth-brown from below
    // Gives geological terrain a natural outdoor feel vs flat AmbientLight
    const hemiLight = new THREE.HemisphereLight(0xb1cce7, 0x8b7d6b, 0.6);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    sunLight.position.set(5000, 8000, 3000);
    sunLight.castShadow = true;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x8899cc, 0.4);
    fillLight.position.set(-3000, 2000, -5000);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xaabbff, 0.2);
    rimLight.position.set(0, -2000, 0);
    scene.add(rimLight);

    // ── Sky + environment lighting ──────────────────────
    const sky = new Sky();
    sky.scale.setScalar(100000);
    scene.add(sky);
    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 4;
    skyUniforms['rayleigh'].value = 1.5;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.8;
    // Sun position: low overcast Irish sky
    const sunPos = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(90 - 25); // 25° elevation
    const theta = THREE.MathUtils.degToRad(200); // SSW
    sunPos.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(sunPos);
    // Generate environment map from sky for realistic reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    skyScene.add(sky.clone());
    const envMap = pmremGenerator.fromScene(skyScene, 0, 0.1, 100000).texture;
    scene.environment = envMap;
    pmremGenerator.dispose();

    // Store in state
    state.scene = scene;
    state.camera = camera;
    state.renderer = renderer;
    state.controls = controls;

    return { scene, camera, renderer, controls };
}
