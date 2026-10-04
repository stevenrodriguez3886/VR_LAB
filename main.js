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

// Grid helper for subtle ground orientation
const gridHelper = new THREE.GridHelper(20, 20, 0x4fc3f7, 0x334455);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

// ——— Pointer Lock Controls ———
const controls = new PointerLockControls(camera, document.body);

const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const hud = document.getElementById('hud');

blocker.addEventListener('click', () => { controls.lock(); });

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
const moveSpeed = 40.0;
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
    if (!controls.isLocked || isAnyModalOpen()) return;
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

// ——— Collision system ———
const PLAYER_RADIUS = 0.3; // player capsule radius in XZ plane

// Static collider AABBs: { minX, maxX, minZ, maxZ }
// All values account for PLAYER_RADIUS being pushed outward from surfaces.
const staticColliders = [
    // Room outer walls (keep player inside)
    // Left wall at x = -6, Right wall at x = 6
    // Back wall at z = 10, Front wall at z = -10
];

// Furniture / equipment colliders (keep player outside)
const furnitureColliders = [
    // Main workbench: center (1.6, -2.5), size (3.6, 1.6) → x: -0.2..3.4, z: -3.3..-1.7
    { minX: -0.2, maxX: 3.4, minZ: -3.3, maxZ: -1.7, label: 'bench' },
    // BSC body: center (-2, -2), size (2.4, 1.0) → x: -3.2..-0.8, z: -2.5..-1.5
    { minX: -3.2, maxX: -0.8, minZ: -2.5, maxZ: -1.5, label: 'bsc' },
    // Microscope: center (3, 0), base size (0.5, 0.4) → generous hitbox
    { minX: 2.6, maxX: 3.4, minZ: -0.3, maxZ: 0.3, label: 'microscope' },
    // PPE Locker: center (4, 8), size (1.2, 0.6) → x: 3.4..4.6, z: 7.7..8.3
    { minX: 3.4, maxX: 4.6, minZ: 7.7, maxZ: 8.3, label: 'locker' },
    // CO2 Incubator: center (4, -5), size (1.0, 0.8) → x: 3.5..4.5, z: -5.4..-4.6
    { minX: 3.5, maxX: 4.5, minZ: -5.4, maxZ: -4.6, label: 'incubator' },
    // Vacuum cart: center (-3.5, -2), size (0.35, 0.35) → small but collidable
    { minX: -3.75, maxX: -3.25, minZ: -2.25, maxZ: -1.75, label: 'vacuum' },
];

// Divider wall segments at z = 4
// Left section: x = -6 to -1, Right section: x = 1 to 6
// Doorway gap: x = -1 to 1 (2m wide), below header at y < 3
// Wall thickness ~ 0.15m, so collider z range: 3.9..4.1
const dividerLeft  = { minX: -6.0, maxX: -1.0, minZ: 3.85, maxZ: 4.15, label: 'divider-L' };
const dividerRight = { minX:  1.0, maxX:  6.0, minZ: 3.85, maxZ: 4.15, label: 'divider-R' };
// Doorway blocker (when door is closed): x = -1 to 1
const doorwayBlocker = { minX: -1.0, maxX: 1.0, minZ: 3.85, maxZ: 4.15, label: 'door' };

function resolveColliderPush(pos, collider) {
    // Check if player circle overlaps this AABB
    // Expand the AABB by PLAYER_RADIUS and test if pos is inside
    const eMinX = collider.minX - PLAYER_RADIUS;
    const eMaxX = collider.maxX + PLAYER_RADIUS;
    const eMinZ = collider.minZ - PLAYER_RADIUS;
    const eMaxZ = collider.maxZ + PLAYER_RADIUS;

    if (pos.x > eMinX && pos.x < eMaxX && pos.z > eMinZ && pos.z < eMaxZ) {
        // Player is overlapping — push out on the axis of least penetration
        const pushLeft  = pos.x - eMinX;
        const pushRight = eMaxX - pos.x;
        const pushBack  = pos.z - eMinZ;
        const pushFront = eMaxZ - pos.z;

        const minPush = Math.min(pushLeft, pushRight, pushBack, pushFront);

        if (minPush === pushLeft)       pos.x = eMinX;
        else if (minPush === pushRight) pos.x = eMaxX;
        else if (minPush === pushBack)  pos.z = eMinZ;
        else                            pos.z = eMaxZ;
    }
}

function clampPlayerPosition() {
    const pos = camera.position;

    // Outer room bounds (keep player inside)
    const margin = PLAYER_RADIUS;
    pos.x = Math.max(-6 + margin, Math.min(6 - margin, pos.x));
    pos.z = Math.max(-10 + margin, Math.min(10 - margin, pos.z));

    // Divider wall segments (always solid)
    resolveColliderPush(pos, dividerLeft);
    resolveColliderPush(pos, dividerRight);

    // Doorway: blocked when door is closed
    const doorObj = labEnv.getLabObjects().door;
    const doorIsOpen = doorObj && doorObj.userData.isOpen;
    if (!doorIsOpen) {
        resolveColliderPush(pos, doorwayBlocker);
    }

    // Furniture colliders
    for (const c of furnitureColliders) {
        resolveColliderPush(pos, c);
    }

    // Lock eye height
    pos.y = 1.65;
}

// ——— Animation Loop ———
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);

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
    const modal = document.getElementById('confirm-modal');
    const cb = modal ? modal._onConfirm : null;
    if (modal) {
        modal.classList.add('hidden');
        modal._onConfirm = null;
        modal._onCancel = null;
    }
    if (typeof cb === 'function') cb();
    if (!isAnyModalOpen()) controls.lock();
});
document.getElementById('confirm-no').addEventListener('click', () => {
    const modal = document.getElementById('confirm-modal');
    const cb = modal ? modal._onCancel : null;
    if (modal) {
        modal.classList.add('hidden');
        modal._onConfirm = null;
        modal._onCancel = null;
    }
    if (typeof cb === 'function') cb();
    if (!isAnyModalOpen()) controls.lock();
});

// Calculation modal OK button
document.getElementById('calc-modal-ok').addEventListener('click', () => {
    const modal = document.getElementById('calculation-modal');
    if (modal) modal.classList.add('hidden');
    if (!isAnyModalOpen()) controls.lock();
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
