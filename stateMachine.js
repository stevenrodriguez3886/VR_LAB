// stateMachine.js — Finite State Machine implementing Table 2.1 gating logic

export const States = Object.freeze({
    ANTEROOM: 0,
    CABINET_SETUP: 1,
    INSPECTION: 2,
    DISSOCIATION: 3,
    QUANTIFICATION: 4,
    INOCULATION: 5,
    COMPLETE: 6,
});

export class LabStateMachine {
    constructor(sessionManager, biologyEngine) {
        this.sessionManager = sessionManager;
        this.sm = sessionManager;
        this.biologyEngine = biologyEngine;
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
        const D2 = this.sm ? this.sm.D2 : {};
        const D3 = this.sm ? this.sm.D3 : {};
        const D1 = this.sm ? this.sm.D1 : {};

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
            if (D2.assessed_confluence_val === null || D2.assessed_confluence_val === undefined) {
                return { allowed: false, reason: 'Confluency assessment not submitted.' };
            }
            if (D2.assessed_confluence_val < D1.confluency_threshold && !D2.violation_log.includes('CONFLUENCY_OVERRIDE')) {
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
            if (D2.calculated_viability_pct === null || D2.calculated_viability_pct === undefined ||
                D2.calculated_density === null || D2.calculated_density === undefined) {
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
            if (this.sm && typeof this.sm.showWarning === 'function') {
                this.sm.showWarning(check.reason);
                setTimeout(() => {
                    if (this.sm && typeof this.sm.clearWarning === 'function') {
                        this.sm.clearWarning();
                    }
                }, 4000);
            }
            console.warn(`Transition blocked: ${check.reason}`);
            return false;
        }

        console.log(`State transition: ${this.currentState} → ${targetState}`);
        this.currentState = targetState;
        if (this.sm && typeof this.sm.updatePhaseBanner === 'function') {
            this.sm.updatePhaseBanner(targetState);
        }

        // Show/hide BSC status panel in States 1–5
        if (typeof document !== 'undefined') {
            const bscPanel = document.getElementById('bsc-status');
            if (bscPanel) {
                if (targetState >= States.CABINET_SETUP && targetState <= States.INOCULATION) {
                    bscPanel.classList.remove('hidden');
                } else {
                    bscPanel.classList.add('hidden');
                }
            }
        }

        // State 6 → finalize session [FR-024]
        if (targetState === States.COMPLETE) {
            this._finalizeSession();
        }

        return true;
    }

    _finalizeSession() {
        if (this.sm && typeof this.sm.finalizeSession === 'function') {
            this.sm.finalizeSession();
        }
        // Show audit summary
        if (typeof document !== 'undefined') {
            const auditEl = document.getElementById('audit-json');
            if (auditEl && this.sm && this.sm.D2) {
                auditEl.textContent = JSON.stringify(this.sm.D2, null, 2);
            }
            const modalEl = document.getElementById('audit-modal');
            if (modalEl) {
                modalEl.classList.remove('hidden');
            }
        }
    }

    reset() {
        this.currentState = States.ANTEROOM;
        if (this.sm && typeof this.sm.updatePhaseBanner === 'function') {
            this.sm.updatePhaseBanner(this.currentState);
        }
        if (typeof document !== 'undefined') {
            const bscPanel = document.getElementById('bsc-status');
            if (bscPanel) {
                bscPanel.classList.add('hidden');
            }
        }
    }
}
