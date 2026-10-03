# VR Mammalian Cell Culture Laboratory — Browser Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional, self-contained first-person 3D web application that replicates the five-phase mammalian cell culture passaging workflow defined in SRS-VR-MCL-2026-V3.0, runnable in Chrome with zero build overhead.

**Architecture:** A Three.js-based first-person 3D scene with PointerLockControls and raycasting drives a strict finite state machine (States 0–6). All biology math, reagent state, and session logging live in dedicated ES modules. The UI layer is an HTML/CSS overlay for HUD, modals, and terminals. Data stores D1/D2/D3 from Appendix A are maintained in-memory as plain JS objects.

**Tech Stack:** Three.js r170 (CDN), vanilla ES modules, HTML5/CSS3 overlay, no build tools required (single `index.html` entry point with `<script type="module">` imports).

---

## File Structure

```
e:\Users\Steven\Desktop\School\VR_LAB\
├── index.html            # Canvas, HUD overlays, modals, terminals
├── style.css             # All styling: HUD, warnings, crosshair, modals
├── main.js               # Three.js scene, render loop, lighting, FPS controls
├── stateMachine.js        # FSM states 0-6, transition guards (Table 2.1)
├── labObjects.js          # 3D meshes & colliders for all lab equipment
├── biologyEngine.js       # Timers, cell state, hemocytometer math, C1V1=C2V2
└── sessionManager.js      # D1/D2/D3 data stores, log export, admin auth
```

**Responsibility Map:**

| File | Responsibility |
|------|---------------|
| `index.html` | Canvas mount, all HTML for HUD banners, reticle, tooltips, microscope viewport modal, hemocytometer modal, admin terminal modal, vessel label form, timer readouts, PPE status indicators |
| `style.css` | Crosshair reticle, HUD layout, warning banner animations (`[HZ-001]`–`[HZ-004]`), modal styling, button/form styles, microscope viewport grid, hemocytometer grid, admin panel |
| `main.js` | Three.js `WebGLRenderer`, `PerspectiveCamera`, `Scene`, ambient+directional lighting, `PointerLockControls` (WASD/mouse), animation loop with `requestAnimationFrame`, raycasting for object interaction, keyboard event dispatch (`E` interact, `Space` tap, `F2` admin) |
| `stateMachine.js` | `LabStateMachine` class with states `ANTEROOM(0)`, `CABINET_SETUP(1)`, `INSPECTION(2)`, `DISSOCIATION(3)`, `QUANTIFICATION(4)`, `INOCULATION(5)`, `COMPLETE(6)`. Each transition has guard functions checking D2/D3. Exports `canTransition()`, `transition()`, `getCurrentState()` |
| `labObjects.js` | Factory functions creating Three.js `Group`/`Mesh` objects for: BSC cabinet, glass sash (moveable), microscope, incubator, PPE locker, supply shelf, reagent bottles, T-75 flask, pipettes, vacuum wand, waste trap, hemocytometer, microcentrifuge tubes. Each object has `.userData` for interaction metadata |
| `biologyEngine.js` | `BiologyEngine` class managing: trypsin countdown timer, cell adhesion state machine (`Adherent`→`Rounding`→`Suspension`/`Lysed`), viability degradation on overexposure (−65%), hemocytometer ground-truth cell generation, concentration formula `(live/4)*2*10^4`, viability formula `(live/total)*100`, C1V1=C2V2 seed volume calculator, confluency ground-truth comparison |
| `sessionManager.js` | `SessionManager` class with `D1` (protocol constants from Table A.1), `D2` (session log from Table A.2), `D3` (reagent state from Table A.3). Admin auth (`admin123`, 3-attempt lockout), JSON export, scenario parameter adjustment |

---

## Task 1: Project Scaffold, Three.js Scene & First-Person Controls

**Files:**
- Create: `e:\Users\Steven\Desktop\School\VR_LAB\index.html`
- Create: `e:\Users\Steven\Desktop\School\VR_LAB\style.css`
- Create: `e:\Users\Steven\Desktop\School\VR_LAB\main.js`

This task sets up the empty 3D scene with working first-person navigation. No lab objects yet — just an empty room, lighting, and movement.

- [ ] **Step 1: Create `index.html` — canvas mount and HUD skeleton**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VR Cell Culture Laboratory</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <!-- Click-to-start overlay -->
    <div id="blocker">
        <div id="instructions">
            <h1>VR Cell Culture Laboratory</h1>
            <p>Click to start</p>
            <p class="sub">WASD to move &bull; Mouse to look &bull; E to interact &bull; ESC to pause</p>
        </div>
    </div>

    <!-- HUD Overlay (always visible during gameplay) -->
    <div id="hud" class="hidden">
        <!-- Crosshair reticle -->
        <div id="crosshair">+</div>

        <!-- Top-center: current phase banner -->
        <div id="phase-banner">Phase 0: Anteroom</div>

        <!-- Top-right: timer readout -->
        <div id="timer-readout" class="hidden">
            <span id="timer-label">Timer:</span>
            <span id="timer-value">00:00</span>
        </div>

        <!-- Bottom-left: PPE status -->
        <div id="ppe-status">
            <div class="ppe-item" data-ppe="gloves">🧤 Gloves: <span class="status-off">OFF</span></div>
            <div class="ppe-item" data-ppe="coat">🥼 Lab Coat: <span class="status-off">OFF</span></div>
            <div class="ppe-item" data-ppe="eyewear">🥽 Eye Protection: <span class="status-off">OFF</span></div>
        </div>

        <!-- Bottom-center: interaction tooltip -->
        <div id="tooltip" class="hidden">Press E to interact</div>

        <!-- Top-center: warning banner (HZ alerts) -->
        <div id="warning-banner" class="hidden">
            <span id="warning-text"></span>
        </div>

        <!-- BSC status indicators -->
        <div id="bsc-status" class="hidden">
            <div>Blower: <span id="bsc-blower-status">OFF</span></div>
            <div>HEPA: <span id="bsc-hepa-status">—</span></div>
            <div>Sash: <span id="bsc-sash-status">—</span></div>
            <div>Surface: <span id="bsc-surface-status">Not sanitized</span></div>
        </div>
    </div>

    <!-- Microscope viewport modal (State 2) -->
    <div id="microscope-modal" class="modal hidden">
        <div class="modal-content microscope-viewport">
            <h2>Phase-Contrast Microscope</h2>
            <div id="microscope-canvas-container">
                <canvas id="microscope-canvas" width="600" height="400"></canvas>
            </div>
            <div class="microscope-controls">
                <button class="objective-btn active" data-magnification="4">4x</button>
                <button class="objective-btn" data-magnification="10">10x</button>
                <button class="objective-btn" data-magnification="40">40x</button>
            </div>
            <div class="confluency-input">
                <label>Estimated Confluency (%):</label>
                <input type="number" id="confluency-input" min="0" max="100" step="1">
                <button id="confluency-submit">Submit Assessment</button>
            </div>
            <button id="microscope-close" class="modal-close">Close Viewport</button>
        </div>
    </div>

    <!-- Hemocytometer viewport modal (State 4) -->
    <div id="hemocytometer-modal" class="modal hidden">
        <div class="modal-content hemocytometer-viewport">
            <h2>Hemocytometer — Neubauer Grid</h2>
            <canvas id="hemocytometer-canvas" width="600" height="600"></canvas>
            <div id="hemo-counters">
                <div>Viable (clear): <span id="live-count">0</span></div>
                <div>Non-viable (blue): <span id="dead-count">0</span></div>
                <div>Quadrants tallied: <span id="quadrants-done">0</span> / 4</div>
            </div>
            <div id="hemo-quad-select">
                <span>Counting quadrant:</span>
                <button class="quad-btn active" data-quad="0">TL</button>
                <button class="quad-btn" data-quad="1">TR</button>
                <button class="quad-btn" data-quad="2">BL</button>
                <button class="quad-btn" data-quad="3">BR</button>
            </div>
            <button id="hemo-finish" class="hidden">Finish Counting</button>
            <button id="hemo-close" class="modal-close">Close</button>
        </div>
    </div>

    <!-- Calculation / results modals -->
    <div id="calculation-modal" class="modal hidden">
        <div class="modal-content">
            <h2 id="calc-modal-title">Calculation</h2>
            <div id="calc-modal-body"></div>
            <button id="calc-modal-ok" class="modal-close">OK</button>
        </div>
    </div>

    <!-- Vessel labeling form (State 5) -->
    <div id="label-modal" class="modal hidden">
        <div class="modal-content">
            <h2>Vessel Labeling</h2>
            <div class="label-form">
                <label>Cell Line: <input type="text" id="label-line" value="CHO-K1" readonly></label>
                <label>Passage: <input type="text" id="label-passage" readonly></label>
                <label>Date: <input type="text" id="label-date" readonly></label>
                <label>Operator Initials: <input type="text" id="label-initials" maxlength="4" placeholder="e.g. SR"></label>
            </div>
            <button id="label-submit">Attach Label</button>
        </div>
    </div>

    <!-- Inoculation calculation form (State 5) -->
    <div id="inoculation-modal" class="modal hidden">
        <div class="modal-content">
            <h2>Inoculum Volume Calculation</h2>
            <p>C1 (your viable concentration): <span id="inoc-c1"></span> cells/mL</p>
            <p>C2 (target seeding density): 1.0 × 10<sup>5</sup> cells/mL</p>
            <p>V2 (destination volume): 10.0 mL</p>
            <label>V1 (inoculum volume in mL): <input type="number" id="inoc-v1" step="0.01" min="0"></label>
            <button id="inoc-submit">Submit</button>
        </div>
    </div>

    <!-- Admin terminal (F2) -->
    <div id="admin-modal" class="modal hidden">
        <div class="modal-content admin-panel">
            <h2>Instructor Administrative Terminal</h2>
            <div id="admin-login">
                <label>PIN: <input type="password" id="admin-pin" maxlength="10"></label>
                <button id="admin-login-btn">Authenticate</button>
                <p id="admin-login-error" class="hidden error-text"></p>
            </div>
            <div id="admin-controls" class="hidden">
                <h3>Scenario Configuration (D1)</h3>
                <label>Starting Confluency:
                    <select id="admin-confluency">
                        <option value="40">40%</option>
                        <option value="80" selected>80%</option>
                        <option value="100">100%</option>
                    </select>
                </label>
                <label>Ground Truth Cell Density (cells/mL):
                    <input type="number" id="admin-density" value="1000000" min="100000" max="5000000">
                </label>
                <h3>Session Logs (D2)</h3>
                <div id="admin-logs"></div>
                <button id="admin-export">Export Session JSON</button>
                <button id="admin-close" class="modal-close">Close Terminal</button>
            </div>
        </div>
    </div>

    <!-- Confirmation / instruction hold modals -->
    <div id="confirm-modal" class="modal hidden">
        <div class="modal-content">
            <h2 id="confirm-title">Confirmation</h2>
            <p id="confirm-message"></p>
            <div class="confirm-buttons">
                <button id="confirm-yes">Confirm</button>
                <button id="confirm-no">Cancel</button>
            </div>
        </div>
    </div>

    <!-- Session complete / audit summary -->
    <div id="audit-modal" class="modal hidden">
        <div class="modal-content">
            <h2>Session Complete — Audit Summary</h2>
            <pre id="audit-json"></pre>
            <button id="audit-export">Download JSON</button>
            <button id="audit-restart">New Session</button>
        </div>
    </div>

    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
        }
    }
    </script>
    <script type="module" src="main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `style.css` — full HUD, modal, and warning styling**

