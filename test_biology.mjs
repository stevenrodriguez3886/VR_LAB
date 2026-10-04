// test_biology.mjs — Comprehensive automated tests for BiologyEngine
import assert from 'node:assert';
import { SessionManager } from './sessionManager.js';
import { BiologyEngine } from './biologyEngine.js';
import { LabStateMachine, States } from './stateMachine.js';

console.log('🧪 Starting BiologyEngine Automated Test Suite...\n');

let passedTests = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(err);
        process.exit(1);
    }
}

// -------------------------------------------------------------
// Test Group 1: Trypsin Kinetics, Adhesion States & Overexposure
// -------------------------------------------------------------
console.log('--- Test Group 1: Trypsin Incubation & Kinetics (Process 3.4) ---');

test('Trypsin timer starts and stops properly', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);

    assert.strictEqual(bio.isTrypsinTimerActive(), false);
    assert.strictEqual(sm.D3.trypsin_timer_running, false);

    bio.startTrypsinTimer();
    assert.strictEqual(bio.isTrypsinTimerActive(), true);
    assert.strictEqual(sm.D3.trypsin_timer_running, true);

    bio.stopTrypsinTimer();
    assert.strictEqual(bio.isTrypsinTimerActive(), false);
    assert.strictEqual(sm.D3.trypsin_timer_running, false);
});

test('Cells transition from Adherent to Rounding within nominal 3.0 to 5.0 minute window', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);

    sm.D3.trypsin_activity_state = 'Active';
    bio.startTrypsinTimer();

    // Advance by 120 seconds (2.0 minutes) -> still Adherent
    bio.update(120, stateMachine);
    assert.strictEqual(sm.D3.trypsin_timer_elapsed, 120);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Adherent');

    // Advance by another 60 seconds (total 180s = 3.0 minutes) -> Rounding
    bio.update(60, stateMachine);
    assert.strictEqual(sm.D3.trypsin_timer_elapsed, 180);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Rounding');

    // Advance to 270s (4.5 minutes) -> still Rounding
    bio.update(90, stateMachine);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Rounding');
});

test('Mechanical tap gesture before 3 minutes alerts user and remains Adherent', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);
    stateMachine.currentState = States.DISSOCIATION;

    sm.D3.trypsin_activity_state = 'Active';
    sm.D3.trypsin_timer_elapsed = 90; // 1.5 minutes

    bio.registerTap(stateMachine);
    assert.strictEqual(sm.D2.mechanical_tap_detected, false);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Adherent');
});

test('Mechanical tap gesture at 3.5 minutes detaches cells to Suspension [FR-014]', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);
    stateMachine.currentState = States.DISSOCIATION;

    sm.D3.trypsin_activity_state = 'Active';
    sm.D3.trypsin_timer_elapsed = 210; // 3.5 minutes

    bio.registerTap(stateMachine);
    assert.strictEqual(sm.D2.mechanical_tap_detected, true);
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Suspension');
});

test('Enzymatic overexposure >= 8.0 min triggers HZ-003, 65% lysis penalty, and Lysed state', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);

    sm.D3.trypsin_activity_state = 'Active';
    bio.startTrypsinTimer();

    const initialLive = sm.D1.ground_truth_live_cells; // 180
    const initialDead = sm.D1.ground_truth_dead_cells; // 10
    const initialScore = sm.D2.technique_score;        // 100

    // Advance past 8 minutes (480 seconds)
    bio.update(485, stateMachine);

    assert.strictEqual(sm.D2.overexposure_flag, true);
    assert.ok(sm.D2.violation_log.includes('HZ-003'), 'Violation log should contain HZ-003');
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Lysed');
    assert.strictEqual(bio.isTrypsinTimerActive(), false);
    assert.strictEqual(sm.D2.technique_score, initialScore - 30);

    // Verify 65% viability penalty on cells
    const expectedDied = Math.round(initialLive * 0.65); // 117
    assert.strictEqual(sm.D1.ground_truth_live_cells, initialLive - expectedDied); // 63
    assert.strictEqual(sm.D1.ground_truth_dead_cells, initialDead + expectedDied); // 127
});

test('Mechanical tap does NOT overwrite Lysed state [HZ-003 guard]', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);
    stateMachine.currentState = States.DISSOCIATION;

    sm.D3.trypsin_activity_state = 'Active';
    sm.D3.cell_adhesion_state = 'Lysed';
    sm.D3.trypsin_timer_elapsed = 240; // 4.0 minutes

    bio.registerTap(stateMachine);

    // Must remain Lysed and not reset to Suspension
    assert.strictEqual(sm.D3.cell_adhesion_state, 'Lysed');
    assert.strictEqual(sm.D2.mechanical_tap_detected, false);
});

