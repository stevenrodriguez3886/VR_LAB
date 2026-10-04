// test_integration_e2e.mjs — Comprehensive End-to-End Integration & Lifecycle Test Suite
// Verifies all 5 laboratory phases, hazards, formulas, admin controls, and AES-256 encryption.
// Compliant with SRS-VR-MCL-2026-V3.0.

import assert from 'node:assert';
import { Scene, PerspectiveCamera } from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { SessionManager } from './sessionManager.js';
import { BiologyEngine } from './biologyEngine.js';
import { LabStateMachine, States } from './stateMachine.js';
import { createLabEnvironment } from './labObjects.js';

// ============================================================================
// 1. Mock DOM and Web API Environment Setup
// ============================================================================
const elementRegistry = new Map();
const lsStore = new Map();

function createMockElement(id, tag = 'div') {
    const el = {
        id,
        tagName: tag.toUpperCase(),
        textContent: '',
        innerHTML: '',
        value: '',
        dataset: {},
        className: 'hidden',
        classList: {
            _classes: new Set(['hidden']),
            add(c) {
                this._classes.add(c);
                el.className = Array.from(this._classes).join(' ');
            },
            remove(c) {
                this._classes.delete(c);
                el.className = Array.from(this._classes).join(' ');
            },
            contains(c) {
                return this._classes.has(c);
            },
            toggle(c) {
                if (this.contains(c)) this.remove(c);
                else this.add(c);
            }
        },
        style: {},
        width: 600,
        height: 400,
        _listeners: {},
        addEventListener(event, handler) {
            this._listeners[event] = this._listeners[event] || [];
            this._listeners[event].push(handler);
        },
        click() {
            (this._listeners['click'] || []).forEach(fn => fn({ target: el, preventDefault: () => {} }));
        },
        getContext(type) {
            return {
                save: () => {},
                restore: () => {},
                fillRect: () => {},
                beginPath: () => {},
                arc: () => {},
                fill: () => {},
                stroke: () => {},
                clip: () => {},
                moveTo: () => {},
                lineTo: () => {},
                fillText: () => {}
            };
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 600 }),
        appendChild: () => {},
        removeChild: () => {}
    };
    return el;
}

function getOrCreateElement(id, tag = 'div') {
    if (!elementRegistry.has(id)) {
        elementRegistry.set(id, createMockElement(id, tag));
    }
    return elementRegistry.get(id);
}

// Pre-populate elements matching index.html
const allElementIds = [
    'blocker', 'instructions', 'hud', 'crosshair', 'phase-banner',
    'timer-readout', 'timer-label', 'timer-value', 'ppe-status',
    'tooltip', 'warning-banner', 'warning-text', 'bsc-status',
    'bsc-blower-status', 'bsc-hepa-status', 'bsc-sash-status', 'bsc-surface-status',
    'microscope-modal', 'microscope-canvas', 'confluency-input', 'confluency-submit', 'microscope-close',
    'hemocytometer-modal', 'hemocytometer-canvas', 'live-count', 'dead-count', 'quadrants-done', 'hemo-finish', 'hemo-close',
    'calculation-modal', 'calc-modal-title', 'calc-modal-body', 'calc-modal-ok',
    'label-modal', 'label-line', 'label-passage', 'label-date', 'label-initials', 'label-submit',
    'inoculation-modal', 'inoc-c1', 'inoc-v1', 'inoc-submit',
    'admin-modal', 'admin-login', 'admin-controls', 'admin-pin', 'admin-login-btn', 'admin-login-error',
    'admin-confluency', 'admin-density', 'admin-logs', 'admin-export', 'admin-close',
    'confirm-modal', 'confirm-title', 'confirm-message', 'confirm-yes', 'confirm-no',
    'audit-modal', 'audit-json', 'audit-export', 'audit-restart'
];

allElementIds.forEach(id => getOrCreateElement(id));

// PPE status spans
const ppeSpans = {
    gloves: createMockElement('ppe-gloves-span', 'span'),
    coat: createMockElement('ppe-coat-span', 'span'),
    eyewear: createMockElement('ppe-eyewear-span', 'span')
};

const mockLocalStorage = {
    getItem: (k) => lsStore.get(k) || null,
    setItem: (k, v) => lsStore.set(k, String(v)),
    removeItem: (k) => lsStore.delete(k),
    clear: () => lsStore.clear()
};

globalThis.window = globalThis.window || globalThis;
Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    configurable: true,
    writable: true
});

globalThis.document = {
    getElementById: (id) => getOrCreateElement(id),
    querySelector: (sel) => {
        if (sel.includes('data-ppe="gloves"')) return ppeSpans.gloves;
        if (sel.includes('data-ppe="coat"')) return ppeSpans.coat;
        if (sel.includes('data-ppe="eyewear"')) return ppeSpans.eyewear;
        if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
        return createMockElement('query-' + sel);
    },
    querySelectorAll: (sel) => {
        if (sel === '.modal') {
            return [
                getOrCreateElement('microscope-modal'),
                getOrCreateElement('hemocytometer-modal'),
                getOrCreateElement('calculation-modal'),
                getOrCreateElement('label-modal'),
                getOrCreateElement('inoculation-modal'),
                getOrCreateElement('admin-modal'),
                getOrCreateElement('confirm-modal'),
                getOrCreateElement('audit-modal')
            ];
        }
        return [];
    },
    createElement: (tag) => createMockElement('dyn-' + tag, tag),
    body: {
        appendChild: () => {},
        removeChild: () => {}
    }
};

// ============================================================================
// 2. Test Harness Utilities
// ============================================================================
let passedCount = 0;
let totalCount = 0;

async function runTest(title, fn) {
    totalCount++;
    try {
        await fn();
        console.log(`  ✓ ${title}`);
        passedCount++;
    } catch (err) {
        console.error(`  ✗ FAIL: ${title}`);
        console.error(err);
        process.exit(1);
    }
}