```css
/* === Reset & Base === */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { overflow: hidden; background: #000; font-family: 'Segoe UI', Arial, sans-serif; color: #e0e0e0; }
canvas { display: block; }

/* === Blocker / Instructions === */
#blocker {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
}
#blocker.hidden { display: none; }
#instructions { text-align: center; color: #fff; }
#instructions h1 { font-size: 2.5rem; margin-bottom: 1rem; color: #4fc3f7; }
#instructions p { font-size: 1.2rem; margin-bottom: 0.5rem; }
#instructions .sub { font-size: 0.9rem; color: #aaa; }

/* === HUD === */
#hud { position: fixed; inset: 0; z-index: 100; pointer-events: none; }
#hud.hidden { display: none; }
#hud * { pointer-events: auto; }

/* Crosshair */
#crosshair {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    font-size: 24px; color: rgba(255,255,255,0.7);
    text-shadow: 0 0 4px rgba(0,0,0,0.8);
    pointer-events: none;
}

/* Phase Banner */
#phase-banner {
    position: absolute; top: 12px; left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.7); padding: 8px 24px;
    border-radius: 4px; font-size: 1.1rem; font-weight: 600;
    color: #4fc3f7; border: 1px solid #4fc3f7;
}

/* Timer Readout */
#timer-readout {
    position: absolute; top: 12px; right: 20px;
    background: rgba(0,0,0,0.7); padding: 8px 16px;
    border-radius: 4px; font-size: 1.1rem;
    color: #ffb74d; border: 1px solid #ffb74d;
}
#timer-readout.critical { color: #f44336; border-color: #f44336; animation: pulse 0.5s infinite alternate; }

/* PPE Status */
#ppe-status {
    position: absolute; bottom: 20px; left: 20px;
    background: rgba(0,0,0,0.7); padding: 10px 14px;
    border-radius: 4px; font-size: 0.9rem;
}
.ppe-item { margin: 4px 0; }
.status-off { color: #f44336; font-weight: 600; }
.status-on { color: #4caf50; font-weight: 600; }

/* Tooltip */
#tooltip {
    position: absolute; bottom: 80px; left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8); padding: 8px 20px;
    border-radius: 4px; font-size: 1rem; color: #fff;
    border: 1px solid #666;
}

/* Warning Banner */
#warning-banner {
    position: absolute; top: 60px; left: 50%;
    transform: translateX(-50%);
    background: rgba(255,152,0,0.9); padding: 10px 30px;
    border-radius: 4px; font-size: 1rem; font-weight: 700;
    color: #000; min-width: 400px; text-align: center;
    animation: warningPulse 1s infinite alternate;
}
#warning-banner.severe { background: rgba(244,67,54,0.95); color: #fff; }
@keyframes warningPulse {
    from { opacity: 0.85; } to { opacity: 1.0; }
}
@keyframes pulse {
    from { opacity: 0.6; } to { opacity: 1.0; }
}

/* BSC Status */
#bsc-status {
    position: absolute; bottom: 20px; right: 20px;
    background: rgba(0,0,0,0.7); padding: 10px 14px;
    border-radius: 4px; font-size: 0.85rem;
}

/* === Modals === */
.modal {
    position: fixed; inset: 0; z-index: 500;
    background: rgba(0,0,0,0.8);
    display: flex; align-items: center; justify-content: center;
}
.modal.hidden { display: none; }
.modal-content {
    background: #1e1e1e; border: 1px solid #4fc3f7; border-radius: 8px;
    padding: 24px 32px; max-width: 700px; width: 90%;
    max-height: 90vh; overflow-y: auto; color: #e0e0e0;
}
.modal-content h2 { color: #4fc3f7; margin-bottom: 16px; }
.modal-content label { display: block; margin: 8px 0; }
.modal-content input, .modal-content select {
    background: #2a2a2a; border: 1px solid #555; color: #e0e0e0;
    padding: 6px 10px; border-radius: 4px; font-size: 0.95rem;
}
.modal-content button {
    background: #4fc3f7; color: #000; border: none;
    padding: 8px 20px; border-radius: 4px; font-weight: 600;
    cursor: pointer; margin: 8px 4px; font-size: 0.95rem;
}
.modal-content button:hover { background: #81d4fa; }
.modal-close { background: #666 !important; color: #fff !important; }
.modal-close:hover { background: #888 !important; }

/* Confirm modal */
.confirm-buttons { display: flex; gap: 12px; margin-top: 16px; }

/* Error text */
.error-text { color: #f44336; font-size: 0.9rem; margin-top: 6px; }

/* === Microscope === */
.microscope-viewport { max-width: 750px; }
#microscope-canvas-container { background: #000; border-radius: 4px; text-align: center; }
#microscope-canvas { border-radius: 50%; border: 3px solid #333; }
.microscope-controls { display: flex; gap: 8px; margin: 12px 0; justify-content: center; }
.objective-btn { min-width: 60px; }
.objective-btn.active { background: #ff9800; color: #000; }
.confluency-input { margin-top: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

/* === Hemocytometer === */
.hemocytometer-viewport { max-width: 750px; }
#hemocytometer-canvas { border: 2px solid #555; display: block; margin: 0 auto; cursor: crosshair; }
#hemo-counters { display: flex; gap: 20px; margin: 12px 0; justify-content: center; font-size: 1.05rem; }
#hemo-quad-select { display: flex; gap: 8px; align-items: center; margin: 8px 0; justify-content: center; }
.quad-btn { min-width: 40px; }
.quad-btn.active { background: #ff9800; color: #000; }

/* === Admin === */
.admin-panel { max-width: 600px; }
#admin-logs { max-height: 200px; overflow-y: auto; background: #111; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 0.85rem; margin: 8px 0; }

/* === Audit === */
#audit-json { background: #111; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 0.8rem; max-height: 400px; overflow-y: auto; white-space: pre-wrap; }

/* === Hidden utility === */
.hidden { display: none !important; }
```

- [ ] **Step 3: Create `main.js` — Three.js scene, renderer, PointerLockControls, basic room geometry, render loop**

```js
// main.js — Three.js scene setup, render loop, first-person controls
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { LabStateMachine } from './stateMachine.js';
import { createLabEnvironment } from './labObjects.js';
import { BiologyEngine } from './biologyEngine.js';
import { SessionManager } from './sessionManager.js';

// ——— Core Three.js setup ———
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 20, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, 1.65, 8); // eye height ~1.65m, start in anteroom area

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// ——— Lighting ———
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
mainLight.position.set(5, 8, 5);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(2048, 2048);
mainLight.shadow.camera.near = 0.5;
mainLight.shadow.camera.far = 30;
mainLight.shadow.camera.left = -15;
mainLight.shadow.camera.right = 15;
mainLight.shadow.camera.top = 15;
mainLight.shadow.camera.bottom = -15;
scene.add(mainLight);

// Ceiling fluorescent lights
const ceilingLight1 = new THREE.PointLight(0xe0f0ff, 0.5, 15);
ceilingLight1.position.set(-3, 3.8, 0);
scene.add(ceilingLight1);
const ceilingLight2 = new THREE.PointLight(0xe0f0ff, 0.5, 15);
ceilingLight2.position.set(3, 3.8, 0);
scene.add(ceilingLight2);

// ——— Pointer Lock Controls ———
const controls = new PointerLockControls(camera, document.body);

const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const hud = document.getElementById('hud');

instructions.addEventListener('click', () => { controls.lock(); });

controls.addEventListener('lock', () => {
    blocker.classList.add('hidden');
    hud.classList.remove('hidden');
});

controls.addEventListener('unlock', () => {
    // Only show blocker if no modal is open
    if (!isAnyModalOpen()) {
        blocker.classList.remove('hidden');
        hud.classList.add('hidden');
    }
});

function isAnyModalOpen() {
    const modals = document.querySelectorAll('.modal');
    for (const m of modals) {
        if (!m.classList.contains('hidden')) return true;
    }
    return false;
}

// ——— Movement ———
const moveSpeed = 4.0;
const keys = { forward: false, backward: false, left: false, right: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp':    keys.forward = true; break;
        case 'KeyS': case 'ArrowDown':  keys.backward = true; break;
        case 'KeyA': case 'ArrowLeft':  keys.left = true; break;
        case 'KeyD': case 'ArrowRight': keys.right = true; break;
        case 'KeyE': handleInteraction(); break;
        case 'Space': handleTap(); break;
        case 'F2': e.preventDefault(); handleAdminToggle(); break;
    }
});

document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp':    keys.forward = false; break;
        case 'KeyS': case 'ArrowDown':  keys.backward = false; break;
        case 'KeyA': case 'ArrowLeft':  keys.left = false; break;
        case 'KeyD': case 'ArrowRight': keys.right = false; break;
    }
});

// ——— Raycasting ———
const raycaster = new THREE.Raycaster();
raycaster.far = 4; // interaction reach: 4 meters
const rayOrigin = new THREE.Vector2(0, 0); // screen center

// ——— Initialize Systems ———
const sessionManager = new SessionManager();
const biologyEngine = new BiologyEngine(sessionManager);
const stateMachine = new LabStateMachine(sessionManager, biologyEngine);

// ——— Create Lab Environment ———
const labEnv = createLabEnvironment(scene, sessionManager);

// ——— Interaction system ———
let currentTarget = null;

function updateRaycast() {
    raycaster.setFromCamera(rayOrigin, camera);
    const interactables = labEnv.getInteractables();
    const intersects = raycaster.intersectObjects(interactables, true);

    const tooltip = document.getElementById('tooltip');
    if (intersects.length > 0) {
        // Walk up to find the interactable parent
        let obj = intersects[0].object;
        while (obj && !obj.userData.interactable) {
            obj = obj.parent;
        }
        if (obj && obj.userData.interactable) {
            currentTarget = obj;
            const label = obj.userData.tooltipText || 'Press E to interact';
            tooltip.textContent = label;
            tooltip.classList.remove('hidden');
            return;
        }
    }
    currentTarget = null;
    tooltip.classList.add('hidden');
}

function handleInteraction() {
    if (!controls.isLocked) return;
    if (isAnyModalOpen()) return;
    if (!currentTarget) return;

    const action = currentTarget.userData.onInteract;
    if (typeof action === 'function') {
        action(currentTarget, { stateMachine, sessionManager, biologyEngine, labEnv, camera, controls, scene });
    }
}

function handleTap() {
    if (!controls.isLocked && !isAnyModalOpen()) return;
    biologyEngine.registerTap(stateMachine);
}

function handleAdminToggle() {
    const modal = document.getElementById('admin-modal');
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        controls.unlock();
        sessionManager.prepareAdminPanel();
    } else {
        modal.classList.add('hidden');
        controls.lock();
    }
}

// ——— Collision bounds (simple AABB for walls) ———
function clampPlayerPosition() {
    const pos = camera.position;
    const minX = -5.5, maxX = 5.5;
    const minZ = -9.5, maxZ = 9.5;
    pos.x = Math.max(minX, Math.min(maxX, pos.x));
    pos.z = Math.max(minZ, Math.min(maxZ, pos.z));
    pos.y = 1.65; // lock eye height
}

// ——— Animation Loop ———
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Movement
    if (controls.isLocked) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(keys.forward) - Number(keys.backward);
        direction.x = Number(keys.right) - Number(keys.left);
        direction.normalize();

        if (keys.forward || keys.backward) velocity.z -= direction.z * moveSpeed * delta;
        if (keys.left || keys.right) velocity.x -= direction.x * moveSpeed * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        clampPlayerPosition();
    }

    // Raycast for interaction targets
    if (controls.isLocked) {
        updateRaycast();
    }

    // Update biology timers
    biologyEngine.update(delta, stateMachine);

    // Update lab visuals
    labEnv.update(delta, stateMachine, sessionManager);

    renderer.render(scene, camera);
}

animate();

// ——— Resize handler ———
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ——— Wire up modal close buttons & admin auth ———
document.getElementById('admin-login-btn').addEventListener('click', () => {
    const pin = document.getElementById('admin-pin').value;
    sessionManager.authenticate(pin);
});

document.getElementById('admin-export').addEventListener('click', () => {
    sessionManager.exportSessionJSON();
});

document.getElementById('admin-close').addEventListener('click', () => {
    document.getElementById('admin-modal').classList.add('hidden');
    controls.lock();
});

// Confluency submit
document.getElementById('confluency-submit').addEventListener('click', () => {
    const val = parseInt(document.getElementById('confluency-input').value);
    biologyEngine.submitConfluency(val, stateMachine, labEnv);
});

document.getElementById('microscope-close').addEventListener('click', () => {
    document.getElementById('microscope-modal').classList.add('hidden');
    controls.lock();
});

// Hemocytometer quad buttons
document.querySelectorAll('.quad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.quad-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        biologyEngine.setActiveQuadrant(parseInt(btn.dataset.quad));
    });
});

document.getElementById('hemo-finish').addEventListener('click', () => {
    biologyEngine.finishCounting(stateMachine);
});

document.getElementById('hemo-close').addEventListener('click', () => {
    document.getElementById('hemocytometer-modal').classList.add('hidden');
    controls.lock();
});

// Inoculation submit
document.getElementById('inoc-submit').addEventListener('click', () => {
    const v1 = parseFloat(document.getElementById('inoc-v1').value);
    biologyEngine.submitInoculationVolume(v1, stateMachine);
});

// Label submit
document.getElementById('label-submit').addEventListener('click', () => {
    const initials = document.getElementById('label-initials').value.trim();
    biologyEngine.submitVesselLabel(initials, stateMachine, sessionManager);
});

// Audit buttons
document.getElementById('audit-export').addEventListener('click', () => {
    sessionManager.exportSessionJSON();
});
document.getElementById('audit-restart').addEventListener('click', () => {
    location.reload();
});

// Confirm modal buttons
document.getElementById('confirm-yes').addEventListener('click', () => {
    const cb = document.getElementById('confirm-modal')._onConfirm;
    document.getElementById('confirm-modal').classList.add('hidden');
    if (cb) cb();
    else controls.lock();
});
document.getElementById('confirm-no').addEventListener('click', () => {
    const cb = document.getElementById('confirm-modal')._onCancel;
    document.getElementById('confirm-modal').classList.add('hidden');
    if (cb) cb();
    else controls.lock();
});

// Objective buttons
document.querySelectorAll('.objective-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.objective-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        biologyEngine.setMicroscopeMagnification(parseInt(btn.dataset.magnification));
    });
});

// Hemocytometer canvas click handler
document.getElementById('hemocytometer-canvas').addEventListener('click', (e) => {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    biologyEngine.handleHemocytometerClick(x, y, canvas.width, canvas.height);
});

// Export for use by other modules
export { scene, camera, controls, renderer, stateMachine, sessionManager, biologyEngine, labEnv, isAnyModalOpen };
```

