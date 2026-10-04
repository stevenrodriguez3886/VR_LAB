// biologyEngine.js — Biology simulation: timers, cell state, microscope, hemocytometer, formulas
import { States } from './stateMachine.js';

export class BiologyEngine {
    constructor(sessionManager) {
        this.sm = sessionManager;
        this.sessionManager = sessionManager;
        this._trypsinTimerActive = false;
        this._currentMagnification = 4;
        this._activeQuadrant = 0;
        this._quadrantsCounted = [false, false, false, false];
        this._liveCounts = [0, 0, 0, 0];
        this._deadCounts = [0, 0, 0, 0];
        this._groundTruthCells = [];
        this._generateGroundTruthCells();
    }

    // ——— Getters for testing and inspection ———
    isTrypsinTimerActive() { return this._trypsinTimerActive; }
    getActiveQuadrant() { return this._activeQuadrant; }
    getQuadrantsCounted() { return [...this._quadrantsCounted]; }
    getLiveCounts() { return [...this._liveCounts]; }
    getDeadCounts() { return [...this._deadCounts]; }
    getGroundTruthCells() { return this._groundTruthCells; }
    getMagnification() { return this._currentMagnification; }

    // ——— Trypsin Incubation & Kinetics (Process 3.4) ———
    startTrypsinTimer() {
        this._trypsinTimerActive = true;
        if (this.sm && this.sm.D3) {
            this.sm.D3.trypsin_timer_running = true;
        }
    }

    stopTrypsinTimer() {
        this._trypsinTimerActive = false;
        if (this.sm && this.sm.D3) {
            this.sm.D3.trypsin_timer_running = false;
        }
    }

    update(delta, stateMachine) {
        if (!this._trypsinTimerActive) return;
        const D3 = this.sm.D3;
        const D1 = this.sm.D1;

        D3.trypsin_timer_elapsed += delta;
        const elapsedMinutes = D3.trypsin_timer_elapsed / 60.0;
        this.sm.showTimer('Trypsin Exposure', D3.trypsin_timer_elapsed);

        // 3.0 to 5.0 minutes nominal window: cells transition from Adherent to Rounding
        if (elapsedMinutes >= D1.trypsin_incubation_nominal[0] &&
            elapsedMinutes < D1.trypsin_incubation_nominal[1] &&
            D3.cell_adhesion_state === 'Adherent') {
            D3.cell_adhesion_state = 'Rounding';
        }

        // >= 8.0 minutes unquenched [HZ-003]: severe enzymatic overexposure
        if (elapsedMinutes >= D1.trypsin_overexposure_limit &&
            D3.trypsin_activity_state === 'Active') {
            this.sm.logOverexposure();
            this._applyOverexposurePenalty();
            D3.cell_adhesion_state = 'Lysed';
            this.stopTrypsinTimer();
        }
    }

    _applyOverexposurePenalty() {
        const D1 = this.sm.D1;
        const penalty = D1.overexposure_viability_penalty; // 0.65 (65% cell lysis)
        const liveOrig = D1.ground_truth_live_cells;
        const newDead = Math.round(liveOrig * penalty);
        D1.ground_truth_live_cells = Math.max(0, liveOrig - newDead);
        D1.ground_truth_dead_cells += newDead;
        if (D1.ground_truth_cell_density) {
            D1.ground_truth_cell_density = Math.round(D1.ground_truth_cell_density * (1.0 - penalty));
        }
        this._generateGroundTruthCells();
    }

    // ——— Mechanical Tap Gesture Detection [FR-014] ———
    registerTap(stateMachine) {
        if (stateMachine && typeof stateMachine.getCurrentState === 'function') {
            if (stateMachine.getCurrentState() !== States.DISSOCIATION) return;
        }
        const D3 = this.sm.D3;
        const D1 = this.sm.D1;
        if (D3.trypsin_activity_state !== 'Active') return;

        // Prevent tap from overwriting Lysed state [HZ-003]
        if (D3.cell_adhesion_state === 'Lysed') {
            this.sm.showWarning('Enzymatic overexposure has lysed the culture. Mechanical agitation cannot restore viability.', true);
            setTimeout(() => this.sm.clearWarning(), 3000);
            return;
        }

        const elapsedMinutes = D3.trypsin_timer_elapsed / 60.0;

        if (elapsedMinutes >= D1.trypsin_incubation_nominal[0] &&
            elapsedMinutes <= D1.trypsin_incubation_nominal[1]) {
            // Nominal detachment window: 3.0 to 5.0 min
            D3.cell_adhesion_state = 'Suspension';
            this.sm.D2.mechanical_tap_detected = true;
            this.sm.showWarning('Cells detached — in suspension ✓');
            setTimeout(() => this.sm.clearWarning(), 3000);
        } else if (elapsedMinutes < D1.trypsin_incubation_nominal[0]) {
            // Premature tap (< 3.0 min)
            this.sm.showWarning('Too early — trypsin needs at least 3 minutes.');
            setTimeout(() => this.sm.clearWarning(), 3000);
        } else if (elapsedMinutes > D1.trypsin_incubation_nominal[1]) {
            // Over 5 min but under 8 min overexposure: detach with warning
            D3.cell_adhesion_state = 'Suspension';
            this.sm.D2.mechanical_tap_detected = true;
            this.sm.showWarning('Cells detached — in suspension ✓ (Warning: nominal 5-min window exceeded)');
            setTimeout(() => this.sm.clearWarning(), 3000);
        }
    }