function createTestLab() {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const fsm = new LabStateMachine(sm, bio);
    const scene = new Scene();
    const camera = new PerspectiveCamera(75, 1, 0.1, 100);
    const controls = new PointerLockControls(camera, globalThis.document.body);
    const labEnv = createLabEnvironment(scene, sm);
    const ctx = {
        stateMachine: fsm,
        sessionManager: sm,
        biologyEngine: bio,
        labEnv,
        camera,
        controls,
        scene
    };
    return { sm, bio, fsm, labEnv, ctx, labObjects: labEnv.getLabObjects() };
}

console.log('================================================================');
console.log('🔬 VR Cell Culture Laboratory — End-to-End Integration Test Suite');
console.log('   SRS-VR-MCL-2026-V3.0 Lifecycle & Verification');
console.log('================================================================\n');

// ============================================================================
// Suite 1: State 0 -> State 1 (Anteroom -> Cabinet Setup & PPE Validation)
// ============================================================================
console.log('--- Test Suite 1: State 0 -> State 1 (Anteroom -> Cabinet Setup) ---');

await runTest('Door entry is blocked when PPE is incomplete [FR-001]', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();

    assert.strictEqual(fsm.getCurrentState(), States.ANTEROOM);
    assert.strictEqual(sm.D2.ppe_status, false);

    // Guard rejects transition
    const check = fsm.canTransition(States.CABINET_SETUP);
    assert.strictEqual(check.allowed, false);
    assert.match(check.reason, /PPE not complete/i);

    // Physical door interaction should fail
    labObjects.door.userData.onInteract(labObjects.door, ctx);
    assert.strictEqual(fsm.getCurrentState(), States.ANTEROOM);
    assert.strictEqual(labObjects.door.userData.isOpen, false);
});

await runTest('Locker interaction equips gloves, lab coat, and eye protection', () => {
    const { sm, labObjects, ctx } = createTestLab();

    // Click 1: Gloves
    labObjects.locker.userData.onInteract(labObjects.locker, ctx);
    assert.strictEqual(sm.D3.ppe_gloves, true);
    assert.strictEqual(sm.D3.ppe_coat, false);
    assert.strictEqual(sm.D3.ppe_eyewear, false);
    assert.strictEqual(sm.D2.ppe_status, false);
    assert.strictEqual(sm.isPPEComplete(), false);

    // Click 2: Lab coat
    labObjects.locker.userData.onInteract(labObjects.locker, ctx);
    assert.strictEqual(sm.D3.ppe_coat, true);
    assert.strictEqual(sm.D2.ppe_status, false);

    // Click 3: Eye protection
    labObjects.locker.userData.onInteract(labObjects.locker, ctx);
    assert.strictEqual(sm.D3.ppe_eyewear, true);
    assert.strictEqual(sm.D2.ppe_status, true);
    assert.strictEqual(sm.isPPEComplete(), true);
    assert.strictEqual(labObjects.locker.userData.tooltipText, 'PPE Equipped ✓');
});

await runTest('Equipped PPE unlocks cleanroom door and triggers State 1 transition', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();

    // Equip all PPE
    sm.togglePPE('gloves');
    sm.togglePPE('coat');
    sm.togglePPE('eyewear');
    assert.strictEqual(sm.D2.ppe_status, true);

    const check = fsm.canTransition(States.CABINET_SETUP);
    assert.strictEqual(check.allowed, true);

    // Interact with door
    labObjects.door.userData.onInteract(labObjects.door, ctx);
    assert.strictEqual(fsm.getCurrentState(), States.CABINET_SETUP);
    assert.strictEqual(labObjects.door.userData.isOpen, true);
});

// ============================================================================
// Suite 2: State 1 (Cabinet Setup, Decontamination, and [HZ-001] Grille Hazard)
// ============================================================================
console.log('\n--- Test Suite 2: State 1 (Cabinet Setup, Purge, Sash & Decontamination) ---');

await runTest('BSC Blower activation starts HEPA purge; 5-second simulated purge stabilizes [FR-002]', () => {
    const { sm, fsm, labObjects, ctx, labEnv } = createTestLab();
    fsm.currentState = States.CABINET_SETUP;

    assert.strictEqual(sm.D3.hepa_blower_active, false);
    assert.strictEqual(sm.D2.blower_purge_completed, false);

    // Switch on blower
    labObjects.blowerSwitch.userData.onInteract(labObjects.blowerSwitch, ctx);
    assert.strictEqual(sm.D3.hepa_blower_active, true);
    assert.strictEqual(sm.D2.blower_purge_completed, false);

    // Advance purge timer
    labEnv.update(sm.D1.blower_purge_delay_sim, fsm, sm);
    assert.strictEqual(sm.D2.blower_purge_completed, true);
});

await runTest('Glass sash adjustment to 20.0 cm meets compliance criteria (20 ± 1 cm) [FR-003]', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.CABINET_SETUP;

    assert.strictEqual(sm.D2.sash_compliance, false);
    assert.strictEqual(sm.D3.sash_height, 0.0);

    // Adjust sash
    labObjects.sashInteract.userData.onInteract(labObjects.sashInteract, ctx);
    assert.strictEqual(sm.D3.sash_height, 20.0);
    assert.strictEqual(sm.D2.sash_compliance, true);
});

await runTest('70% Ethanol application marks surface clean after 5-second evaporation [FR-004]', () => {
    const { sm, fsm, labObjects, ctx, labEnv } = createTestLab();
    fsm.currentState = States.CABINET_SETUP;

    assert.strictEqual(sm.D3.ethanol_applied, false);
    assert.strictEqual(sm.D3.workstation_clean_state, false);

    // Apply ethanol
    labObjects.ethanolBottle.userData.onInteract(labObjects.ethanolBottle, ctx);
    assert.strictEqual(sm.D3.ethanol_applied, true);
    assert.strictEqual(sm.D3.workstation_clean_state, false);

    // Wait simulated evaporation time
    labEnv.update(sm.D1.ethanol_evaporation_time_sim, fsm, sm);
    assert.strictEqual(sm.D3.workstation_clean_state, true);
});