- [ ] **Step 4: Open `index.html` in Chrome and verify**

Open `e:\Users\Steven\Desktop\School\VR_LAB\index.html` in Chrome.

Expected:
- The blocker screen appears with "VR Cell Culture Laboratory — Click to start"
- Clicking locks the pointer — the HUD appears with crosshair, phase banner ("Phase 0: Anteroom"), PPE status
- WASD moves, mouse looks, ESC unlocks
- Console may show import errors for modules not yet created — that's expected at this stage

> **Note:** The remaining module files (`stateMachine.js`, `labObjects.js`, `biologyEngine.js`, `sessionManager.js`) are stubbed by Tasks 2–5 below. The app won't fully run until all tasks are complete, but each task is independently testable.

---

## Task 2: Session Manager — D1/D2/D3 Data Stores & Admin Auth

**Files:**
- Create: `e:\Users\Steven\Desktop\School\VR_LAB\sessionManager.js`

This task implements all three data stores from Appendix A, the admin authentication flow (UC-05, UC-06, [FR-025]), and JSON export ([FR-024]).

- [ ] **Step 1: Create `sessionManager.js` — D1 protocol database, D2 session log, D3 reagent state, admin auth**

```js
// sessionManager.js — D1/D2/D3 data stores, admin auth, JSON export

export class SessionManager {
    constructor() {
        // ——— D1: Protocol Database (Read-Only Reference) — Table A.1 ———
        this.D1 = {
            sop_id: 'SOP-MCL-001',
            target_sash_height: 20.0,       // cm
            sash_tolerance: 1.0,            // ±1 cm
            blower_purge_delay: 300,         // seconds (5 min)
            // Accelerated for prototype: 5 seconds real-time
            blower_purge_delay_sim: 5,
            ethanol_evaporation_time: 30,    // seconds
            // Accelerated for prototype: 5 seconds
            ethanol_evaporation_time_sim: 5,
            intake_grille_keepout_dist: 10.0, // cm → 0.1 in scene units (meters)
            media_target_temp: 37.0,         // °C
            confluency_nominal_levels: [40, 80, 100],
            confluency_threshold: 70,        // minimum % for dissociation
            aspiration_flow_rate: 2.0,       // mL/s
            pbs_wash_volume: 5.0,            // mL
            pbs_dispense_angle_limit: 45.0,  // degrees
            trypsin_volume_range: [2.0, 3.0], // mL
            trypsin_volume_nominal: 2.5,     // mL
            trypsin_incubation_nominal: [3.0, 5.0], // minutes
            trypsin_overexposure_limit: 8.0, // minutes
            overexposure_viability_penalty: 0.65, // 65% cells die
            neutralization_min_media: 6.0,   // mL
            trypan_dilution_ratio: 1.0,      // 1:1
            hemocytometer_factor: 10000,     // 10^4
            ground_truth_cell_density: 1000000, // 1.0 × 10^6 cells/mL (default)
            target_seeding_density: 100000,  // 1.0 × 10^5 cells/mL
            destination_volume: 10.0,        // mL
            // Ground truth hemocytometer cells (generated per-session)
            ground_truth_live_cells: 180,
            ground_truth_dead_cells: 10,
            // Starting confluency scenario
            starting_confluency: 80,
        };

        // ——— D2: Student Session Log (Append-Only) — Table A.2 ———
        this.D2 = {
            session_id: this._generateUUID(),
            student_id: 'STU-00001',
            session_timestamp: new Date().toISOString(),
            ppe_status: false,
            blower_purge_completed: false,
            sash_compliance: false,
            ethanol_wait_elapsed: 0,
            grille_blockage_events: 0,
            assessed_confluence_val: null,
            confluence_delta: null,
            aspiration_vol_removed: 0.0,
            pbs_wash_vol_actual: 0.0,
            sidewall_violations: 0,
            trypsin_vol_actual: 0.0,
            trypsin_time_elapsed: 0.0,
            overexposure_flag: false,
            mechanical_tap_detected: false,
            quench_media_vol_actual: 0.0,
            live_cells_counted: 0,
            dead_cells_counted: 0,
            calculated_viability_pct: null,
            calculated_density: null,
            density_variance_pct: null,
            target_seed_vol_input: null,
            seed_calc_delta: null,
            vessel_label_record: null,
            cap_vented_status: false,
            violation_log: [],
            technique_score: 100,
        };

        // ——— D3: Reagent State Database (Runtime) — Table A.3 ———
        this.D3 = {
            workstation_clean_state: false,
            hepa_blower_active: false,
            air_curtain_integrity: true,
            flask_medium_level: 12.0,       // mL — starts with spent medium
            medium_color_state: 'Yellow',   // acidic/spent
            medium_temperature: 37.0,       // °C
            cell_adhesion_state: 'Adherent',
            pbs_volume_in_flask: 0.0,
            active_trypsin_volume: 0.0,
            trypsin_activity_state: 'Inactive',
            pipette_liquid_type: 'None',
            pipette_aspirated_vol: 0.0,
            waste_trap_fill_level: 0.0,
            // Additional runtime state
            sash_height: 0.0,              // cm (starts closed)
            blower_purge_elapsed: 0,       // seconds
            ethanol_evaporation_elapsed: 0,
            ethanol_applied: false,
            ppe_gloves: false,
            ppe_coat: false,
            ppe_eyewear: false,
            apparatus_staged: false,
            flask_on_microscope: false,
            microscope_inspected: false,
            microscope_magnification: 4,
            medium_aspirated: false,
            pbs_washed: false,
            trypsin_applied: false,
            trypsin_timer_running: false,
            trypsin_timer_elapsed: 0.0,    // seconds
            cells_quenched: false,
            trypan_blue_mixed: false,
            hemocytometer_loaded: false,
            cap_vented: false,
            flask_in_incubator: false,
            inoculation_volume_set: false,
            vessel_labeled: false,
        };

        // Admin state
        this._adminAuthenticated = false;
        this._adminAttempts = 0;
        this._adminLocked = false;
        this._adminPin = 'admin123';

        // Session log archive (for multi-session instructor review)
        this._sessionArchive = [];
    }

    _generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ——— PPE ———
    togglePPE(item) {
        if (item === 'gloves') this.D3.ppe_gloves = !this.D3.ppe_gloves;
        else if (item === 'coat') this.D3.ppe_coat = !this.D3.ppe_coat;
        else if (item === 'eyewear') this.D3.ppe_eyewear = !this.D3.ppe_eyewear;

        const allEquipped = this.D3.ppe_gloves && this.D3.ppe_coat && this.D3.ppe_eyewear;
        this.D2.ppe_status = allEquipped;
        this._updatePPEDisplay();
        return allEquipped;
    }

    _updatePPEDisplay() {
        const items = [
            { key: 'gloves', on: this.D3.ppe_gloves },
            { key: 'coat', on: this.D3.ppe_coat },
            { key: 'eyewear', on: this.D3.ppe_eyewear },
        ];
        items.forEach(({ key, on }) => {
            const el = document.querySelector(`.ppe-item[data-ppe="${key}"] span`);
            if (el) {
                el.textContent = on ? 'ON' : 'OFF';
                el.className = on ? 'status-on' : 'status-off';
            }
        });
    }

    isPPEComplete() {
        return this.D3.ppe_gloves && this.D3.ppe_coat && this.D3.ppe_eyewear;
    }

    // ——— BSC ———
    updateBSCDisplay() {
        const blowerEl = document.getElementById('bsc-blower-status');
        const hepaEl = document.getElementById('bsc-hepa-status');
        const sashEl = document.getElementById('bsc-sash-status');
        const surfaceEl = document.getElementById('bsc-surface-status');

        if (blowerEl) blowerEl.textContent = this.D3.hepa_blower_active ? 'ON' : 'OFF';
        if (hepaEl) {
            if (!this.D3.hepa_blower_active) hepaEl.textContent = '—';
            else if (this.D2.blower_purge_completed) hepaEl.textContent = 'Stabilized ✓';
            else hepaEl.textContent = `Purging... ${Math.ceil(this.D1.blower_purge_delay_sim - this.D3.blower_purge_elapsed)}s`;
        }
        if (sashEl) {
            const h = this.D3.sash_height;
            const target = this.D1.target_sash_height;
            const tol = this.D1.sash_tolerance;
            if (h >= target - tol && h <= target + tol) {
                sashEl.textContent = `${h.toFixed(1)} cm ✓`;
                this.D2.sash_compliance = true;
            } else {
                sashEl.textContent = `${h.toFixed(1)} cm`;
            }
        }
        if (surfaceEl) surfaceEl.textContent = this.D3.workstation_clean_state ? 'Sanitized ✓' : 'Not sanitized';
    }

    // ——— Airflow hazard [HZ-001] ———
    logGrilleViolation() {
        this.D2.grille_blockage_events++;
        if (!this.D2.violation_log.includes('HZ-001')) {
            this.D2.violation_log.push('HZ-001');
        }
        this.D2.technique_score = Math.max(0, this.D2.technique_score - 5);
        this.showWarning('[HZ-001] Aseptic Flow Disrupted: Clear Intake Grille');
    }

    clearWarning() {
        const banner = document.getElementById('warning-banner');
        banner.classList.add('hidden');
        banner.classList.remove('severe');
    }

    showWarning(text, severe = false) {
        const banner = document.getElementById('warning-banner');
        const textEl = document.getElementById('warning-text');
        textEl.textContent = text;
        banner.classList.remove('hidden');
        if (severe) banner.classList.add('severe');
        else banner.classList.remove('severe');
    }

    // ——— Sidewall violation ———
    logSidewallViolation() {
        this.D2.sidewall_violations++;
        this.D2.technique_score = Math.max(0, this.D2.technique_score - 10);
        this.showWarning('Procedural Penalty: High Fluid Shear Damage to Monolayer (Perpendicular Dispense)');
        setTimeout(() => this.clearWarning(), 4000);
    }

    // ——— Overexposure [HZ-003] ———
    logOverexposure() {
        this.D2.overexposure_flag = true;
        if (!this.D2.violation_log.includes('HZ-003')) {
            this.D2.violation_log.push('HZ-003');
        }
        this.D2.technique_score = Math.max(0, this.D2.technique_score - 30);
        this.D3.cell_adhesion_state = 'Lysed';
        this.showWarning('[HZ-003] Severe Enzymatic Overexposure: Cell Lysis Active — 65% Viability Loss', true);
    }

    // ——— Timer display ———
    showTimer(label, seconds) {
        const readout = document.getElementById('timer-readout');
        readout.classList.remove('hidden');
        document.getElementById('timer-label').textContent = label;
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        document.getElementById('timer-value').textContent =
            `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

        // Critical state if trypsin > 5 min
        if (label.includes('Trypsin') && seconds > 300) {
            readout.classList.add('critical');
        } else {
            readout.classList.remove('critical');
        }
    }

    hideTimer() {
        document.getElementById('timer-readout').classList.add('hidden');
    }

    // ——— Phase banner ———
    updatePhaseBanner(state) {
        const names = [
            'Phase 0: Anteroom',
            'Phase 1: Cabinet Setup',
            'Phase 2: Microscopic Inspection',
            'Phase 3: Enzymatic Dissociation',
            'Phase 4: Cell Quantification',
            'Phase 5: Inoculation & Storage',
            'Session Complete'
        ];
        const el = document.getElementById('phase-banner');
        if (el) el.textContent = names[state] || `State ${state}`;
    }

    // ——— Admin Auth ([FR-025]) ———
    authenticate(pin) {
        const errorEl = document.getElementById('admin-login-error');
        if (this._adminLocked) {
            errorEl.textContent = 'Terminal locked after 3 failed attempts.';
            errorEl.classList.remove('hidden');
            return false;
        }
        if (pin === this._adminPin) {
            this._adminAuthenticated = true;
            this._adminAttempts = 0;
            document.getElementById('admin-login').classList.add('hidden');
            document.getElementById('admin-controls').classList.remove('hidden');
            errorEl.classList.add('hidden');
            this._populateAdminLogs();
            return true;
        } else {
            this._adminAttempts++;
            if (this._adminAttempts >= 3) {
                this._adminLocked = true;
                errorEl.textContent = 'Terminal locked after 3 failed attempts.';
            } else {
                errorEl.textContent = `Invalid PIN. ${3 - this._adminAttempts} attempt(s) remaining.`;
            }
            errorEl.classList.remove('hidden');
            return false;
        }
    }

    prepareAdminPanel() {
        if (this._adminAuthenticated) {
            document.getElementById('admin-login').classList.add('hidden');
            document.getElementById('admin-controls').classList.remove('hidden');
            this._populateAdminLogs();
        } else {
            document.getElementById('admin-login').classList.remove('hidden');
            document.getElementById('admin-controls').classList.add('hidden');
        }
        document.getElementById('admin-pin').value = '';

        // Wire up scenario config
        const confSel = document.getElementById('admin-confluency');
        confSel.value = this.D1.starting_confluency.toString();
        confSel.onchange = () => {
            this.D1.starting_confluency = parseInt(confSel.value);
        };
        const densInput = document.getElementById('admin-density');
        densInput.value = this.D1.ground_truth_cell_density;
        densInput.onchange = () => {
            const v = parseInt(densInput.value);
            if (v >= 100000 && v <= 5000000) {
                this.D1.ground_truth_cell_density = v;
            } else {
                this.showWarning('Parameter out of range: density must be 1.0×10⁵ to 5.0×10⁶');
                setTimeout(() => this.clearWarning(), 3000);
                densInput.value = this.D1.ground_truth_cell_density;
            }
        };
    }

    _populateAdminLogs() {
        const el = document.getElementById('admin-logs');
        if (!el) return;
        const allLogs = [...this._sessionArchive, this.D2];
        if (allLogs.length === 0) {
            el.textContent = 'No session logs available.';
        } else {
            el.textContent = JSON.stringify(allLogs, null, 2);
        }
    }

    // ——— Session Export ([FR-024]) ———
    exportSessionJSON() {
        const blob = new Blob([JSON.stringify(this.D2, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session_${this.D2.session_id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    finalizeSession() {
        this._sessionArchive.push({ ...this.D2 });
    }

    // ——— Confirmation modal helper ———
    showConfirmModal(title, message, onConfirm, onCancel) {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        modal._onConfirm = onConfirm;
        modal._onCancel = onCancel;
        modal.classList.remove('hidden');
    }

    // ——— Calculation results modal ———
    showCalcModal(title, bodyHTML) {
        document.getElementById('calc-modal-title').textContent = title;
        document.getElementById('calc-modal-body').innerHTML = bodyHTML;
        document.getElementById('calculation-modal').classList.remove('hidden');
    }
}
```

- [ ] **Step 2: Verify data stores initialize correctly**

Open browser console after loading `index.html`. In the console, check:
```js
// sessionManager.D1.blower_purge_delay === 300
// sessionManager.D2.session_id is a valid UUID string
// sessionManager.D3.flask_medium_level === 12.0
```

Expected: D1/D2/D3 objects exist with correct default values matching Appendix A schemas.

---

## Task 3: State Machine — FSM & Phase Gating Guards

**Files:**
- Create: `e:\Users\Steven\Desktop\School\VR_LAB\stateMachine.js`

Implements the strict FSM from Section 2.3 Table 2.1 with guard conditions checking D2/D3.

- [ ] **Step 1: Create `stateMachine.js` — complete FSM with all transition guards**

```js
// stateMachine.js — Finite State Machine implementing Table 2.1 gating logic

export const States = {
    ANTEROOM: 0,
    CABINET_SETUP: 1,
    INSPECTION: 2,
    DISSOCIATION: 3,
    QUANTIFICATION: 4,
    INOCULATION: 5,
    COMPLETE: 6,
};

export class LabStateMachine {
    constructor(sessionManager, biologyEngine) {
        this.sm = sessionManager;
        this.bio = biologyEngine;
        this.currentState = States.ANTEROOM;
    }

    getCurrentState() {
        return this.currentState;
    }

    /**
     * Check whether a transition from currentState to targetState is allowed.
     * Returns { allowed: boolean, reason: string }
     */
    canTransition(targetState) {
        const D2 = this.sm.D2;
        const D3 = this.sm.D3;
        const D1 = this.sm.D1;

        // State 0 → 1: PPE must be complete [FR-001]
        if (this.currentState === States.ANTEROOM && targetState === States.CABINET_SETUP) {
            if (!D2.ppe_status) {
                return { allowed: false, reason: 'PPE not complete. Equip gloves, lab coat, and eye protection.' };
            }
            return { allowed: true, reason: '' };
        }

        // State 1 → 2: Blower purge, sash, ethanol, staging [FR-002–005]
        if (this.currentState === States.CABINET_SETUP && targetState === States.INSPECTION) {
            if (!D2.blower_purge_completed) {
                return { allowed: false, reason: 'HEPA blower purge not completed (5-minute stabilization).' };
            }
            if (!D2.sash_compliance) {
                return { allowed: false, reason: 'Sash not at 20 cm operating height (±1 cm).' };
            }
            if (!D3.workstation_clean_state) {
                return { allowed: false, reason: 'Work surface not sanitized (ethanol evaporation incomplete).' };
            }
            if (!D3.apparatus_staged) {
                return { allowed: false, reason: 'Sterile apparatus not staged in cabinet.' };
            }
            return { allowed: true, reason: '' };
        }

        // State 2 → 3: Microscope inspection, confluency ≥ 70% [FR-007–010]
        if (this.currentState === States.INSPECTION && targetState === States.DISSOCIATION) {
            if (!D3.microscope_inspected) {
                return { allowed: false, reason: 'Microscope inspection not completed at 10x.' };
            }
            if (D2.assessed_confluence_val === null) {
                return { allowed: false, reason: 'Confluency assessment not submitted.' };
            }
            if (D2.assessed_confluence_val < D1.confluency_threshold) {
                return { allowed: false, reason: `Confluency ${D2.assessed_confluence_val}% is below 70% threshold. Re-incubation required.` };
            }
            return { allowed: true, reason: '' };
        }

        // State 3 → 4: Trypsin ≥ 3 min, tap detected, quenched ≥ 6 mL [FR-011–015]
        if (this.currentState === States.DISSOCIATION && targetState === States.QUANTIFICATION) {
            if (!D3.medium_aspirated) {
                return { allowed: false, reason: 'Spent medium not aspirated.' };
            }
            if (!D3.pbs_washed) {
                return { allowed: false, reason: 'PBS wash not completed.' };
            }
            if (D3.trypsin_activity_state !== 'Neutralized') {
                return { allowed: false, reason: 'Trypsin not neutralized. Add ≥ 6.0 mL serum DMEM.' };
            }
            if (!D2.mechanical_tap_detected && D3.cell_adhesion_state !== 'Lysed') {
                return { allowed: false, reason: 'Mechanical tap not detected. Tap the flask to detach cells.' };
            }
            return { allowed: true, reason: '' };
        }

        // State 4 → 5: Trypan Blue mixed, 4 quadrants tallied, calculations done [FR-016–020]
        if (this.currentState === States.QUANTIFICATION && targetState === States.INOCULATION) {
            if (!D3.trypan_blue_mixed) {
                return { allowed: false, reason: 'Trypan Blue 1:1 dilution not prepared.' };
            }
            if (!D3.hemocytometer_loaded) {
                return { allowed: false, reason: 'Hemocytometer not loaded.' };
            }
            if (D2.calculated_viability_pct === null || D2.calculated_density === null) {
                return { allowed: false, reason: 'Cell count and viability calculations not completed.' };
            }
            return { allowed: true, reason: '' };
        }

        // State 5 → 6: Seed volume, label, cap vented, incubator sealed [FR-021–023]
        if (this.currentState === States.INOCULATION && targetState === States.COMPLETE) {
            if (!D3.inoculation_volume_set) {
                return { allowed: false, reason: 'Inoculum volume not calculated/transferred.' };
            }
            if (!D3.vessel_labeled) {
                return { allowed: false, reason: 'Destination vessel not labeled.' };
            }
            if (!D3.cap_vented) {
                return { allowed: false, reason: 'Filter cap not set to vented position.' };
            }
            if (!D3.flask_in_incubator) {
                return { allowed: false, reason: 'Flask not placed in incubator.' };
            }
            return { allowed: true, reason: '' };
        }

        return { allowed: false, reason: `Invalid transition: State ${this.currentState} → ${targetState}` };
    }

    /**
     * Attempt to transition. Returns true if successful.
     */
    transition(targetState) {
        const check = this.canTransition(targetState);
        if (!check.allowed) {
            this.sm.showWarning(check.reason);
            setTimeout(() => this.sm.clearWarning(), 4000);
            console.warn(`Transition blocked: ${check.reason}`);
            return false;
        }

        console.log(`State transition: ${this.currentState} → ${targetState}`);
        this.currentState = targetState;
        this.sm.updatePhaseBanner(targetState);

        // Show/hide BSC status panel in States 1–5
        const bscPanel = document.getElementById('bsc-status');
        if (targetState >= States.CABINET_SETUP && targetState <= States.INOCULATION) {
            bscPanel.classList.remove('hidden');
        } else {
            bscPanel.classList.add('hidden');
        }

        // State 6 → finalize session [FR-024]
        if (targetState === States.COMPLETE) {
            this._finalizeSession();
        }

        return true;
    }

    _finalizeSession() {
        this.sm.finalizeSession();
        // Show audit summary
        const auditEl = document.getElementById('audit-json');
        auditEl.textContent = JSON.stringify(this.sm.D2, null, 2);
        document.getElementById('audit-modal').classList.remove('hidden');
    }
}
```

- [ ] **Step 2: Verify guard conditions**

In the browser console, test:
```js
// stateMachine.canTransition(1) should return { allowed: false, reason: 'PPE not complete...' }
// After toggling all PPE:
// sessionManager.togglePPE('gloves'); sessionManager.togglePPE('coat'); sessionManager.togglePPE('eyewear');
// stateMachine.canTransition(1) should return { allowed: true, reason: '' }
```

Expected: Guards correctly block/allow transitions based on D2/D3 state.

---

## Task 4: Lab Objects — 3D Meshes, Interactables & Room Geometry

**Files:**
- Create: `e:\Users\Steven\Desktop\School\VR_LAB\labObjects.js`

Creates all 3D geometry for the lab environment: rooms, BSC, microscope, incubator, PPE locker, reagent bottles, flasks, pipettes, and wires up interaction handlers.

- [ ] **Step 1: Create `labObjects.js` — complete lab environment factory**

```js
// labObjects.js — 3D meshes, colliders, and interaction handlers for all lab equipment
import * as THREE from 'three';
import { States } from './stateMachine.js';

// ——— Material Library ———
const materials = {
    floor: new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.3, roughness: 0.1 }),
    plastic_white: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 }),
    plastic_blue: new THREE.MeshStandardMaterial({ color: 0x2196f3, roughness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8d6e4a, roughness: 0.85 }),
    locker: new THREE.MeshStandardMaterial({ color: 0x607d8b, metalness: 0.5, roughness: 0.4 }),
    reagent_bottle: new THREE.MeshStandardMaterial({ color: 0xffa726, roughness: 0.4, transparent: true, opacity: 0.7 }),
    ethanol_bottle: new THREE.MeshStandardMaterial({ color: 0x81c784, roughness: 0.4 }),
    flask: new THREE.MeshStandardMaterial({ color: 0xffcccc, transparent: true, opacity: 0.5, roughness: 0.2 }),
    liquid_yellow: new THREE.MeshStandardMaterial({ color: 0xfdd835, transparent: true, opacity: 0.6 }),
    liquid_red: new THREE.MeshStandardMaterial({ color: 0xef5350, transparent: true, opacity: 0.6 }),
    liquid_clear: new THREE.MeshStandardMaterial({ color: 0xbbdefb, transparent: true, opacity: 0.3 }),
    door: new THREE.MeshStandardMaterial({ color: 0x78909c, roughness: 0.7 }),
    door_frame: new THREE.MeshStandardMaterial({ color: 0x546e7a, roughness: 0.6 }),
    highlight: new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00e676, emissiveIntensity: 0.3 }),
    incubator: new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.6, roughness: 0.3 }),
    surface_dirty: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.7, roughness: 0.3 }),
    surface_clean: new THREE.MeshStandardMaterial({ color: 0xccddff, metalness: 0.7, roughness: 0.2, emissive: 0x112233, emissiveIntensity: 0.1 }),
    surface_wet: new THREE.MeshStandardMaterial({ color: 0x99bbff, metalness: 0.9, roughness: 0.05, emissive: 0x224466, emissiveIntensity: 0.2 }),
};