    // ——— Phase-Contrast Microscope [FR-007–010] ———
    setMicroscopeMagnification(mag) {
        this._currentMagnification = mag;
        if (this.sm && this.sm.D3) {
            this.sm.D3.microscope_magnification = mag;
            if (mag === 10) {
                this.sm.D3.microscope_inspected = true;
            }
        }
        this.renderMicroscopeView();
    }

    renderMicroscopeView() {
        const mag = this._currentMagnification;
        if (mag === 10 && this.sm && this.sm.D3) {
            this.sm.D3.microscope_inspected = true;
            this.sm.D3.microscope_magnification = 10;
        }

        if (typeof document === 'undefined') return;
        const canvas = document.getElementById('microscope-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width, h = canvas.height;
        const confluency = this.sm.D1.starting_confluency;

        // Dark background outside circular aperture
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        // Circular aperture clipping
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 10, 0, Math.PI * 2);
        ctx.clip();

        // Field background illumination
        ctx.fillStyle = '#e8e8e0';
        ctx.fillRect(0, 0, w, h);

        const cellSize = mag === 4 ? 3 : mag === 10 ? 6 : 14;
        const cellCount = Math.round(confluency * (mag === 4 ? 8 : mag === 10 ? 5 : 2));

        let seed = 42;
        function seededRandom() {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        }

        // Draw adherent CHO cells with phase-contrast halos and nucleus detail
        for (let i = 0; i < cellCount; i++) {
            const cx = 30 + seededRandom() * (w - 60);
            const cy = 30 + seededRandom() * (h - 60);
            const r = cellSize * (0.6 + seededRandom() * 0.8);

            // Cell cytoplasm
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 200, 190, ${0.6 + seededRandom() * 0.3})`;
            ctx.fill();

            // Phase halo border
            ctx.strokeStyle = `rgba(80, 80, 70, ${0.5 + seededRandom() * 0.4})`;
            ctx.lineWidth = mag === 40 ? 2 : 1;
            ctx.stroke();

            // Nucleus detail visible at 10x and 40x
            if (mag >= 10) {
                ctx.beginPath();
                ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(100, 100, 90, ${0.3 + seededRandom() * 0.2})`;
                ctx.fill();
            }
        }

        // Optical crosshairs
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
        ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
        ctx.stroke();

        ctx.restore();

        // Aperture frame border
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 4;
        ctx.stroke();

        // HUD overlay in viewport
        ctx.fillStyle = '#4fc3f7';
        ctx.font = '14px monospace';
        ctx.fillText(`${mag}x`, 20, h - 20);
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

        if (typeof document !== 'undefined') {
            const mModal = document.getElementById('microscope-modal');
            if (mModal) mModal.classList.add('hidden');
        }

        // FR-010: If < 70%, instructional confirmation hold dialog offering override or re-incubation
        if (value < this.sm.D1.confluency_threshold) {
            this.sm.showConfirmModal(
                'Confluency Below Threshold',
                `Your assessment of ${value}% is below the 70% threshold required for trypsinization. ` +
                `Re-incubation is recommended. Do you wish to override and proceed anyway?`,
                () => {
                    // Override selected: apply -15 penalty and log CONFLUENCY_OVERRIDE
                    this.sm.D3.microscope_inspected = true;
                    if (!this.sm.D2.violation_log.includes('CONFLUENCY_OVERRIDE')) {
                        this.sm.D2.violation_log.push('CONFLUENCY_OVERRIDE');
                    }
                    this.sm.D2.technique_score = Math.max(0, this.sm.D2.technique_score - 15);
                    this.sm.showCalcModal(
                        'Assessment Recorded',
                        `<p>Confluency assessment: <strong>${value}%</strong></p>` +
                        `<p>Ground truth: <strong>${groundTruth}%</strong></p>` +
                        `<p>Variance: <strong>${Math.abs(value - groundTruth)}%</strong></p>` +
                        `<p style="color:#f44336">⚠ Override penalty applied (-15 points)</p>`
                    );
                    if (stateMachine && typeof stateMachine.transition === 'function') {
                        stateMachine.transition(States.DISSOCIATION);
                    }
                },
                () => {
                    // Re-incubation chosen: notify user
                    this.sm.showCalcModal(
                        'Re-incubation Required',
                        `<p>Culture confluency (${value}%) is insufficient for passaging.</p>` +
                        `<p>For this prototype, you may re-inspect and enter ≥ 70%.</p>`
                    );
                }
            );
        } else {
            this.sm.showCalcModal(
                'Assessment Recorded',
                `<p>Confluency assessment: <strong>${value}%</strong></p>` +
                `<p>Ground truth: <strong>${groundTruth}%</strong></p>` +
                `<p>Variance: <strong>${Math.abs(value - groundTruth)}%</strong></p>` +
                (Math.abs(value - groundTruth) === 0 ?
                    `<p style="color:#4caf50">✓ Perfect assessment</p>` :
                    `<p>Proceed to enzymatic dissociation.</p>`)
            );
            if (stateMachine && typeof stateMachine.transition === 'function') {
                stateMachine.transition(States.DISSOCIATION);
            }
        }
    }

    // ——— Hemocytometer & Trypan Blue Viability (Process 4.0, [FR-018–020], Appendix C) ———
    _generateGroundTruthCells() {
        this._groundTruthCells = [];
        const D1 = this.sm.D1;
        const totalLive = D1.ground_truth_live_cells;
        const totalDead = D1.ground_truth_dead_cells;

        // 4 corner quadrants of the 3x3 Neubauer grid
        const quadRanges = [
            { x: [0.05, 0.30], y: [0.05, 0.30] }, // TL (0)
            { x: [0.70, 0.95], y: [0.05, 0.30] }, // TR (1)
            { x: [0.05, 0.30], y: [0.70, 0.95] }, // BL (2)
            { x: [0.70, 0.95], y: [0.70, 0.95] }, // BR (3)
        ];

        let seed = 12345;
        function seededRandom() {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        }

        for (let q = 0; q < 4; q++) {
            const qLive = Math.floor(totalLive / 4) + (q < (totalLive % 4) ? 1 : 0);
            const qDead = Math.floor(totalDead / 4) + (q < (totalDead % 4) ? 1 : 0);
            const range = quadRanges[q];

            // Viable cells (clear circular halos)
            for (let i = 0; i < qLive; i++) {
                this._groundTruthCells.push({
                    x: range.x[0] + seededRandom() * (range.x[1] - range.x[0]),
                    y: range.y[0] + seededRandom() * (range.y[1] - range.y[0]),
                    type: 'viable',
                    quadrant: q,
                    clicked: false,
                    radius: 0.008 + seededRandom() * 0.006,
                });
            }

            // Non-viable cells (dark blue dye uptake)
            for (let i = 0; i < qDead; i++) {
                this._groundTruthCells.push({
                    x: range.x[0] + seededRandom() * (range.x[1] - range.x[0]),
                    y: range.y[0] + seededRandom() * (range.y[1] - range.y[0]),
                    type: 'nonviable',
                    quadrant: q,
                    clicked: false,
                    radius: 0.008 + seededRandom() * 0.005,
                });
            }
        }
    }

    setActiveQuadrant(q) {
        this._activeQuadrant = q;
        this.renderHemocytometerGrid();
    }

    renderHemocytometerGrid() {
        if (typeof document === 'undefined') return;
        const canvas = document.getElementById('hemocytometer-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width, h = canvas.height;

        // Slide glass surface background
        ctx.fillStyle = '#f5f5ee';
        ctx.fillRect(0, 0, w, h);

        // 3x3 main Neubauer grid lines
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        for (let i = 1; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo((w * i) / 3, 0); ctx.lineTo((w * i) / 3, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, (h * i) / 3); ctx.lineTo(w, (h * i) / 3); ctx.stroke();
        }

        // Highlight 4 corner quadrants with 4x4 sub-grids (16 tertiary squares)
        const quadPositions = [
            { x: 0, y: 0 },
            { x: (w * 2) / 3, y: 0 },
            { x: 0, y: (h * 2) / 3 },
            { x: (w * 2) / 3, y: (h * 2) / 3 },
        ];

        quadPositions.forEach((pos, i) => {
            ctx.fillStyle = i === this._activeQuadrant ? 'rgba(255,152,0,0.15)' : 'rgba(79,195,247,0.08)';
            ctx.fillRect(pos.x, pos.y, w / 3, h / 3);
            ctx.strokeStyle = '#aaa';
            ctx.lineWidth = 0.5;
            for (let j = 1; j < 4; j++) {
                ctx.beginPath();
                ctx.moveTo(pos.x + ((w / 3) * j) / 4, pos.y);
                ctx.lineTo(pos.x + ((w / 3) * j) / 4, pos.y + h / 3);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y + ((h / 3) * j) / 4);
                ctx.lineTo(pos.x + w / 3, pos.y + ((h / 3) * j) / 4);
                ctx.stroke();
            }
        });

        // Render cells
        for (const cell of this._groundTruthCells) {
            const cx = cell.x * w;
            const cy = cell.y * h;
            const r = cell.radius * w;

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);

            if (cell.type === 'viable') {
                // Viable cells: clear refractive halo, turns green ring when counted
                ctx.fillStyle = cell.clicked ? 'rgba(76,175,80,0.3)' : 'rgba(255,255,240,0.8)';
                ctx.fill();
                ctx.strokeStyle = cell.clicked ? '#4caf50' : 'rgba(120,120,100,0.6)';
                ctx.lineWidth = cell.clicked ? 2 : 1;
                ctx.stroke();
            } else {
                // Non-viable cells: solid dark blue Trypan Blue marker
                ctx.fillStyle = cell.clicked ? 'rgba(21,101,192,0.9)' : 'rgba(30,60,150,0.8)';
                ctx.fill();
                ctx.strokeStyle = cell.clicked ? '#0d47a1' : '#1a237e';
                ctx.lineWidth = cell.clicked ? 2 : 1;
                ctx.stroke();
            }
        }

        // Update HUD counter displays
        const liveEl = document.getElementById('live-count');
        if (liveEl) liveEl.textContent = this.sm.D2.live_cells_counted;

        const deadEl = document.getElementById('dead-count');
        if (deadEl) deadEl.textContent = this.sm.D2.dead_cells_counted;

        const doneCount = this._quadrantsCounted.filter(q => q).length;
        const quadDoneEl = document.getElementById('quadrants-done');
        if (quadDoneEl) quadDoneEl.textContent = doneCount;

        const finishBtn = document.getElementById('hemo-finish');
        if (finishBtn) {
            if (doneCount >= 4) finishBtn.classList.remove('hidden');
            else finishBtn.classList.add('hidden');
        }
    }

    handleHemocytometerClick(canvasX, canvasY, canvasW, canvasH) {
        const normX = canvasX / canvasW;
        const normY = canvasY / canvasH;

        let bestDist = Infinity;
        let bestCell = null;

        for (const cell of this._groundTruthCells) {
            if (cell.quadrant !== this._activeQuadrant || cell.clicked) continue;
            const dx = cell.x - normX;
            const dy = cell.y - normY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist && dist < 0.035) {
                bestDist = dist;
                bestCell = cell;
            }
        }

        if (bestCell) {
            bestCell.clicked = true;
            if (bestCell.type === 'viable') {
                this._liveCounts[this._activeQuadrant]++;
                this.sm.D2.live_cells_counted++;
            } else {
                this._deadCounts[this._activeQuadrant]++;
                this.sm.D2.dead_cells_counted++;
            }
            this._quadrantsCounted[this._activeQuadrant] = true;
            this.renderHemocytometerGrid();
        }
    }

    finishCounting(stateMachine) {
        const D1 = this.sm.D1;
        const D2 = this.sm.D2;
        const totalLive = D2.live_cells_counted;
        const totalDead = D2.dead_cells_counted;
        const totalCells = totalLive + totalDead;

        // Appendix C.1.1: Viable Concentration (cells/mL)
        // (totalLive / 4) * dilutionFactor (2.0) * hemocytometer_factor (10^4)
        const meanPerSquare = totalLive / 4.0;
        const dilutionFactor = 2.0;
        const calculatedDensity = meanPerSquare * dilutionFactor * D1.hemocytometer_factor;

        // Appendix C.1.2: Viability Percentage (%)
        // (totalLive / (totalLive + totalDead)) * 100
        const calculatedViability = totalCells > 0 ? (totalLive / totalCells) * 100.0 : 0.0;

        // Appendix C.1: Density Variance (%)
        const densityVariance = D1.ground_truth_cell_density > 0 ?
            (Math.abs(calculatedDensity - D1.ground_truth_cell_density) / D1.ground_truth_cell_density) * 100.0 : 0.0;

        // Commit calculation metrics to D2
        D2.calculated_density = calculatedDensity;
        D2.calculated_viability_pct = calculatedViability;
        D2.density_variance_pct = densityVariance;
        D2.trypsin_time_elapsed = this.sm.D3.trypsin_timer_elapsed / 60.0;

        if (typeof document !== 'undefined') {
            const hModal = document.getElementById('hemocytometer-modal');
            if (hModal) hModal.classList.add('hidden');
        }

        // Acceptance threshold status [Appendix C.1.2]
        const viabilityStatus = calculatedViability >= 90.0 ? '✓ Optimal (Pass)' :
                                calculatedViability >= 70.0 ? '⚠ Marginal (Warning)' : '✗ Failed (Abort)';
        const viabilityColor = calculatedViability >= 90.0 ? '#4caf50' :
                               calculatedViability >= 70.0 ? '#ff9800' : '#f44336';

        this.sm.showCalcModal(
            'Cell Count & Viability Results',
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
    }

    // ——— Secondary Inoculation & Dilution Calculations (Process 5.0, [FR-021], Appendix C.1.3) ———
    submitInoculationVolume(v1, stateMachine) {
        if (isNaN(v1) || v1 <= 0) {
            this.sm.showWarning('Please enter a valid inoculum volume (mL).');
            setTimeout(() => this.sm.clearWarning(), 3000);
            return;
        }

        const D1 = this.sm.D1;
        const D2 = this.sm.D2;
        const C1 = D2.calculated_density || D1.ground_truth_cell_density || 1000000;
        const C2 = D1.target_seeding_density; // 1.0 × 10^5 cells/mL
        const V2 = D1.destination_volume;     // 10.0 mL
        const correctV1 = (C2 * V2) / C1;

        D2.target_seed_vol_input = v1;
        D2.seed_calc_delta = Math.abs(v1 - correctV1);
        this.sm.D3.inoculation_volume_set = true;

        if (typeof document !== 'undefined') {
            const iModal = document.getElementById('inoculation-modal');
            if (iModal) iModal.classList.add('hidden');
        }

        const accurate = D2.seed_calc_delta < 0.1;

        this.sm.showCalcModal(
            'Inoculation Volume Check (C₁V₁ = C₂V₂)',
            `<p><strong>Your Input:</strong> V₁ = ${v1.toFixed(2)} mL</p>` +
            `<p><strong>Correct Answer:</strong> V₁ = (${C2.toExponential(1)} × ${V2}) / ${C1.toExponential(2)} = <strong>${correctV1.toFixed(3)} mL</strong></p>` +
            `<p><strong>Delta:</strong> ${D2.seed_calc_delta.toFixed(3)} mL</p>` +
            (accurate ? `<p style="color:#4caf50">✓ Accurate calculation</p>` :
                `<p style="color:#ff9800">⚠ Calculation variance detected (${D2.seed_calc_delta.toFixed(3)} mL off)</p>`)
        );

        if (!accurate) {
            this.sm.D2.technique_score = Math.max(0, this.sm.D2.technique_score - 10);
        }
    }

    // ——— Vessel Labeling ([FR-022]) ———
    submitVesselLabel(initials, stateMachine, sessionManager) {
        const sm = sessionManager || this.sm;
        if (!initials || initials.trim().length === 0) {
            sm.showWarning('Enter operator initials.');
            setTimeout(() => sm.clearWarning(), 3000);
            return;
        }

        const cleanInitials = initials.trim().toUpperCase();
        const date = new Date().toISOString().split('T')[0];
        const label = `CHO-K1_P+1_${date}_${cleanInitials}`;

        sm.D2.vessel_label_record = label;
        sm.D3.vessel_labeled = true;

        if (typeof document !== 'undefined') {
            const lModal = document.getElementById('label-modal');
            if (lModal) lModal.classList.add('hidden');
        }

        sm.showCalcModal(
            'Vessel Label Attached',
            `<p><strong>Label:</strong> ${label}</p>` +
            `<p>Cell Line: CHO-K1 | Passage: P+1 | Date: ${date} | Operator: ${cleanInitials}</p>`
        );
    }
}