await runTest('Staging sterile apparatus sets apparatus_staged flag [FR-005]', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.CABINET_SETUP;

    assert.strictEqual(sm.D3.apparatus_staged, false);
    labObjects.supplyShelf.userData.onInteract(labObjects.supplyShelf, ctx);
    assert.strictEqual(sm.D3.apparatus_staged, true);
});

await runTest('Intake grille hazard [HZ-001]: placement disrupts air curtain, repositioning restores integrity', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.CABINET_SETUP;

    assert.strictEqual(sm.D3.air_curtain_integrity, true);
    assert.strictEqual(sm.D2.grille_blockage_events, 0);
    assert.strictEqual(sm.D2.technique_score, 100);

    // Place media bottle too close to front intake grille
    labObjects.testObject.userData.onInteract(labObjects.testObject, ctx);
    assert.strictEqual(sm.D3.air_curtain_integrity, false);
    assert.strictEqual(sm.D2.grille_blockage_events, 1);
    assert.strictEqual(sm.D2.violation_log.includes('HZ-001'), true);
    assert.strictEqual(sm.D2.technique_score, 95); // -5 penalty
    assert.strictEqual(labObjects.testObject.userData.nearGrille, true);

    // Reposition bottle safely to rear
    labObjects.testObject.userData.onInteract(labObjects.testObject, ctx);
    assert.strictEqual(sm.D3.air_curtain_integrity, true);
    assert.strictEqual(labObjects.testObject.userData.nearGrille, false);
});

await runTest('Thermal stress violation when cold reagent (< 37°C) is introduced [FR-006]', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.CABINET_SETUP;
    assert.strictEqual(sm.D2.technique_score, 100);
    assert.strictEqual(sm.D2.violation_log.includes('THERMAL_STRESS'), false);

    // 1. Direct validation: pre-warmed reagent (37.0°C) is compliant
    assert.strictEqual(sm.validateReagentTemperature(37.0), true);
    assert.strictEqual(sm.D2.technique_score, 100);
    assert.strictEqual(sm.D2.violation_log.includes('THERMAL_STRESS'), false);

    // 2. Direct validation: cold reagent (< 36.5°C) triggers violation and -10 penalty
    assert.strictEqual(sm.validateReagentTemperature(22.0), false);
    assert.strictEqual(sm.D2.technique_score, 90);
    assert.strictEqual(sm.D2.violation_log.includes('THERMAL_STRESS'), true);

    const warnBanner = getOrCreateElement('warning-banner');
    const warnText = getOrCreateElement('warning-text');
    assert.strictEqual(warnBanner.classList.contains('hidden'), false);
    assert.match(warnText.textContent, /THERMAL STRESS|FR-006/i);

    // 3. Container retrieval into BSC with cold temperature evaluates upon introduction
    const coldLab = createTestLab();
    coldLab.fsm.currentState = States.CABINET_SETUP;
    coldLab.labObjects.testObject.userData.temperature = 4.0; // refrigerator cold
    coldLab.labObjects.testObject.userData.onInteract(coldLab.labObjects.testObject, coldLab.ctx);
    assert.strictEqual(coldLab.sm.D2.violation_log.includes('THERMAL_STRESS'), true);
    // Score reflects -10 (thermal stress) and -5 (grille hazard) = 85
    assert.strictEqual(coldLab.sm.D2.technique_score, 85);

    // 4. Dispensing cold PBS wash buffer
    const coldWashLab = createTestLab();
    coldWashLab.fsm.currentState = States.DISSOCIATION;
    coldWashLab.sm.D3.medium_aspirated = true;
    coldWashLab.labObjects.pbsBottle.userData.temperature = 20.0; // room temperature
    coldWashLab.labObjects.pbsBottle.userData.onInteract(coldWashLab.labObjects.pbsBottle, coldWashLab.ctx);
    assert.strictEqual(coldWashLab.sm.D2.violation_log.includes('THERMAL_STRESS'), true);
    assert.strictEqual(coldWashLab.sm.D2.technique_score, 90);
});

// ============================================================================
// Suite 3: State 1 -> State 2 -> State 3 (Inspection to Dissociation)
// ============================================================================
console.log('\n--- Test Suite 3: State 1 -> State 2 -> State 3 (Microscope Inspection & Confluency) ---');

await runTest('Transition to State 2 occurs on microscope interaction when cabinet setup is complete', () => {
    const { sm, fsm, labObjects, ctx, labEnv } = createTestLab();
    fsm.currentState = States.CABINET_SETUP;

    // Fulfill State 1 prerequisites
    sm.D3.hepa_blower_active = true;
    labEnv.update(sm.D1.blower_purge_delay_sim, fsm, sm);
    sm.D3.sash_height = 20.0;
    sm.D2.sash_compliance = true;
    sm.D3.ethanol_applied = true;
    labEnv.update(sm.D1.ethanol_evaporation_time_sim, fsm, sm);
    sm.D3.apparatus_staged = true;

    assert.strictEqual(fsm.canTransition(States.INSPECTION).allowed, true);

    labObjects.microscope.userData.onInteract(labObjects.microscope, ctx);
    assert.strictEqual(fsm.getCurrentState(), States.INSPECTION);
});

await runTest('Toggling 4x, 10x, 40x objectives updates magnification; 10x inspection flag confirmed [FR-007–008]', () => {
    const { sm, bio } = createTestLab();

    bio.setMicroscopeMagnification(4);
    assert.strictEqual(bio.getMagnification(), 4);
    assert.strictEqual(sm.D3.microscope_inspected, false);

    bio.setMicroscopeMagnification(10);
    assert.strictEqual(bio.getMagnification(), 10);
    assert.strictEqual(sm.D3.microscope_inspected, true);
    assert.strictEqual(sm.D3.microscope_magnification, 10);

    bio.setMicroscopeMagnification(40);
    assert.strictEqual(bio.getMagnification(), 40);
    assert.strictEqual(sm.D3.microscope_inspected, true);
});