export function createLabEnvironment(scene, sessionManager) {
    const interactables = [];
    const labObjects = {};

    // ——— Room Geometry ———
    // Main Lab Room: 12m wide × 20m deep × 4m tall, centered at origin
    // Anteroom is at the back (z > 4), main lab is at front (z < 4)

    // Floor
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 20),
        materials.floor
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    scene.add(floor);

    // Ceiling
    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 20),
        materials.ceiling
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 4, 0);
    scene.add(ceiling);

    // Walls
    function makeWall(w, h, x, y, z, rotY = 0) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), materials.wall);
        wall.position.set(x, y, z);
        wall.rotation.y = rotY;
        wall.receiveShadow = true;
        scene.add(wall);
        return wall;
    }
    makeWall(12, 4, 0, 2, 10, Math.PI);  // Back wall
    makeWall(12, 4, 0, 2, -10, 0);        // Front wall
    makeWall(20, 4, -6, 2, 0, Math.PI / 2);  // Left wall
    makeWall(20, 4, 6, 2, 0, -Math.PI / 2);  // Right wall

    // Divider wall between anteroom and main lab (with door gap)
    makeWall(4, 4, -4, 2, 4, Math.PI);
    makeWall(4, 4, 4, 2, 4, Math.PI);
    makeWall(4, 4, -4, 2, 4, 0);
    makeWall(4, 4, 4, 2, 4, 0);
    makeWall(4, 1, 0, 3.5, 4, Math.PI);
    makeWall(4, 1, 0, 3.5, 4, 0);

    // ——— Cleanroom Door [FR-001] ———
    const doorGroup = new THREE.Group();
    doorGroup.position.set(0, 1.5, 4);
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3, 0.1), materials.door);
    doorMesh.castShadow = true;
    doorGroup.add(doorMesh);
    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 0.15), materials.door_frame);
    frameLeft.position.set(-0.95, 0, 0);
    doorGroup.add(frameLeft);
    const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 0.15), materials.door_frame);
    frameRight.position.set(0.95, 0, 0);
    doorGroup.add(frameRight);

    doorGroup.userData = {
        interactable: true,
        tooltipText: 'Cleanroom Door — Equip PPE first [FR-001]',
        type: 'door',
        isOpen: false,
        onInteract: (obj, ctx) => {
            const { stateMachine, sessionManager: sm } = ctx;
            if (stateMachine.getCurrentState() === States.ANTEROOM) {
                const result = stateMachine.transition(States.CABINET_SETUP);
                if (result) {
                    doorGroup.userData.isOpen = true;
                    doorMesh.material = materials.glass;
                    doorGroup.userData.tooltipText = 'Door Open';
                }
            }
        }
    };
    scene.add(doorGroup);
    interactables.push(doorGroup);
    labObjects.door = doorGroup;

    // ——— PPE Locker [FR-001] ———
    const lockerGroup = new THREE.Group();
    lockerGroup.position.set(4, 1, 8);
    const lockerBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.6), materials.locker);
    lockerBody.castShadow = true;
    lockerGroup.add(lockerBody);
    lockerGroup.userData = {
        interactable: true,
        tooltipText: 'PPE Supply Locker — Click to equip PPE',
        type: 'locker',
        ppeIndex: 0,
        onInteract: (obj, ctx) => {
            const sm = ctx.sessionManager;
            const ppeItems = ['gloves', 'coat', 'eyewear'];
            const idx = obj.userData.ppeIndex;
            if (idx < ppeItems.length) {
                sm.togglePPE(ppeItems[idx]);
                obj.userData.ppeIndex++;
                if (obj.userData.ppeIndex >= ppeItems.length) {
                    obj.userData.tooltipText = 'PPE Equipped ✓';
                    doorGroup.userData.tooltipText = 'Cleanroom Door — PPE Ready ✓ Press E to enter';
                } else {
                    obj.userData.tooltipText = `PPE Locker — Next: ${ppeItems[obj.userData.ppeIndex]}`;
                }
            }
        }
    };
    scene.add(lockerGroup);
    interactables.push(lockerGroup);
    labObjects.locker = lockerGroup;

    // ——— Biosafety Cabinet (BSC) [FR-002–005] ———
    const bscGroup = new THREE.Group();
    bscGroup.position.set(-2, 0, -2);

    const bscBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 1.0), materials.metal);
    bscBody.position.y = 0.75; bscBody.castShadow = true;
    bscGroup.add(bscBody);

    const bscUpper = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.0), materials.metal);
    bscUpper.position.y = 2.3;
    bscGroup.add(bscUpper);

    const workSurface = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.8), materials.surface_dirty);
    workSurface.position.set(0, 1.52, 0); workSurface.receiveShadow = true;
    bscGroup.add(workSurface);
    labObjects.workSurface = workSurface;

    const grille = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.2 }));
    grille.position.set(0, 1.53, 0.45);
    bscGroup.add(grille);

    const sashGlass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.02), materials.glass);
    sashGlass.position.set(0, 1.9, 0.5);
    bscGroup.add(sashGlass);
    labObjects.sash = sashGlass;

    const hepaLED = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 }));
    hepaLED.position.set(1.0, 2.45, 0.51);
    bscGroup.add(hepaLED);
    labObjects.hepaLED = hepaLED;

    scene.add(bscGroup);
    labObjects.bsc = bscGroup;

    // ——— BSC Blower Switch [FR-002] ———
    const blowerSwitch = new THREE.Group();
    blowerSwitch.position.set(-2 + 1.15, 2.45, -2 + 0.51);
    const switchBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), materials.plastic_white);
    blowerSwitch.add(switchBody);
    blowerSwitch.userData = {
        interactable: true,
        tooltipText: 'BSC Blower Power Switch [FR-002]',
        type: 'blower_switch',
        onInteract: (obj, ctx) => {
            const sm = ctx.sessionManager;
            if (ctx.stateMachine.getCurrentState() < States.CABINET_SETUP) {
                sm.showWarning('Enter the cleanroom first.');
                setTimeout(() => sm.clearWarning(), 3000);
                return;
            }
            if (!sm.D3.hepa_blower_active) {
                sm.D3.hepa_blower_active = true;
                sm.D3.blower_purge_elapsed = 0;
                switchBody.material = new THREE.MeshStandardMaterial({ color: 0x4caf50, emissive: 0x4caf50, emissiveIntensity: 0.3 });
                obj.userData.tooltipText = 'Blower ON — Purging...';
                document.getElementById('bsc-status').classList.remove('hidden');
                sm.updateBSCDisplay();
            }
        }
    };
    scene.add(blowerSwitch);
    interactables.push(blowerSwitch);

    // ——— Glass Sash Interaction [FR-003] ———
    const sashInteract = new THREE.Group();
    sashInteract.position.set(-2, 2.1, -2 + 0.5);
    const sashHandle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), materials.plastic_blue);
    sashInteract.add(sashHandle);
    sashInteract.userData = {
        interactable: true,
        tooltipText: 'Glass Sash — Click to set to 20 cm height [FR-003]',
        type: 'sash',
        onInteract: (obj, ctx) => {
            const sm = ctx.sessionManager;
            if (sm.D3.sash_height < 19.0) {
                sm.D3.sash_height = 20.0;
                sashGlass.position.y = 2.3;
                obj.userData.tooltipText = 'Sash at 20.0 cm ✓';
            } else {
                sm.D3.sash_height = 0.0;
                sashGlass.position.y = 1.9;
                obj.userData.tooltipText = 'Glass Sash — Click to raise';
            }
            sm.D2.sash_compliance = (sm.D3.sash_height >= 19.0 && sm.D3.sash_height <= 21.0);
            sm.updateBSCDisplay();
        }
    };
    scene.add(sashInteract);
    interactables.push(sashInteract);

    // ——— Ethanol Spray Bottle [FR-004] ———
    const ethanolBottle = new THREE.Group();
    ethanolBottle.position.set(-0.5, 1.55, -2);
    const bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 12), materials.ethanol_bottle);
    ethanolBottle.add(bottleBody);
    const sprayHead = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.08), materials.plastic_white);
    sprayHead.position.y = 0.12;
    ethanolBottle.add(sprayHead);
    ethanolBottle.userData = {
        interactable: true,
        tooltipText: '70% Ethanol Spray — Apply to BSC surface [FR-004]',
        type: 'ethanol',
        onInteract: (obj, ctx) => {
            const sm = ctx.sessionManager;
            if (ctx.stateMachine.getCurrentState() < States.CABINET_SETUP) return;
            if (!sm.D3.ethanol_applied) {
                sm.D3.ethanol_applied = true;
                sm.D3.ethanol_evaporation_elapsed = 0;
                workSurface.material = materials.surface_wet;
                obj.userData.tooltipText = 'Ethanol applied — evaporating...';
                sm.updateBSCDisplay();
            }
        }
    };
    scene.add(ethanolBottle);
    interactables.push(ethanolBottle);

    // ——— Supply Shelf / Apparatus Staging [FR-005] ———
    const supplyShelf = new THREE.Group();
    supplyShelf.position.set(2, 1.55, -2);
    const tipBox = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.15), materials.plastic_blue);
    supplyShelf.add(tipBox);
    supplyShelf.userData = {
        interactable: true,
        tooltipText: 'Sterile Apparatus — Click to stage in BSC [FR-005]',
        type: 'supply_shelf',
        onInteract: (obj, ctx) => {
            const sm = ctx.sessionManager;
            if (ctx.stateMachine.getCurrentState() < States.CABINET_SETUP) return;
            sm.D3.apparatus_staged = true;
            obj.userData.tooltipText = 'Apparatus staged in BSC ✓';
            supplyShelf.position.set(-2, 1.58, -2.2);
            sm.updateBSCDisplay();
        }
    };
    scene.add(supplyShelf);
    interactables.push(supplyShelf);

    // ——— Grille Hazard Test Object [HZ-001] ———
    const testObject = new THREE.Group();
    testObject.position.set(0.5, 1.55, -1);
    const testMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), materials.reagent_bottle);
    testObject.add(testMesh);
    testObject.userData = {
        interactable: true,
        tooltipText: 'Media Bottle — Click to place in BSC',
        type: 'media_bottle',
        inBSC: false,
        nearGrille: false,
        onInteract: (obj, ctx) => {
            const sm = ctx.sessionManager;
            if (!obj.userData.inBSC) {
                obj.userData.inBSC = true;
                obj.userData.nearGrille = true;
                testObject.position.set(-2, 1.58, -2 + 0.4);
                sm.logGrilleViolation();
                obj.userData.tooltipText = 'Media Bottle — ⚠ Too close to grille! Click to reposition';
            } else if (obj.userData.nearGrille) {
                obj.userData.nearGrille = false;
                testObject.position.set(-2, 1.58, -2.3);
                sm.clearWarning();
                obj.userData.tooltipText = 'Media Bottle — Positioned safely ✓';
            }
        }
    };
    scene.add(testObject);
    interactables.push(testObject);

    // ——— Inverted Microscope [FR-007–010] ———
    const microscopeGroup = new THREE.Group();
    microscopeGroup.position.set(3, 0, 0);
    const microBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.4), materials.metal);
    microBase.position.y = 0.4; microBase.castShadow = true;
    microscopeGroup.add(microBase);
    const microArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), materials.metal);
    microArm.position.set(0, 1.2, -0.1);
    microscopeGroup.add(microArm);
    const microHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.2), materials.metal);
    microHead.position.set(0, 1.6, 0);
    microscopeGroup.add(microHead);
    const eyepiece1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), materials.plastic_white);
    eyepiece1.position.set(-0.06, 1.73, 0); eyepiece1.rotation.x = -0.3;
    microscopeGroup.add(eyepiece1);
    const eyepiece2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), materials.plastic_white);
    eyepiece2.position.set(0.06, 1.73, 0); eyepiece2.rotation.x = -0.3;
    microscopeGroup.add(eyepiece2);
    const microStage = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.3), materials.metal);
    microStage.position.set(0, 0.85, 0.05);
    microscopeGroup.add(microStage);

    microscopeGroup.userData = {
        interactable: true,
        tooltipText: 'Inverted Phase-Contrast Microscope — Press E to inspect [FR-007]',
        type: 'microscope',
        onInteract: (obj, ctx) => {
            const state = ctx.stateMachine.getCurrentState();
            if (state < States.INSPECTION) {
                if (state === States.CABINET_SETUP) {
                    const ok = ctx.stateMachine.transition(States.INSPECTION);
                    if (!ok) return;
                } else { return; }
            }
            if (state > States.INSPECTION) return;
            document.getElementById('microscope-modal').classList.remove('hidden');
            ctx.controls.unlock();
            ctx.biologyEngine.renderMicroscopeView();
        }
    };
    scene.add(microscopeGroup);
    interactables.push(microscopeGroup);
    labObjects.microscope = microscopeGroup;

    // ——— T-75 Culture Flask ———
    const flaskGroup = new THREE.Group();
    flaskGroup.position.set(-1.5, 1.55, -2);
    const flaskBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.04), materials.flask);
    flaskGroup.add(flaskBody);
    const flaskLiquid = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.035), materials.liquid_yellow);
    flaskLiquid.position.y = -0.04;
    flaskGroup.add(flaskLiquid);
    labObjects.flaskLiquid = flaskLiquid;

    flaskGroup.userData = {
        interactable: true, tooltipText: 'T-75 Culture Flask', type: 'flask',
        onInteract: (obj, ctx) => { /* Context-sensitive via dedicated reagent objects */ }
    };
    scene.add(flaskGroup);
    interactables.push(flaskGroup);
    labObjects.flask = flaskGroup;

    // ——— Vacuum Aspiration System [FR-011] ———
    const vacuumGroup = new THREE.Group();
    vacuumGroup.position.set(-3.5, 1.0, -2);
    const vacuumBody = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 12), materials.plastic_white);
    vacuumBody.castShadow = true;
    vacuumGroup.add(vacuumBody);
    const vacuumHose = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x555555 }));
    vacuumHose.position.set(0, 0.3, 0); vacuumHose.rotation.z = 0.4;
    vacuumGroup.add(vacuumHose);

    vacuumGroup.userData = {
        interactable: true,
        tooltipText: 'Vacuum Aspiration Wand — Aspirate spent medium [FR-011]',
        type: 'vacuum',
        onInteract: (obj, ctx) => {
            if (ctx.stateMachine.getCurrentState() !== States.DISSOCIATION) return;
            const sm = ctx.sessionManager;
            if (!sm.D3.medium_aspirated) {
                const vol = sm.D3.flask_medium_level;
                sm.D3.waste_trap_fill_level += vol;
                sm.D2.aspiration_vol_removed = vol;
                sm.D3.flask_medium_level = 0;
                sm.D3.medium_aspirated = true;
                flaskLiquid.visible = false;
                obj.userData.tooltipText = 'Medium aspirated ✓';
                sm.showTimer('Aspiration', 0);
                setTimeout(() => sm.hideTimer(), 2000);
            }
        }
    };
    scene.add(vacuumGroup);
    interactables.push(vacuumGroup);

    // ——— PBS Bottle [FR-012] ———
    const pbsBottle = new THREE.Group();
    pbsBottle.position.set(-1, 1.55, -3);
    const pbsBody = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 12),
        new THREE.MeshStandardMaterial({ color: 0x90caf9, transparent: true, opacity: 0.6 }));
    pbsBottle.add(pbsBody);
    pbsBottle.userData = {
        interactable: true,
        tooltipText: 'PBS (DPBS 1X) — Wash monolayer [FR-012]',
        type: 'pbs',
        onInteract: (obj, ctx) => {
            if (ctx.stateMachine.getCurrentState() !== States.DISSOCIATION) return;
            const sm = ctx.sessionManager;
            if (!sm.D3.medium_aspirated) {
                sm.showWarning('Aspirate spent medium first.');
                setTimeout(() => sm.clearWarning(), 3000); return;
            }
            if (!sm.D3.pbs_washed) {
                sm.D3.pbs_volume_in_flask = 5.0;
                sm.D2.pbs_wash_vol_actual = 5.0;
                sm.D3.pbs_washed = true;
                obj.userData.tooltipText = 'PBS wash applied ✓ (5.0 mL down sidewall)';
            }
        }
    };
    scene.add(pbsBottle);
    interactables.push(pbsBottle);

    // ——— Trypsin Bottle [FR-013] ———
    const trypsinBottle = new THREE.Group();
    trypsinBottle.position.set(-0.5, 1.55, -3);
    const trypBody = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.15, 12),
        new THREE.MeshStandardMaterial({ color: 0xffab91 }));
    trypsinBottle.add(trypBody);
    trypsinBottle.userData = {
        interactable: true,
        tooltipText: '0.25% Trypsin-EDTA — Start enzymatic dissociation [FR-013]',
        type: 'trypsin',
        onInteract: (obj, ctx) => {
            if (ctx.stateMachine.getCurrentState() !== States.DISSOCIATION) return;
            const sm = ctx.sessionManager;
            if (!sm.D3.pbs_washed) {
                sm.showWarning('Complete PBS wash first.');
                setTimeout(() => sm.clearWarning(), 3000); return;
            }
            if (!sm.D3.trypsin_applied) {
                sm.D3.trypsin_applied = true;
                sm.D3.active_trypsin_volume = 2.5;
                sm.D2.trypsin_vol_actual = 2.5;
                sm.D3.trypsin_activity_state = 'Active';
                sm.D3.trypsin_timer_running = true;
                sm.D3.trypsin_timer_elapsed = 0;
                obj.userData.tooltipText = 'Trypsin applied — timer started ✓';
                ctx.biologyEngine.startTrypsinTimer();
            }
        }
    };
    scene.add(trypsinBottle);
    interactables.push(trypsinBottle);

    // ——— DMEM Bottle (for quenching) [FR-015] ———
    const dmemBottle = new THREE.Group();
    dmemBottle.position.set(0, 1.55, -3);
    const dmemBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 12), materials.reagent_bottle);
    dmemBottle.add(dmemBody);
    dmemBottle.userData = {
        interactable: true,
        tooltipText: 'Complete DMEM (serum) — Quench trypsin [FR-015]',
        type: 'dmem',
        onInteract: (obj, ctx) => {
            if (ctx.stateMachine.getCurrentState() !== States.DISSOCIATION) return;
            const sm = ctx.sessionManager;
            if (sm.D3.trypsin_activity_state !== 'Active') {
                sm.showWarning(sm.D3.trypsin_activity_state === 'Neutralized' ? 'Trypsin already neutralized.' : 'Apply trypsin first.');
                setTimeout(() => sm.clearWarning(), 3000); return;
            }
            sm.D3.cells_quenched = true;
            sm.D2.quench_media_vol_actual = 7.5;
            sm.D3.flask_medium_level = 7.5 + sm.D3.active_trypsin_volume;
            sm.D3.trypsin_activity_state = 'Neutralized';
            sm.D3.trypsin_timer_running = false;
            sm.D3.medium_color_state = 'Red-Orange';
            ctx.biologyEngine.stopTrypsinTimer();
            obj.userData.tooltipText = 'Trypsin neutralized ✓';
            sm.hideTimer();
            flaskLiquid.visible = true;
            flaskLiquid.material = materials.liquid_red;
        }
    };
    scene.add(dmemBottle);
    interactables.push(dmemBottle);

    // ——— Microcentrifuge Tube & Trypan Blue [FR-017] ———
    const trypanGroup = new THREE.Group();
    trypanGroup.position.set(1, 1.55, -2);
    const tubeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.005, 0.06, 8), materials.plastic_white);
    trypanGroup.add(tubeBody);
    const trypanBottleM = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8),
        new THREE.MeshStandardMaterial({ color: 0x1565c0 }));
    trypanBottleM.position.x = 0.06;
    trypanGroup.add(trypanBottleM);
    trypanGroup.userData = {
        interactable: true,
        tooltipText: 'Trypan Blue Dye + Microtube — Mix 1:1 aliquot [FR-017]',
        type: 'trypan_blue',
        onInteract: (obj, ctx) => {
            const state = ctx.stateMachine.getCurrentState();
            const sm = ctx.sessionManager;
            if (state === States.DISSOCIATION && sm.D3.trypsin_activity_state === 'Neutralized') {
                const ok = ctx.stateMachine.transition(States.QUANTIFICATION);
                if (!ok) return;
            }
            if (ctx.stateMachine.getCurrentState() !== States.QUANTIFICATION) return;
            if (!sm.D3.trypan_blue_mixed) {
                sm.D3.trypan_blue_mixed = true;
                obj.userData.tooltipText = 'Aliquot mixed: 20 µL suspension + 20 µL Trypan Blue (1:1) ✓';
            }
        }
    };
    scene.add(trypanGroup);
    interactables.push(trypanGroup);

    // ——— Hemocytometer [FR-018–019] ———
    const hemoGroup = new THREE.Group();
    hemoGroup.position.set(1.5, 1.55, -2);
    const hemoSlide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.005, 0.04), materials.glass);
    hemoGroup.add(hemoSlide);
    hemoGroup.userData = {
        interactable: true,
        tooltipText: 'Hemocytometer — Load sample & count cells [FR-018]',
        type: 'hemocytometer',
        onInteract: (obj, ctx) => {
            if (ctx.stateMachine.getCurrentState() !== States.QUANTIFICATION) return;
            const sm = ctx.sessionManager;
            if (!sm.D3.trypan_blue_mixed) {
                sm.showWarning('Mix Trypan Blue aliquot first.');
                setTimeout(() => sm.clearWarning(), 3000); return;
            }
            sm.D3.hemocytometer_loaded = true;
            document.getElementById('hemocytometer-modal').classList.remove('hidden');
            ctx.controls.unlock();
            ctx.biologyEngine.renderHemocytometerGrid();
        }
    };
    scene.add(hemoGroup);
    interactables.push(hemoGroup);

    // ——— Destination Flask [FR-021–022] ———
    const destFlask = new THREE.Group();
    destFlask.position.set(2, 1.55, -3);
    const destBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.04), materials.flask);
    destFlask.add(destBody);
    destFlask.userData = {
        interactable: true,
        tooltipText: 'New T-75 Flask — Inoculate secondary culture [FR-021]',
        type: 'dest_flask',
        onInteract: (obj, ctx) => {
            const state = ctx.stateMachine.getCurrentState();
            const sm = ctx.sessionManager;
            if (state === States.QUANTIFICATION && sm.D2.calculated_density !== null) {
                const ok = ctx.stateMachine.transition(States.INOCULATION);
                if (!ok) return;
            }
            if (ctx.stateMachine.getCurrentState() !== States.INOCULATION) return;
            if (!sm.D3.inoculation_volume_set) {
                document.getElementById('inoc-c1').textContent = sm.D2.calculated_density.toExponential(2);
                document.getElementById('inoculation-modal').classList.remove('hidden');
                ctx.controls.unlock();
            } else if (!sm.D3.vessel_labeled) {
                const now = new Date();
                document.getElementById('label-passage').value = 'P+1';
                document.getElementById('label-date').value = now.toISOString().split('T')[0];
                document.getElementById('label-modal').classList.remove('hidden');
                ctx.controls.unlock();
            }
        }
    };
    scene.add(destFlask);
    interactables.push(destFlask);
    labObjects.destFlask = destFlask;

    // ——— Filter Cap Toggle [FR-023] ———
    const capToggle = new THREE.Group();
    capToggle.position.set(2.5, 1.55, -3);
    const capMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), materials.plastic_white);
    capToggle.add(capMesh);
    capToggle.userData = {
        interactable: true,
        tooltipText: 'Filter Cap — Toggle to vented position [FR-023]',
        type: 'cap_toggle',
        onInteract: (obj, ctx) => {
            const sm = ctx.sessionManager;
            if (ctx.stateMachine.getCurrentState() !== States.INOCULATION) return;
            sm.D3.cap_vented = !sm.D3.cap_vented;
            sm.D2.cap_vented_status = sm.D3.cap_vented;
            if (sm.D3.cap_vented) {
                capMesh.material = materials.highlight;
                obj.userData.tooltipText = 'Filter Cap: VENTED ✓';
            } else {
                capMesh.material = materials.plastic_white;
                obj.userData.tooltipText = 'Filter Cap: CLOSED — Toggle to vent';
            }
        }
    };
    scene.add(capToggle);
    interactables.push(capToggle);

    // ——— CO2 Incubator [FR-023] ———
    const incubatorGroup = new THREE.Group();
    incubatorGroup.position.set(4, 0, -5);
    const incBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.8), materials.incubator);
    incBody.position.y = 0.9; incBody.castShadow = true;
    incubatorGroup.add(incBody);
    const incDoor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x455a64, metalness: 0.5, roughness: 0.4 }));
    incDoor.position.set(0, 0.9, 0.42);
    incubatorGroup.add(incDoor);
    const tempDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00e676, emissiveIntensity: 0.5 }));
    tempDisplay.position.set(0, 1.6, 0.43);
    incubatorGroup.add(tempDisplay);

    incubatorGroup.userData = {
        interactable: true,
        tooltipText: 'CO₂ Incubator (37°C / 5% CO₂) — Place flask to complete [FR-023]',
        type: 'incubator',
        onInteract: (obj, ctx) => {
            const sm = ctx.sessionManager;
            if (ctx.stateMachine.getCurrentState() !== States.INOCULATION) return;
            if (!sm.D3.cap_vented) {
                sm.showWarning('Set filter cap to VENTED before placing in incubator. [FR-023]');
                setTimeout(() => sm.clearWarning(), 4000); return;
            }
            if (!sm.D3.vessel_labeled) {
                sm.showWarning('Label the destination vessel first. [FR-022]');
                setTimeout(() => sm.clearWarning(), 4000); return;
            }
            if (!sm.D3.inoculation_volume_set) {
                sm.showWarning('Complete inoculation volume calculation first. [FR-021]');
                setTimeout(() => sm.clearWarning(), 4000); return;
            }
            sm.D3.flask_in_incubator = true;
            obj.userData.tooltipText = 'Flask placed in incubator ✓';
            ctx.stateMachine.transition(States.COMPLETE);
        }
    };
    scene.add(incubatorGroup);
    interactables.push(incubatorGroup);
    labObjects.incubator = incubatorGroup;

    // ——— Public API ———
    return {
        getInteractables: () => interactables,
        getLabObjects: () => labObjects,
        update: (delta, stateMachine, sessionManager) => {
            // Blower purge timer [FR-002]
            if (sessionManager.D3.hepa_blower_active && !sessionManager.D2.blower_purge_completed) {
                sessionManager.D3.blower_purge_elapsed += delta;
                if (sessionManager.D3.blower_purge_elapsed >= sessionManager.D1.blower_purge_delay_sim) {
                    sessionManager.D2.blower_purge_completed = true;
                    labObjects.hepaLED.material = new THREE.MeshStandardMaterial({
                        color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5
                    });
                }
                sessionManager.updateBSCDisplay();
            }
            // Ethanol evaporation timer [FR-004]
            if (sessionManager.D3.ethanol_applied && !sessionManager.D3.workstation_clean_state) {
                sessionManager.D3.ethanol_evaporation_elapsed += delta;
                if (sessionManager.D3.ethanol_evaporation_elapsed >= sessionManager.D1.ethanol_evaporation_time_sim) {
                    sessionManager.D3.workstation_clean_state = true;
                    workSurface.material = materials.surface_clean;
                }
                sessionManager.updateBSCDisplay();
            }
        }
    };
}
```

- [ ] **Step 2: Verify lab environment renders**

Open `index.html` in Chrome, click to lock pointer.

Expected:
- Room with walls, floor, ceiling visible
- BSC cabinet model, microscope, incubator, reagent bottles positioned in scene
- PPE locker in anteroom area (z ≈ 8)
- Hovering crosshair over objects shows tooltips

---

## Task 5: Biology Engine — Timers, Cell State, Microscope, Hemocytometer & Calculations

**Files:**
- Create: `e:\Users\Steven\Desktop\School\VR_LAB\biologyEngine.js`

Implements all biological simulation logic: trypsin timer, cell state transitions, microscope viewport rendering, hemocytometer grid with clickable cells, and all Appendix C formulas.

- [ ] **Step 1: Create `biologyEngine.js` — complete biology simulation engine**

```js
// biologyEngine.js — Biology simulation: timers, cell state, microscope, hemocytometer, formulas
import { States } from './stateMachine.js';

