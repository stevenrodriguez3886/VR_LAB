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
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
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
        if (typeof document === 'undefined') return;
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
        if (typeof document === 'undefined') return;
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
        this.D3.air_curtain_integrity = false;
        if (!this.D2.violation_log.includes('HZ-001')) {
            this.D2.violation_log.push('HZ-001');
        }
        this.D2.technique_score = Math.max(0, this.D2.technique_score - 5);
        this.showWarning('[HZ-001] Aseptic Flow Disrupted: Clear Intake Grille');
    }

    clearWarning() {
        this.D3.air_curtain_integrity = true;
        if (typeof document === 'undefined') return;
        const banner = document.getElementById('warning-banner');
        if (banner) {
            banner.classList.add('hidden');
            banner.classList.remove('severe');
        }
    }

    showWarning(text, severe = false) {
        if (typeof document === 'undefined') return;
        const banner = document.getElementById('warning-banner');
        const textEl = document.getElementById('warning-text');
        if (textEl) textEl.textContent = text;
        if (banner) {
            banner.classList.remove('hidden');
            if (severe) banner.classList.add('severe');
            else banner.classList.remove('severe');
        }
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
        if (typeof document === 'undefined') return;
        const readout = document.getElementById('timer-readout');
        const labelEl = document.getElementById('timer-label');
        const valEl = document.getElementById('timer-value');

        if (readout) readout.classList.remove('hidden');
        if (labelEl) labelEl.textContent = label;
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        if (valEl) {
            valEl.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        }

        // Critical state if trypsin > 5 min
        if (readout) {
            if (label.includes('Trypsin') && seconds > 300) {
                readout.classList.add('critical');
            } else {
                readout.classList.remove('critical');
            }
        }
    }

    hideTimer() {
        if (typeof document === 'undefined') return;
        const readout = document.getElementById('timer-readout');
        if (readout) readout.classList.add('hidden');
    }

    // ——— Phase banner ———
    updatePhaseBanner(state) {
        if (typeof document === 'undefined') return;
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
        const errorEl = typeof document !== 'undefined' ? document.getElementById('admin-login-error') : null;
        if (this._adminLocked) {
            if (errorEl) {
                errorEl.textContent = 'Terminal locked after 3 failed attempts.';
                errorEl.classList.remove('hidden');
            }
            return false;
        }
        if (pin === this._adminPin) {
            this._adminAuthenticated = true;
            this._adminAttempts = 0;
            if (typeof document !== 'undefined') {
                const loginEl = document.getElementById('admin-login');
                const controlsEl = document.getElementById('admin-controls');
                if (loginEl) loginEl.classList.add('hidden');
                if (controlsEl) controlsEl.classList.remove('hidden');
                if (errorEl) errorEl.classList.add('hidden');
                this._populateAdminLogs();
            }
            return true;
        } else {
            this._adminAttempts++;
            if (this._adminAttempts >= 3) {
                this._adminLocked = true;
                if (errorEl) errorEl.textContent = 'Terminal locked after 3 failed attempts.';
            } else {
                if (errorEl) errorEl.textContent = `Invalid PIN. ${3 - this._adminAttempts} attempt(s) remaining.`;
            }
            if (errorEl) errorEl.classList.remove('hidden');
            return false;
        }
    }

    prepareAdminPanel() {
        if (typeof document === 'undefined') return;
        const loginEl = document.getElementById('admin-login');
        const controlsEl = document.getElementById('admin-controls');
        if (this._adminAuthenticated) {
            if (loginEl) loginEl.classList.add('hidden');
            if (controlsEl) controlsEl.classList.remove('hidden');
            this._populateAdminLogs();
        } else {
            if (loginEl) loginEl.classList.remove('hidden');
            if (controlsEl) controlsEl.classList.add('hidden');
        }
        const pinInput = document.getElementById('admin-pin');
        if (pinInput) pinInput.value = '';

        // Wire up scenario config
        const confSel = document.getElementById('admin-confluency');
        if (confSel) {
            confSel.value = this.D1.starting_confluency.toString();
            confSel.onchange = () => {
                this.D1.starting_confluency = parseInt(confSel.value);
            };
        }
        const densInput = document.getElementById('admin-density');
        if (densInput) {
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
    }

    _populateAdminLogs() {
        if (typeof document === 'undefined') return;
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
        if (typeof document === 'undefined' || typeof Blob === 'undefined') return;
        const blob = new Blob([JSON.stringify(this.D2, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session_${this.D2.session_id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    finalizeSession() {
        this._sessionArchive.push(JSON.parse(JSON.stringify(this.D2)));
    }

    // ——— Confirmation modal helper ———
    showConfirmModal(title, message, onConfirm, onCancel) {
        if (typeof document === 'undefined') return;
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        if (modal) {
            modal._onConfirm = onConfirm;
            modal._onCancel = onCancel;
            modal.classList.remove('hidden');
        }
    }

    // ——— Calculation results modal ———
    showCalcModal(title, bodyHTML) {
        if (typeof document === 'undefined') return;
        const titleEl = document.getElementById('calc-modal-title');
        const bodyEl = document.getElementById('calc-modal-body');
        const modal = document.getElementById('calculation-modal');
        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.innerHTML = bodyHTML;
        if (modal) modal.classList.remove('hidden');
    }
}