// -------------------------------------------------------------
// Test Group 2: Phase-Contrast Microscope & Confluency Verification
// -------------------------------------------------------------
console.log('\n--- Test Group 2: Phase-Contrast Microscope & Confluency (Process 2.0) ---');

test('Microscope magnification selection and 10x inspection flag [FR-007–008]', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);

    assert.strictEqual(sm.D3.microscope_inspected, false);
    assert.strictEqual(bio.getMagnification(), 4);

    bio.setMicroscopeMagnification(40);
    assert.strictEqual(bio.getMagnification(), 40);
    assert.strictEqual(sm.D3.microscope_inspected, false);

    bio.setMicroscopeMagnification(10);
    assert.strictEqual(bio.getMagnification(), 10);
    assert.strictEqual(sm.D3.microscope_inspected, true);
    assert.strictEqual(sm.D3.microscope_magnification, 10);
});

test('Microscope view does NOT leak Confluency GT on canvas', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);

    const filledTexts = [];
    const mockCtx = {
        fillStyle: '',
        fillRect: () => {},
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        arc: () => {},
        clip: () => {},
        fill: () => {},
        stroke: () => {},
        strokeStyle: '',
        lineWidth: 1,
        moveTo: () => {},
        lineTo: () => {},
        font: '',
        fillText: (txt) => { filledTexts.push(txt); }
    };
    const mockCanvas = {
        width: 600,
        height: 400,
        getContext: () => mockCtx
    };

    globalThis.document = {
        getElementById: (id) => (id === 'microscope-canvas' ? mockCanvas : null)
    };

    try {
        bio.setMicroscopeMagnification(10);
        // Verify 10x was rendered
        assert.ok(filledTexts.includes('10x'), 'Should display magnification 10x');
        // Verify NO ground truth leak
        const leak = filledTexts.some(t => t.includes('Confluency GT'));
        assert.strictEqual(leak, false, 'Canvas overlay must NOT display ground truth confluency');
    } finally {
        delete globalThis.document;
    }
});

test('Confluency assessment >= 70% transitions state from INSPECTION to DISSOCIATION [FR-009]', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);

    stateMachine.currentState = States.INSPECTION;
    sm.D3.microscope_inspected = true;
    sm.D1.starting_confluency = 80;

    bio.submitConfluency(85, stateMachine, null);

    assert.strictEqual(sm.D2.assessed_confluence_val, 85);
    assert.strictEqual(sm.D2.confluence_delta, 5);
    assert.strictEqual(sm.D2.violation_log.length, 0);
    assert.strictEqual(stateMachine.getCurrentState(), States.DISSOCIATION, 'Should transition to DISSOCIATION');
});

test('Confluency assessment < 70% with override applies -15 penalty, logs CONFLUENCY_OVERRIDE, and transitions to DISSOCIATION [FR-010]', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);

    stateMachine.currentState = States.INSPECTION;
    sm.D3.microscope_inspected = true;

    let confirmCb = null;
    sm.showConfirmModal = (title, msg, onConfirm, onCancel) => {
        confirmCb = onConfirm;
    };

    bio.submitConfluency(50, stateMachine, null);
    assert.strictEqual(sm.D2.assessed_confluence_val, 50);
    assert.ok(typeof confirmCb === 'function', 'Confirm callback must be provided');
    assert.strictEqual(stateMachine.getCurrentState(), States.INSPECTION, 'Should not transition before confirm');

    // Simulate clicking "Confirm / Override"
    confirmCb();
    assert.ok(sm.D2.violation_log.includes('CONFLUENCY_OVERRIDE'));
    assert.strictEqual(sm.D2.technique_score, 85); // 100 - 15
    assert.strictEqual(stateMachine.getCurrentState(), States.DISSOCIATION, 'Should transition to DISSOCIATION upon override');
});

// -------------------------------------------------------------
// Test Group 3: Hemocytometer, Counting & Appendix C Formulas
// -------------------------------------------------------------
console.log('\n--- Test Group 3: Hemocytometer & Appendix C Formulas (Process 4.0) ---');

test('Ground truth cells generated and partitioned across 4 quadrants', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);

    const cells = bio.getGroundTruthCells();
    const totalExpected = sm.D1.ground_truth_live_cells + sm.D1.ground_truth_dead_cells; // 180 + 10 = 190
    assert.strictEqual(cells.length, totalExpected);

    // Verify cell counts per quadrant
    for (let q = 0; q < 4; q++) {
        const quadCells = cells.filter(c => c.quadrant === q);
        assert.ok(quadCells.length > 0, `Quadrant ${q} must contain cells`);
    }

    const viableCells = cells.filter(c => c.type === 'viable');
    const nonviableCells = cells.filter(c => c.type === 'nonviable');
    assert.strictEqual(viableCells.length, 180);
    assert.strictEqual(nonviableCells.length, 10);
});