await runTest('Submitting confluency >= 70% automatically transitions to State 3 (DISSOCIATION) [FR-009]', () => {
    const { sm, bio, fsm, labEnv } = createTestLab();
    fsm.currentState = States.INSPECTION;
    sm.D3.microscope_inspected = true;

    bio.submitConfluency(85, fsm, labEnv);

    assert.strictEqual(sm.D2.assessed_confluence_val, 85);
    assert.strictEqual(sm.D2.confluence_delta, Math.abs(85 - sm.D1.starting_confluency));
    assert.strictEqual(fsm.getCurrentState(), States.DISSOCIATION);
});

await runTest('Confluency < 70% offers override: applies -15 penalty and allows transition to State 3 [FR-010]', () => {
    const { sm, bio, fsm, labEnv } = createTestLab();
    fsm.currentState = States.INSPECTION;
    sm.D3.microscope_inspected = true;
    const initialScore = sm.D2.technique_score;

    // Assessment is 50% (< 70% threshold)
    bio.submitConfluency(50, fsm, labEnv);

    // Modal was shown with confirm callback
    const confirmModal = getOrCreateElement('confirm-modal');
    assert.strictEqual(typeof confirmModal._onConfirm, 'function');

    // Execute user override
    confirmModal._onConfirm();

    assert.strictEqual(sm.D2.violation_log.includes('CONFLUENCY_OVERRIDE'), true);
    assert.strictEqual(sm.D2.technique_score, initialScore - 15);
    assert.strictEqual(fsm.getCurrentState(), States.DISSOCIATION);
});

// ============================================================================
// Suite 4: State 3 (Trypsinization, Detachment, [HZ-003] Overexposure, Quenching)
// ============================================================================
console.log('\n--- Test Suite 4: State 3 (Aspiration, PBS Wash, Trypsinization & Quenching) ---');

await runTest('Spent medium is evacuated into waste trap at 2.0 mL/s [FR-011]', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.DISSOCIATION;

    assert.strictEqual(sm.D3.flask_medium_level, 12.0);
    assert.strictEqual(sm.D3.waste_trap_fill_level, 0.0);

    labObjects.vacuum.userData.onInteract(labObjects.vacuum, ctx);

    assert.strictEqual(sm.D3.medium_aspirated, true);
    assert.strictEqual(sm.D3.flask_medium_level, 0.0);
    assert.strictEqual(sm.D3.waste_trap_fill_level, 12.0);
    assert.strictEqual(sm.D2.aspiration_vol_removed, 12.0);
});

await runTest('5.0 mL PBS wash dispensed down sidewall [FR-012]', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.DISSOCIATION;
    sm.D3.medium_aspirated = true;

    assert.strictEqual(sm.D3.pbs_washed, false);

    labObjects.pbsBottle.userData.onInteract(labObjects.pbsBottle, ctx);

    assert.strictEqual(sm.D3.pbs_washed, true);
    assert.strictEqual(sm.D3.pbs_volume_in_flask, 5.0);
    assert.strictEqual(sm.D2.pbs_wash_vol_actual, 5.0);
});

await runTest('Perpendicular wash angle penalty (-10 points, sidewall violation count incremented) [FR-012]', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.DISSOCIATION;
    sm.D3.medium_aspirated = true;
    assert.strictEqual(sm.D2.technique_score, 100);
    assert.strictEqual(sm.D2.sidewall_violations, 0);

    // 1. Validating compliant angle (<= 45°) does not penalize
    assert.strictEqual(sm.validateDispenseAngle(30.0), true);
    assert.strictEqual(sm.D2.sidewall_violations, 0);
    assert.strictEqual(sm.D2.technique_score, 100);

    // 2. Direct validation with perpendicular angle (> 45°) incurs penalty
    assert.strictEqual(sm.validateDispenseAngle(90.0), false);
    assert.strictEqual(sm.D2.sidewall_violations, 1);
    assert.strictEqual(sm.D2.technique_score, 90);
    assert.strictEqual(sm.D2.violation_log.includes('SIDEWALL_SHEAR'), true);

    // 3. Interactive PBS wash with perpendicular angle (90°)
    const lab2 = createTestLab();
    lab2.fsm.currentState = States.DISSOCIATION;
    lab2.sm.D3.medium_aspirated = true;
    lab2.labObjects.pbsBottle.userData.dispenseAngle = 90.0; // perpendicular to monolayer
    lab2.labObjects.pbsBottle.userData.onInteract(lab2.labObjects.pbsBottle, lab2.ctx);

    assert.strictEqual(lab2.sm.D2.sidewall_violations, 1);
    assert.strictEqual(lab2.sm.D2.technique_score, 90);
    assert.strictEqual(lab2.sm.D2.violation_log.includes('SIDEWALL_SHEAR'), true);

    const warnBanner = getOrCreateElement('warning-banner');
    const warnText = getOrCreateElement('warning-text');
    assert.strictEqual(warnBanner.classList.contains('hidden'), false);
    assert.match(warnText.textContent, /Perpendicular Dispense|Fluid Shear/i);
});