export class BiologyEngine {
    constructor(sessionManager) {
        this.sm = sessionManager;
        this._trypsinTimerActive = false;
        this._trypsinStartTime = 0;
        this._currentMagnification = 4;
        this._activeQuadrant = 0;
        this._quadrantsCounted = [false, false, false, false];
        this._liveCounts = [0, 0, 0, 0];
        this._deadCounts = [0, 0, 0, 0];
        this._groundTruthCells = [];
        this._generateGroundTruthCells();
    }

    // ——— Trypsin Timer (Process 3.4) ———
    startTrypsinTimer() {
        this._trypsinTimerActive = true;
    }

    stopTrypsinTimer() {
        this._trypsinTimerActive = false;
    }

    update(delta, stateMachine) {
        if (!this._trypsinTimerActive) return;
        const D3 = this.sm.D3;
        const D1 = this.sm.D1;
        D3.trypsin_timer_elapsed += delta;
        const elapsedMinutes = D3.trypsin_timer_elapsed / 60.0;
        this.sm.showTimer('Trypsin Exposure', D3.trypsin_timer_elapsed);

        if (elapsedMinutes >= D1.trypsin_incubation_nominal[0] &&
            elapsedMinutes < D1.trypsin_incubation_nominal[1] &&
            D3.cell_adhesion_state === 'Adherent') {
            D3.cell_adhesion_state = 'Rounding';
        }

        if (elapsedMinutes >= D1.trypsin_overexposure_limit &&
            D3.trypsin_activity_state === 'Active') {
            this.sm.logOverexposure();
            this._applyOverexposurePenalty();
            this.stopTrypsinTimer();
        }
    }