test('Raycasting click within active quadrant increments live/dead tallies [FR-019]', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);

    bio.setActiveQuadrant(0);
    const cells = bio.getGroundTruthCells();
    const targetCell = cells.find(c => c.quadrant === 0 && c.type === 'viable');
    assert.ok(targetCell, 'Target cell must exist');

    // Click exactly on the cell coordinates (scaled to 600x600 canvas)
    bio.handleHemocytometerClick(targetCell.x * 600, targetCell.y * 600, 600, 600);

    assert.strictEqual(targetCell.clicked, true);
    assert.strictEqual(sm.D2.live_cells_counted, 1);
    assert.strictEqual(bio.getQuadrantsCounted()[0], true);
});

test('Appendix C.1.1 & C.1.2 calculation verification in finishCounting()', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);

    // Set exact counts: 180 viable cells, 10 non-viable cells
    sm.D2.live_cells_counted = 180;
    sm.D2.dead_cells_counted = 10;
    sm.D1.hemocytometer_factor = 10000;
    sm.D1.ground_truth_cell_density = 1000000; // 1.0 × 10^6

    bio.finishCounting(stateMachine);

    // C.1.1: Viable Concentration = (180 / 4) * 2.0 * 10,000 = 45 * 20,000 = 900,000 cells/mL (9.0 × 10^5)
    assert.strictEqual(sm.D2.calculated_density, 900000);

    // C.1.2: Viability % = (180 / (180 + 10)) * 100 = (180 / 190) * 100 = 94.7368...%
    const expectedViability = (180 / 190) * 100.0;
    assert.ok(Math.abs(sm.D2.calculated_viability_pct - expectedViability) < 0.001);

    // C.1: Density variance % = |900,000 - 1,000,000| / 1,000,000 * 100 = 10.0%
    assert.strictEqual(sm.D2.density_variance_pct, 10.0);
});

// -------------------------------------------------------------
// Test Group 4: Inoculation Volume C1V1 = C2V2 Calculations
// -------------------------------------------------------------
console.log('\n--- Test Group 4: Secondary Inoculation C1V1 = C2V2 (Process 5.0) ---');

test('Accurate inoculum volume calculation (delta < 0.1 mL) without penalty [FR-021, C.1.3]', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);

    sm.D2.calculated_density = 1000000; // C1 = 1.0 × 10^6 cells/mL
    sm.D1.target_seeding_density = 100000; // C2 = 1.0 × 10^5 cells/mL
    sm.D1.destination_volume = 10.0; // V2 = 10.0 mL
    // Correct V1 = (1.0e5 * 10.0) / 1.0e6 = 1.0 mL

    bio.submitInoculationVolume(1.02, stateMachine); // delta = 0.02 < 0.1 mL

    assert.strictEqual(sm.D3.inoculation_volume_set, true);
    assert.ok(Math.abs(sm.D2.seed_calc_delta - 0.02) < 0.001);
    assert.strictEqual(sm.D2.technique_score, 100); // No deduction
});

test('Inaccurate inoculum volume calculation (delta >= 0.1 mL) deducts 10 points', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);

    sm.D2.calculated_density = 1000000; // C1 = 1.0 × 10^6
    sm.D1.target_seeding_density = 100000; // C2 = 1.0 × 10^5
    sm.D1.destination_volume = 10.0; // V2 = 10.0
    // Correct V1 = 1.0 mL

    bio.submitInoculationVolume(1.5, stateMachine); // delta = 0.5 >= 0.1 mL

    assert.strictEqual(sm.D3.inoculation_volume_set, true);
    assert.strictEqual(sm.D2.seed_calc_delta, 0.5);
    assert.strictEqual(sm.D2.technique_score, 90); // 100 - 10 points
});

// -------------------------------------------------------------
// Test Group 5: Vessel Labeling
// -------------------------------------------------------------
console.log('\n--- Test Group 5: Vessel Labeling (Process 5.0, [FR-022]) ---');

test('Vessel label attaches metadata with proper format CHO-K1_P+1_[Date]_[Initials]', () => {
    const sm = new SessionManager();
    const bio = new BiologyEngine(sm);
    const stateMachine = new LabStateMachine(sm, bio);

    const today = new Date().toISOString().split('T')[0];
    bio.submitVesselLabel('sr', stateMachine, sm);

    assert.strictEqual(sm.D3.vessel_labeled, true);
    assert.strictEqual(sm.D2.vessel_label_record, `CHO-K1_P+1_${today}_SR`);
});

console.log(`\n🎉 All ${passedTests} automated tests PASSED successfully!`);