await runTest('2.5 mL 0.25% Trypsin-EDTA dispenses and starts incubation timer [FR-013]', () => {
    const { sm, bio, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.DISSOCIATION;
    sm.D3.medium_aspirated = true;
    sm.D3.pbs_washed = true;

    assert.strictEqual(sm.D3.trypsin_applied, false);
    assert.strictEqual(bio.isTrypsinTimerActive(), false);

    labObjects.trypsinBottle.userData.onInteract(labObjects.trypsinBottle, ctx);

    assert.strictEqual(sm.D3.trypsin_applied, true);
    assert.strictEqual(sm.D3.active_trypsin_volume, 2.5);
    assert.strictEqual(sm.D2.trypsin_vol_actual, 2.5);
    assert.strictEqual(sm.D3.trypsin_activity_state, 'Active');
    assert.strictEqual(bio.isTrypsinTimerActive(), true);
});

await runTest('Timer advancing past 3.0 min enables mechanical tap (Spacebar) to detach cells to Suspension [FR-014]', () => {
    const { sm, bio, fsm } = createTestLab();
    fsm.currentState = States.DISSOCIATION;
    sm.D3.trypsin_activity_state = 'Active';
    bio.startTrypsinTimer();

    // Advancing to 2.5 minutes (150s) -> Adherent
    bio.update(150, fsm);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Adherent');

    // Premature tap (< 3.0 min) should not detach
    bio.registerTap(fsm);
    assert.strictEqual(sm.D2.mechanical_tap_detected, false);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Adherent');

    // Advance to 3.2 minutes (total 192s) -> Rounding
    bio.update(42, fsm);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Rounding');

    // Nominal tap
    bio.registerTap(fsm);
    assert.strictEqual(sm.D2.mechanical_tap_detected, true);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Suspension');
});

await runTest('Lysis edge case [HZ-003]: timer >= 8.0 min triggers severe lysis alert, degrades viability by 65%, sets Lysed', () => {
    const { sm, bio, fsm } = createTestLab();
    fsm.currentState = States.DISSOCIATION;
    sm.D3.trypsin_activity_state = 'Active';
    const initialScore = sm.D2.technique_score;
    const initialLive = sm.D1.ground_truth_live_cells;

    bio.startTrypsinTimer();
    // Advance to 8.1 minutes (486s)
    bio.update(486, fsm);

    assert.strictEqual(sm.D2.overexposure_flag, true);
    assert.strictEqual(sm.D2.violation_log.includes('HZ-003'), true);
    assert.strictEqual(sm.D2.technique_score, initialScore - 30);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Lysed');
    assert.strictEqual(bio.isTrypsinTimerActive(), false);

    // 65% loss
    const expectedRemaining = Math.max(0, initialLive - Math.round(initialLive * 0.65));
    assert.strictEqual(sm.D1.ground_truth_live_cells, expectedRemaining);

    // Subsequent tap cannot revive lysed culture
    bio.registerTap(fsm);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Lysed');
});

await runTest('Dispensing >= 6.0 mL (7.5 mL) complete DMEM neutralizes trypsin [FR-015]', () => {
    const { sm, bio, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.DISSOCIATION;
    sm.D3.trypsin_activity_state = 'Active';
    bio.startTrypsinTimer();

    labObjects.dmemBottle.userData.onInteract(labObjects.dmemBottle, ctx);

    assert.strictEqual(sm.D3.cells_quenched, true);
    assert.strictEqual(sm.D2.quench_media_vol_actual, 7.5);
    assert.strictEqual(sm.D3.trypsin_activity_state, 'Neutralized');
    assert.strictEqual(bio.isTrypsinTimerActive(), false);
});

// ============================================================================
// Suite 5: State 4 (Viability Staining & Hemocytometer Quantification)
// ============================================================================
console.log('\n--- Test Suite 5: State 4 (Viability Staining, Hemocytometer & Calculations) ---');

await runTest('Mixing 1:1 aliquot with Trypan Blue vital dye transitions to State 4 [FR-016–017]', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.DISSOCIATION;
    sm.D3.medium_aspirated = true;
    sm.D3.pbs_washed = true;
    sm.D3.trypsin_activity_state = 'Neutralized';
    sm.D2.mechanical_tap_detected = true;

    assert.strictEqual(sm.D3.trypan_blue_mixed, false);

    labObjects.trypanGroup.userData.onInteract(labObjects.trypanGroup, ctx);

    assert.strictEqual(fsm.getCurrentState(), States.QUANTIFICATION);
    assert.strictEqual(sm.D3.trypan_blue_mixed, true);
});

await runTest('Loading hemocytometer chamber opens Neubauer slide [FR-018]', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.QUANTIFICATION;
    sm.D3.trypan_blue_mixed = true;

    assert.strictEqual(sm.D3.hemocytometer_loaded, false);

    labObjects.hemoGroup.userData.onInteract(labObjects.hemoGroup, ctx);

    assert.strictEqual(sm.D3.hemocytometer_loaded, true);
});

await runTest('Counting cells across 4 corner quadrants and verifying Appendix C formulas [FR-019–020]', () => {
    const { sm, bio, fsm } = createTestLab();
    fsm.currentState = States.QUANTIFICATION;
    sm.D3.trypan_blue_mixed = true;
    sm.D3.hemocytometer_loaded = true;

    // Simulate clicking all ground truth cells in each of the 4 quadrants
    const allCells = bio.getGroundTruthCells();
    assert.strictEqual(allCells.length > 0, true);

    for (let q = 0; q < 4; q++) {
        bio.setActiveQuadrant(q);
        for (const cell of allCells) {
            if (cell.quadrant === q && !cell.clicked) {
                bio.handleHemocytometerClick(cell.x * 600, cell.y * 600, 600, 600);
            }
        }
    }

    assert.strictEqual(bio.getQuadrantsCounted().every(Boolean), true);
    const live = sm.D2.live_cells_counted;
    const dead = sm.D2.dead_cells_counted;
    const total = live + dead;

    assert.strictEqual(live, sm.D1.ground_truth_live_cells);
    assert.strictEqual(dead, sm.D1.ground_truth_dead_cells);

    // Call finishCounting
    bio.finishCounting(fsm);

    // Appendix C.1.1: Viable Concentration = (Live / 4) * 2.0 * 10^4
    const expectedDensity = (live / 4.0) * 2.0 * sm.D1.hemocytometer_factor;
    assert.strictEqual(sm.D2.calculated_density, expectedDensity);

    // Appendix C.1.2: Viability % = (Live / Total) * 100
    const expectedViability = (live / total) * 100.0;
    assert.strictEqual(sm.D2.calculated_viability_pct, expectedViability);

    // Appendix C.1.3: Density Variance % = |calc - GT| / GT * 100
    const expectedVariance = (Math.abs(expectedDensity - sm.D1.ground_truth_cell_density) / sm.D1.ground_truth_cell_density) * 100.0;
    assert.strictEqual(sm.D2.density_variance_pct, expectedVariance);
});