    _applyOverexposurePenalty() {
        const D1 = this.sm.D1;
        const penalty = D1.overexposure_viability_penalty;
        const liveOrig = D1.ground_truth_live_cells;
        const newDead = Math.round(liveOrig * penalty);
        D1.ground_truth_live_cells = liveOrig - newDead;
        D1.ground_truth_dead_cells += newDead;
        this._generateGroundTruthCells();
    }

    // ——— Mechanical Tap [FR-014] ———
    registerTap(stateMachine) {
        if (stateMachine.getCurrentState() !== States.DISSOCIATION) return;
        const D3 = this.sm.D3;
        const D1 = this.sm.D1;
        const elapsedMinutes = D3.trypsin_timer_elapsed / 60.0;
        if (D3.trypsin_activity_state !== 'Active') return;

        if (elapsedMinutes >= D1.trypsin_incubation_nominal[0] &&
            elapsedMinutes <= D1.trypsin_incubation_nominal[1]) {
            D3.cell_adhesion_state = 'Suspension';
            this.sm.D2.mechanical_tap_detected = true;
            this.sm.showWarning('Cells detached — in suspension ✓');
            setTimeout(() => this.sm.clearWarning(), 3000);
        } else if (elapsedMinutes < D1.trypsin_incubation_nominal[0]) {
            this.sm.showWarning('Too early — trypsin needs at least 3 minutes.');
            setTimeout(() => this.sm.clearWarning(), 3000);
        }
    }