await runTest('Quantification complete allows destination flask interaction to transition to State 5', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.QUANTIFICATION;
    sm.D3.trypan_blue_mixed = true;
    sm.D3.hemocytometer_loaded = true;
    sm.D2.calculated_density = 950000;
    sm.D2.calculated_viability_pct = 95.0;

    assert.strictEqual(fsm.canTransition(States.INOCULATION).allowed, true);

    labObjects.destFlask.userData.onInteract(labObjects.destFlask, ctx);
    assert.strictEqual(fsm.getCurrentState(), States.INOCULATION);
});

// ============================================================================
// Suite 6: State 5 -> State 6 (Inoculation, Labeling, Incubation, Audit)
// ============================================================================
console.log('\n--- Test Suite 6: State 5 -> State 6 (Inoculation, Labeling, Incubation, Audit) ---');

await runTest('Computes inoculum volume V1 = (C2 * V2) / C1 for target density 1.0x10^5 in 10.0 mL [FR-021]', () => {
    const { sm, bio, fsm } = createTestLab();
    fsm.currentState = States.INOCULATION;

    const C1 = 1000000; // 1.0 x 10^6
    const C2 = sm.D1.target_seeding_density; // 1.0 x 10^5
    const V2 = sm.D1.destination_volume;     // 10.0 mL
    const correctV1 = (C2 * V2) / C1;        // 1.00 mL

    sm.D2.calculated_density = C1;

    // Submit accurate volume
    bio.submitInoculationVolume(1.0, fsm);

    assert.strictEqual(sm.D3.inoculation_volume_set, true);
    assert.strictEqual(sm.D2.target_seed_vol_input, 1.0);
    assert.strictEqual(sm.D2.seed_calc_delta < 0.001, true);
});

await runTest('Enters vessel metadata CHO-K1_P+1_[Date]_[Initials] [FR-022]', () => {
    const { sm, bio, fsm } = createTestLab();
    fsm.currentState = States.INOCULATION;

    bio.submitVesselLabel('SR', fsm, sm);

    assert.strictEqual(sm.D3.vessel_labeled, true);
    assert.match(sm.D2.vessel_label_record, /^CHO-K1_P\+1_\d{4}-\d{2}-\d{2}_SR$/);
});

await runTest('Incubator checks filter cap vented and sealed state [FR-023]', () => {
    const { sm, fsm, labObjects, ctx } = createTestLab();
    fsm.currentState = States.INOCULATION;
    sm.D3.inoculation_volume_set = true;
    sm.D3.vessel_labeled = true;

    // Unvented cap should block incubator completion
    assert.strictEqual(sm.D3.cap_vented, false);
    labObjects.incubator.userData.onInteract(labObjects.incubator, ctx);
    assert.strictEqual(fsm.getCurrentState(), States.INOCULATION);
    assert.strictEqual(sm.D3.flask_in_incubator, false);

    // Toggle filter cap to vented
    labObjects.capToggle.userData.onInteract(labObjects.capToggle, ctx);
    assert.strictEqual(sm.D3.cap_vented, true);
    assert.strictEqual(sm.D2.cap_vented_status, true);

    // Now place in incubator
    labObjects.incubator.userData.onInteract(labObjects.incubator, ctx);
    assert.strictEqual(sm.D3.flask_in_incubator, true);
    assert.strictEqual(fsm.getCurrentState(), States.COMPLETE);
});

await runTest('State 6 triggers session finalization and AES-256 encrypted persistence [FR-024]', async () => {
    const { sm, fsm } = createTestLab();
    fsm.currentState = States.INOCULATION;
    sm.D3.inoculation_volume_set = true;
    sm.D3.vessel_labeled = true;
    sm.D3.cap_vented = true;
    sm.D3.flask_in_incubator = true;

    // Transition to COMPLETE
    const ok = fsm.transition(States.COMPLETE);
    assert.strictEqual(ok, true);
    assert.strictEqual(fsm.getCurrentState(), States.COMPLETE);

    // Wait for async encryption
    const enc = await sm.generateEncryptedSession();

    assert.strictEqual(enc.algorithm, 'AES-256-GCM');
    assert.strictEqual(enc.session_id, sm.D2.session_id);
    assert.strictEqual(typeof enc.ciphertext, 'string');
    assert.strictEqual(enc.ciphertext.length > 50, true);

    // Stored in localStorage
    const saved = localStorage.getItem(`vr_mcl_session_${sm.D2.session_id}`);
    assert.strictEqual(typeof saved, 'string');
    const parsedStored = JSON.parse(saved);
    assert.strictEqual(parsedStored.algorithm, 'AES-256-GCM');

    // Decrypt and verify payload
    const decrypted = await sm.decryptSession(enc, 'admin123');
    assert.strictEqual(decrypted.verified, true);
    assert.strictEqual(decrypted.data.session_id, sm.D2.session_id);
});

// ============================================================================
// Suite 7: Instructor Administrative Mode ([FR-025], UC-05, UC-06)
// ============================================================================
console.log('\n--- Test Suite 7: Instructor Administrative Mode ([FR-025], UC-05, UC-06) ---');

await runTest('F2 terminal authentication succeeds with PIN admin123 [FR-025]', () => {
    const { sm } = createTestLab();

    assert.strictEqual(sm.isAdminAuthenticated(), false);
    const success = sm.authenticate('admin123');
    assert.strictEqual(success, true);
    assert.strictEqual(sm.isAdminAuthenticated(), true);
});

await runTest('Security lockout is enforced after exactly 3 failed PIN attempts', () => {
    const { sm } = createTestLab();

    assert.strictEqual(sm.authenticate('wrong1'), false);
    assert.strictEqual(sm.isAdminLocked(), false);

    assert.strictEqual(sm.authenticate('wrong2'), false);
    assert.strictEqual(sm.isAdminLocked(), false);

    assert.strictEqual(sm.authenticate('wrong3'), false);
    assert.strictEqual(sm.isAdminLocked(), true);

    // Locked: even correct PIN is rejected
    assert.strictEqual(sm.authenticate('admin123'), false);
});

await runTest('Adjusting baseline cell density is constrained to [1.0x10^5, 5.0x10^6]', () => {
    const { sm } = createTestLab();

    // Valid lower boundary
    assert.strictEqual(sm.setGroundTruthDensity(100000), true);
    assert.strictEqual(sm.D1.ground_truth_cell_density, 100000);

    // Valid upper boundary
    assert.strictEqual(sm.setGroundTruthDensity(5000000), true);
    assert.strictEqual(sm.D1.ground_truth_cell_density, 5000000);

    // Valid intermediate
    assert.strictEqual(sm.setGroundTruthDensity(2500000), true);
    assert.strictEqual(sm.D1.ground_truth_cell_density, 2500000);

    // Below lower boundary
    assert.strictEqual(sm.setGroundTruthDensity(99999), false);
    assert.strictEqual(sm.D1.ground_truth_cell_density, 2500000); // Unchanged

    // Above upper boundary
    assert.strictEqual(sm.setGroundTruthDensity(5000001), false);
    assert.strictEqual(sm.D1.ground_truth_cell_density, 2500000); // Unchanged
});

await runTest('Adjusting starting confluency validates 0-100% boundary', () => {
    const { sm } = createTestLab();

    assert.strictEqual(sm.setStartingConfluency(40), true);
    assert.strictEqual(sm.D1.starting_confluency, 40);

    assert.strictEqual(sm.setStartingConfluency(100), true);
    assert.strictEqual(sm.D1.starting_confluency, 100);

    assert.strictEqual(sm.setStartingConfluency(-5), false);
    assert.strictEqual(sm.D1.starting_confluency, 100);

    assert.strictEqual(sm.setStartingConfluency(105), false);
    assert.strictEqual(sm.D1.starting_confluency, 100);
});

await runTest('Exporting session JSON produces compliant audit record string', () => {
    const { sm } = createTestLab();
    sm.D2.technique_score = 95;
    sm.D2.violation_log.push('HZ-001');

    const jsonStr = sm.exportSessionJSON();
    assert.strictEqual(typeof jsonStr, 'string');

    const parsed = JSON.parse(jsonStr);
    assert.strictEqual(parsed.session_id, sm.D2.session_id);
    assert.strictEqual(parsed.technique_score, 95);
    assert.strictEqual(parsed.violation_log[0], 'HZ-001');
});

await runTest('Tamper detection: corrupted ciphertext or wrong PIN fails AES-256 verification (UC-05 Alternate Flow)', async () => {
    const { sm } = createTestLab();
    const enc = await sm.encryptSession();

    // 1. Decryption with wrong PIN
    const wrongPinResult = await sm.decryptSession(enc, 'wrong_pin_123');
    assert.strictEqual(wrongPinResult.verified, false);
    assert.strictEqual(wrongPinResult.integrity_compromised, true);
    assert.strictEqual(wrongPinResult.error, 'Integrity Compromised / Unverified');

    // 2. Tampered ciphertext with correct PIN
    const tamperedPayload = {
        ...enc,
        ciphertext: enc.ciphertext.slice(0, -4) + (enc.ciphertext.slice(-4) === '0000' ? 'ffff' : '0000')
    };
    const tamperedResult = await sm.decryptSession(tamperedPayload, 'admin123');
    assert.strictEqual(tamperedResult.verified, false);
    assert.strictEqual(tamperedResult.integrity_compromised, true);
    assert.strictEqual(tamperedResult.error, 'Integrity Compromised / Unverified');
});

// ============================================================================
// Suite 8: Full End-to-End Walkthrough (State 0 -> Complete in a single flow)
// ============================================================================
console.log('\n--- Test Suite 8: Complete End-to-End Lifecycle Walkthrough ---');

await runTest('Scenario B.2 full penalty accumulation (intake grille blockage + perpendicular wash = -15 or -20 points)', () => {
    const { sm, bio, fsm, labObjects, ctx, labEnv } = createTestLab();
    fsm.currentState = States.CABINET_SETUP;
    assert.strictEqual(sm.D2.technique_score, 100);

    // Step 1: Intake Grille Blockage Hazard [HZ-001]
    labObjects.testObject.userData.onInteract(labObjects.testObject, ctx);
    assert.strictEqual(sm.D3.air_curtain_integrity, false);
    assert.strictEqual(sm.D2.grille_blockage_events, 1);
    assert.strictEqual(sm.D2.violation_log.includes('HZ-001'), true);
    assert.strictEqual(sm.D2.technique_score, 95); // -5 penalty

    // Remediation: Jordan moves the media bottle to the center-rear work zone
    labObjects.testObject.userData.onInteract(labObjects.testObject, ctx);
    assert.strictEqual(sm.D3.air_curtain_integrity, true);
    assert.strictEqual(labObjects.testObject.userData.nearGrille, false);

    // Complete cabinet setup prerequisites
    sm.D3.hepa_blower_active = true;
    labEnv.update(sm.D1.blower_purge_delay_sim, fsm, sm);
    sm.D3.sash_height = 20.0;
    sm.D2.sash_compliance = true;
    sm.D3.ethanol_applied = true;
    labEnv.update(sm.D1.ethanol_evaporation_time_sim, fsm, sm);
    sm.D3.apparatus_staged = true;

    // Transition to Phase 2: Inspection
    labObjects.microscope.userData.onInteract(labObjects.microscope, ctx);
    assert.strictEqual(fsm.getCurrentState(), States.INSPECTION);
    bio.setMicroscopeMagnification(10);
    bio.submitConfluency(80, fsm, labEnv);
    assert.strictEqual(fsm.getCurrentState(), States.DISSOCIATION);

    // Step 2: Vacuum Aspiration
    labObjects.vacuum.userData.onInteract(labObjects.vacuum, ctx);
    assert.strictEqual(sm.D3.medium_aspirated, true);

    // Step 3: Perpendicular Wash Angle Infraction [FR-012]
    // User positions pipette vertically (90° perpendicular) over cell monolayer
    labObjects.pbsBottle.userData.dispenseAngle = 90.0;
    labObjects.pbsBottle.userData.onInteract(labObjects.pbsBottle, ctx);

    assert.strictEqual(sm.D2.sidewall_violations, 1);
    assert.strictEqual(sm.D2.violation_log.includes('SIDEWALL_SHEAR'), true);

    // Remediation: Jordan tilts the culture flask at a 45-degree angle
    labObjects.pbsBottle.userData.dispenseAngle = 45.0;

    // Step 4: Verification of full penalty accumulation (-15 or -20 points)
    const totalPenalty = 100 - sm.D2.technique_score;
    assert.ok(
        totalPenalty === 15 || totalPenalty === 20,
        `Expected accumulated penalty of 15 or 20 points, got ${totalPenalty} (technique score: ${sm.D2.technique_score})`
    );
    assert.ok(sm.D2.technique_score === 85 || sm.D2.technique_score === 80);

    // Itemized session log verification
    assert.strictEqual(sm.D2.grille_blockage_events, 1);
    assert.strictEqual(sm.D2.sidewall_violations, 1);
    assert.strictEqual(sm.D2.violation_log.includes('HZ-001'), true);
    assert.strictEqual(sm.D2.violation_log.includes('SIDEWALL_SHEAR'), true);
});