    // ——— Microscope [FR-007–010] ———
    setMicroscopeMagnification(mag) {
        this._currentMagnification = mag;
        this.renderMicroscopeView();
    }

    renderMicroscopeView() {
        const canvas = document.getElementById('microscope-canvas');
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const confluency = this.sm.D1.starting_confluency;
        const mag = this._currentMagnification;

        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.beginPath();
        ctx.arc(w/2, h/2, Math.min(w,h)/2 - 10, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#e8e8e0'; ctx.fillRect(0, 0, w, h);

        const cellSize = mag === 4 ? 3 : mag === 10 ? 6 : 14;
        const cellCount = Math.round(confluency * (mag === 4 ? 8 : mag === 10 ? 5 : 2));
        let seed = 42;
        function seededRandom() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

        for (let i = 0; i < cellCount; i++) {
            const cx = 30 + seededRandom() * (w - 60);
            const cy = 30 + seededRandom() * (h - 60);
            const r = cellSize * (0.6 + seededRandom() * 0.8);
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 200, 190, ${0.6 + seededRandom() * 0.3})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(80, 80, 70, ${0.5 + seededRandom() * 0.4})`;
            ctx.lineWidth = mag === 40 ? 2 : 1;
            ctx.stroke();
            if (mag >= 10) {
                ctx.beginPath(); ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(100, 100, 90, ${0.3 + seededRandom() * 0.2})`;
                ctx.fill();
            }
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h);
        ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
        ctx.stroke();
        ctx.restore();

        ctx.beginPath(); ctx.arc(w/2, h/2, Math.min(w,h)/2 - 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = '#4fc3f7'; ctx.font = '14px monospace';
        ctx.fillText(`${mag}x`, 20, h - 20);
        ctx.fillText(`Confluency GT: ${confluency}%`, 20, h - 40);

        if (mag === 10) {
            this.sm.D3.microscope_inspected = true;
            this.sm.D3.microscope_magnification = 10;
        }
    }

    submitConfluency(value, stateMachine, labEnv) {
        if (isNaN(value) || value < 0 || value > 100) {
            this.sm.showWarning('Enter a valid confluency percentage (0–100).');
            setTimeout(() => this.sm.clearWarning(), 3000);
            return;
        }
        const groundTruth = this.sm.D1.starting_confluency;
        this.sm.D2.assessed_confluence_val = value;
        this.sm.D2.confluence_delta = Math.abs(value - groundTruth);
        document.getElementById('microscope-modal').classList.add('hidden');

        if (value < this.sm.D1.confluency_threshold) {
            this.sm.showConfirmModal(
                'Confluency Below Threshold',
                `Your assessment of ${value}% is below the 70% threshold required for trypsinization. ` +
                `Re-incubation is recommended. Do you wish to override and proceed anyway?`,
                () => {
                    this.sm.D3.microscope_inspected = true;
                    this.sm.D2.violation_log.push('CONFLUENCY_OVERRIDE');
                    this.sm.D2.technique_score = Math.max(0, this.sm.D2.technique_score - 15);
                    this.sm.showCalcModal('Assessment Recorded',
                        `<p>Confluency assessment: <strong>${value}%</strong></p>` +
                        `<p>Ground truth: <strong>${groundTruth}%</strong></p>` +
                        `<p>Variance: <strong>${Math.abs(value - groundTruth)}%</strong></p>` +
                        `<p style="color:#f44336">⚠ Override penalty applied (-15 points)</p>`
                    );
                },
                () => {
                    this.sm.showCalcModal('Re-incubation Required',
                        `<p>Culture confluency (${value}%) is insufficient for passaging.</p>` +
                        `<p>For this prototype, you may re-inspect and enter ≥ 70%.</p>`
                    );
                }
            );
        } else {
            this.sm.showCalcModal('Assessment Recorded',
                `<p>Confluency assessment: <strong>${value}%</strong></p>` +
                `<p>Ground truth: <strong>${groundTruth}%</strong></p>` +
                `<p>Variance: <strong>${Math.abs(value - groundTruth)}%</strong></p>` +
                (Math.abs(value - groundTruth) === 0 ?
                    `<p style="color:#4caf50">✓ Perfect assessment</p>` :
                    `<p>Proceed to enzymatic dissociation.</p>`)
            );
        }
    }

    // ——— Hemocytometer [FR-018–020, Appendix C] ———
    _generateGroundTruthCells() {
        this._groundTruthCells = [];
        const D1 = this.sm.D1;
        const totalLive = D1.ground_truth_live_cells;
        const totalDead = D1.ground_truth_dead_cells;

        const quadRanges = [
            { x: [0.05, 0.30], y: [0.05, 0.30] },
            { x: [0.70, 0.95], y: [0.05, 0.30] },
            { x: [0.05, 0.30], y: [0.70, 0.95] },
            { x: [0.70, 0.95], y: [0.70, 0.95] },
        ];

        let seed = 12345;
        function seededRandom() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

        for (let q = 0; q < 4; q++) {
            const qLive = Math.round(totalLive / 4) + (q < totalLive % 4 ? 1 : 0);
            const qDead = Math.round(totalDead / 4) + (q < totalDead % 4 ? 1 : 0);
            const range = quadRanges[q];
            for (let i = 0; i < qLive; i++) {
                this._groundTruthCells.push({
                    x: range.x[0] + seededRandom() * (range.x[1] - range.x[0]),
                    y: range.y[0] + seededRandom() * (range.y[1] - range.y[0]),
                    type: 'viable', quadrant: q, clicked: false,
                    radius: 0.008 + seededRandom() * 0.006,
                });
            }
            for (let i = 0; i < qDead; i++) {
                this._groundTruthCells.push({
                    x: range.x[0] + seededRandom() * (range.x[1] - range.x[0]),
                    y: range.y[0] + seededRandom() * (range.y[1] - range.y[0]),
                    type: 'nonviable', quadrant: q, clicked: false,
                    radius: 0.008 + seededRandom() * 0.005,
                });
            }
        }
    }