await runTest('Executes complete golden-path passaging protocol from Anteroom to Incubator & Audit', async () => {
    const { sm, bio, fsm, labObjects, ctx, labEnv } = createTestLab();

    // --- State 0: Anteroom ---
    assert.strictEqual(fsm.getCurrentState(), States.ANTEROOM);
    // Equip PPE
    labObjects.locker.userData.onInteract(labObjects.locker, ctx);
    labObjects.locker.userData.onInteract(labObjects.locker, ctx);
    labObjects.locker.userData.onInteract(labObjects.locker, ctx);
    assert.strictEqual(sm.isPPEComplete(), true);
    // Open door
    labObjects.door.userData.onInteract(labObjects.door, ctx);
    assert.strictEqual(fsm.getCurrentState(), States.CABINET_SETUP);

    // --- State 1: Cabinet Setup ---
    labObjects.blowerSwitch.userData.onInteract(labObjects.blowerSwitch, ctx);
    labEnv.update(5.0, fsm, sm);
    labObjects.sashInteract.userData.onInteract(labObjects.sashInteract, ctx);
    labObjects.ethanolBottle.userData.onInteract(labObjects.ethanolBottle, ctx);
    labEnv.update(5.0, fsm, sm);
    labObjects.supplyShelf.userData.onInteract(labObjects.supplyShelf, ctx);

    // Verify readiness for State 2
    assert.strictEqual(fsm.canTransition(States.INSPECTION).allowed, true);

    // --- State 2: Microscopic Inspection ---
    labObjects.microscope.userData.onInteract(labObjects.microscope, ctx);
    assert.strictEqual(fsm.getCurrentState(), States.INSPECTION);
    bio.setMicroscopeMagnification(10);
    bio.submitConfluency(80, fsm, labEnv);
    assert.strictEqual(fsm.getCurrentState(), States.DISSOCIATION);

    // --- State 3: Enzymatic Dissociation ---
    labObjects.vacuum.userData.onInteract(labObjects.vacuum, ctx);
    labObjects.pbsBottle.userData.onInteract(labObjects.pbsBottle, ctx);
    labObjects.trypsinBottle.userData.onInteract(labObjects.trypsinBottle, ctx);
    // Incubation for 3.5 minutes (210s)
    bio.update(210, fsm);
    // Tap to detach
    bio.registerTap(fsm);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Suspension');
    // Quench with 7.5 mL DMEM
    labObjects.dmemBottle.userData.onInteract(labObjects.dmemBottle, ctx);
    assert.strictEqual(sm.D3.trypsin_activity_state, 'Neutralized');

    // --- State 4: Viability Staining & Quantification ---
    labObjects.trypanGroup.userData.onInteract(labObjects.trypanGroup, ctx);
    assert.strictEqual(fsm.getCurrentState(), States.QUANTIFICATION);
    labObjects.hemoGroup.userData.onInteract(labObjects.hemoGroup, ctx);
    // Count cells in 4 quadrants
    const cells = bio.getGroundTruthCells();
    for (let q = 0; q < 4; q++) {
        bio.setActiveQuadrant(q);
        for (const c of cells) {
            if (c.quadrant === q && !c.clicked) {
                bio.handleHemocytometerClick(c.x * 600, c.y * 600, 600, 600);
            }
        }
    }
    bio.finishCounting(fsm);
    assert.strictEqual(sm.D2.calculated_density > 0, true);

    // Transition to State 5
    labObjects.destFlask.userData.onInteract(labObjects.destFlask, ctx);
    assert.strictEqual(fsm.getCurrentState(), States.INOCULATION);

    // --- State 5: Inoculation & Storage ---
    const C1 = sm.D2.calculated_density;
    const V1 = (sm.D1.target_seeding_density * sm.D1.destination_volume) / C1;
    bio.submitInoculationVolume(V1, fsm);
    bio.submitVesselLabel('SR', fsm, sm);
    labObjects.capToggle.userData.onInteract(labObjects.capToggle, ctx);
    labObjects.incubator.userData.onInteract(labObjects.incubator, ctx);

    // --- State 6: Complete & Persistence ---
    assert.strictEqual(fsm.getCurrentState(), States.COMPLETE);
    const encSession = await sm.generateEncryptedSession();
    assert.strictEqual(encSession.algorithm, 'AES-256-GCM');
    assert.strictEqual(sm.D2.technique_score, 100);
    assert.strictEqual(sm.D2.violation_log.length, 0);

    const auditVerification = await sm.decryptSession(encSession, 'admin123');
    assert.strictEqual(auditVerification.verified, true);
    assert.strictEqual(auditVerification.data.technique_score, 100);
});

console.log(`\n================================================================`);
console.log(`🎉 SUCCESS: All ${passedCount} / ${totalCount} End-to-End Integration Tests PASSED!`);
console.log(`================================================================\n`);