    setActiveQuadrant(q) { this._activeQuadrant = q; }

    renderHemocytometerGrid() {
        const canvas = document.getElementById('hemocytometer-canvas');
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;

        ctx.fillStyle = '#f5f5ee'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        for (let i = 1; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(w*i/3, 0); ctx.lineTo(w*i/3, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, h*i/3); ctx.lineTo(w, h*i/3); ctx.stroke();
        }

        const quadPositions = [
            { x: 0, y: 0 }, { x: w*2/3, y: 0 }, { x: 0, y: h*2/3 }, { x: w*2/3, y: h*2/3 },
        ];
        quadPositions.forEach((pos, i) => {
            ctx.fillStyle = i === this._activeQuadrant ? 'rgba(255,152,0,0.15)' : 'rgba(79,195,247,0.08)';
            ctx.fillRect(pos.x, pos.y, w/3, h/3);
            ctx.strokeStyle = '#aaa'; ctx.lineWidth = 0.5;
            for (let j = 1; j < 4; j++) {
                ctx.beginPath(); ctx.moveTo(pos.x + (w/3)*j/4, pos.y); ctx.lineTo(pos.x + (w/3)*j/4, pos.y + h/3); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(pos.x, pos.y + (h/3)*j/4); ctx.lineTo(pos.x + w/3, pos.y + (h/3)*j/4); ctx.stroke();
            }
        });

        for (const cell of this._groundTruthCells) {
            const cx = cell.x * w, cy = cell.y * h, r = cell.radius * w;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
            if (cell.type === 'viable') {
                ctx.fillStyle = cell.clicked ? 'rgba(76,175,80,0.3)' : 'rgba(255,255,240,0.8)';
                ctx.fill();
                ctx.strokeStyle = cell.clicked ? '#4caf50' : 'rgba(120,120,100,0.6)';
                ctx.lineWidth = cell.clicked ? 2 : 1; ctx.stroke();
            } else {
                ctx.fillStyle = cell.clicked ? 'rgba(21,101,192,0.9)' : 'rgba(30,60,150,0.8)';
                ctx.fill();
                ctx.strokeStyle = cell.clicked ? '#0d47a1' : '#1a237e';
                ctx.lineWidth = cell.clicked ? 2 : 1; ctx.stroke();
            }
        }

        document.getElementById('live-count').textContent = this.sm.D2.live_cells_counted;
        document.getElementById('dead-count').textContent = this.sm.D2.dead_cells_counted;
        const doneCount = this._quadrantsCounted.filter(q => q).length;
        document.getElementById('quadrants-done').textContent = doneCount;
        if (doneCount >= 4) document.getElementById('hemo-finish').classList.remove('hidden');
    }

    handleHemocytometerClick(canvasX, canvasY, canvasW, canvasH) {
        const normX = canvasX / canvasW, normY = canvasY / canvasH;
        let bestDist = Infinity, bestCell = null;
        for (const cell of this._groundTruthCells) {
            if (cell.quadrant !== this._activeQuadrant || cell.clicked) continue;
            const dx = cell.x - normX, dy = cell.y - normY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < bestDist && dist < 0.03) { bestDist = dist; bestCell = cell; }
        }
        if (bestCell) {
            bestCell.clicked = true;
            if (bestCell.type === 'viable') { this._liveCounts[this._activeQuadrant]++; this.sm.D2.live_cells_counted++; }
            else { this._deadCounts[this._activeQuadrant]++; this.sm.D2.dead_cells_counted++; }
            this._quadrantsCounted[this._activeQuadrant] = true;
            this.renderHemocytometerGrid();
        }
    }

    finishCounting(stateMachine) {
        const D1 = this.sm.D1, D2 = this.sm.D2;
        const totalLive = D2.live_cells_counted, totalDead = D2.dead_cells_counted;
        const totalCells = totalLive + totalDead;

        // C.1.1: Viable Concentration = (totalLive / 4) * dilutionFactor * 10^4
        const meanPerSquare = totalLive / 4.0;
        const dilutionFactor = 2.0;
        const calculatedDensity = meanPerSquare * dilutionFactor * D1.hemocytometer_factor;

        // C.1.2: Viability % = (totalLive / totalCells) * 100
        const calculatedViability = totalCells > 0 ? (totalLive / totalCells) * 100.0 : 0;

        const densityVariance = D1.ground_truth_cell_density > 0
            ? (Math.abs(calculatedDensity - D1.ground_truth_cell_density) / D1.ground_truth_cell_density) * 100.0 : 0;

        D2.calculated_density = calculatedDensity;
        D2.calculated_viability_pct = calculatedViability;
        D2.density_variance_pct = densityVariance;
        D2.trypsin_time_elapsed = this.sm.D3.trypsin_timer_elapsed / 60.0;

        document.getElementById('hemocytometer-modal').classList.add('hidden');

        const viabilityStatus = calculatedViability >= 90 ? '✓ Optimal (Pass)' :
                                calculatedViability >= 70 ? '⚠ Marginal (Warning)' : '✗ Failed (Abort)';
        const viabilityColor = calculatedViability >= 90 ? '#4caf50' :
                               calculatedViability >= 70 ? '#ff9800' : '#f44336';

        this.sm.showCalcModal('Cell Count & Viability Results',
            `<p><strong>Your Counts:</strong></p>` +
            `<p>Viable cells: ${totalLive} | Non-viable: ${totalDead} | Total: ${totalCells}</p><hr>` +
            `<p><strong>Calculated Viable Concentration (C.1.1):</strong></p>` +
            `<p>= (${totalLive} / 4) × 2.0 × 10⁴ = <strong>${calculatedDensity.toExponential(2)} cells/mL</strong></p>` +
            `<p><strong>Viability % (C.1.2):</strong></p>` +
            `<p>= (${totalLive} / ${totalCells}) × 100 = <strong>${calculatedViability.toFixed(1)}%</strong></p>` +
            `<p style="color:${viabilityColor}"><strong>${viabilityStatus}</strong></p><hr>` +
            `<p><strong>Ground Truth Density:</strong> ${D1.ground_truth_cell_density.toExponential(2)} cells/mL</p>` +
            `<p><strong>Density Variance:</strong> ${densityVariance.toFixed(1)}%</p>`
        );
        document.getElementById('calc-modal-ok').onclick = () => {
            document.getElementById('calculation-modal').classList.add('hidden');
        };
    }

    // ——— Inoculation [FR-021, Appendix C.1.3] ———
    submitInoculationVolume(v1, stateMachine) {
        const D1 = this.sm.D1, D2 = this.sm.D2;
        const C1 = D2.calculated_density;
        const C2 = D1.target_seeding_density;
        const V2 = D1.destination_volume;
        const correctV1 = (C2 * V2) / C1;

        D2.target_seed_vol_input = v1;
        D2.seed_calc_delta = Math.abs(v1 - correctV1);
        this.sm.D3.inoculation_volume_set = true;
        document.getElementById('inoculation-modal').classList.add('hidden');

        const accurate = D2.seed_calc_delta < 0.1;
        this.sm.showCalcModal('Inoculation Volume Check (C₁V₁ = C₂V₂)',
            `<p><strong>Your Input:</strong> V₁ = ${v1.toFixed(2)} mL</p>` +
            `<p><strong>Correct Answer:</strong> V₁ = (${C2.toExponential(1)} × ${V2}) / ${C1.toExponential(2)} = <strong>${correctV1.toFixed(3)} mL</strong></p>` +
            `<p><strong>Delta:</strong> ${D2.seed_calc_delta.toFixed(3)} mL</p>` +
            (accurate ? `<p style="color:#4caf50">✓ Accurate calculation</p>` :
                `<p style="color:#ff9800">⚠ Calculation variance detected (${D2.seed_calc_delta.toFixed(3)} mL off)</p>`)
        );
        if (!accurate) this.sm.D2.technique_score = Math.max(0, this.sm.D2.technique_score - 10);
        document.getElementById('calc-modal-ok').onclick = () => {
            document.getElementById('calculation-modal').classList.add('hidden');
        };
    }

    // ——— Vessel Labeling [FR-022] ———
    submitVesselLabel(initials, stateMachine, sessionManager) {
        if (!initials || initials.length === 0) {
            sessionManager.showWarning('Enter operator initials.');
            setTimeout(() => sessionManager.clearWarning(), 3000); return;
        }
        const date = new Date().toISOString().split('T')[0];
        const label = `CHO-K1_P+1_${date}_${initials}`;
        sessionManager.D2.vessel_label_record = label;
        sessionManager.D3.vessel_labeled = true;
        document.getElementById('label-modal').classList.add('hidden');
        sessionManager.showCalcModal('Vessel Label Attached',
            `<p><strong>Label:</strong> ${label}</p>` +
            `<p>Cell Line: CHO-K1 | Passage: P+1 | Date: ${date} | Operator: ${initials}</p>`
        );
        document.getElementById('calc-modal-ok').onclick = () => {
            document.getElementById('calculation-modal').classList.add('hidden');
        };
    }
}
```

- [ ] **Step 2: Verify microscope viewport rendering**

Navigate to microscope in-game (State 2), press E.

Expected:
- Circular viewport shows cell morphology at 4x magnification
- Clicking 10x/40x buttons changes cell size and detail level
- Ground truth confluency shown in bottom-left of viewport

- [ ] **Step 3: Verify hemocytometer counting and formulas**

Navigate to State 4, open hemocytometer.

Expected:
- 3×3 grid with highlighted corner quadrants
- Clicking on cells increments live/dead counters
- After tallying all 4 quadrants, "Finish Counting" appears
- Clicking finish shows calculation results matching Appendix C formulas

---

## Task 6: Integration & End-to-End Verification

- [ ] **Step 1: End-to-End Walkthrough**

Open `index.html` in Chrome and execute the complete flow:

1. **State 0 → 1:** Click PPE locker 3× → all PPE ON → click door → State 1
2. **State 1:** Click blower switch → wait 5s → click sash → click ethanol → wait 5s → click apparatus
3. **State 1 → 2:** Click microscope → toggle 10x → enter confluency (80) → submit
4. **State 2 → 3:** Back to BSC → click vacuum → click PBS → click trypsin → wait 3 min → press Space → click DMEM
5. **State 3 → 4:** Click Trypan Blue → click hemocytometer → count cells → finish
6. **State 4 → 5:** Click new flask → enter V1 → submit → click flask → enter initials → submit
7. **State 5 → 6:** Click cap toggle → click incubator → audit summary appears
8. **Admin:** Press F2 → enter `admin123` → verify access & export

- [ ] **Step 2: Test HZ-001 grille hazard**

In State 1, click media bottle → warning appears → click again → warning clears.

- [ ] **Step 3: Verify trypsin overexposure [HZ-003]**

Apply trypsin, do NOT quench, wait > 8 minutes → severe warning + 65% viability loss.

---

## Task 7: Final Verification & Commit

- [ ] **Step 1: Verification Checklist**

| Check | Expected |
|-------|----------|
| PointerLockControls engages on click, releases on Escape | ✓ |
| Cleanroom door locked until all PPE clicked | ✓ |
| Object near BSC front edge triggers HUD `[HZ-001]` | ✓ |
| Microscope modal toggles 4x, 10x, 40x | ✓ |
| Trypsin countdown degrades viability after 8.0 min | ✓ |
| Hemocytometer counting + C₁V₁=C₂V₂ math correct | ✓ |
| F2 → `admin123` → instructor panel + export works | ✓ |

- [ ] **Step 2: Fix any issues found during verification**

- [ ] **Step 3: Final commit**

```bash
cd /d e:\Users\Steven\Desktop\School\VR_LAB
git add index.html style.css main.js stateMachine.js labObjects.js biologyEngine.js sessionManager.js
git commit -m "feat: complete VR Cell Culture Laboratory browser prototype (SRS-VR-MCL-2026-V3.0)"
```
