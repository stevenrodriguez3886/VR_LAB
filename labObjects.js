// labObjects.js — 3D meshes, colliders, and interaction handlers for all lab equipment
import * as THREE from 'three';
import { States } from './stateMachine.js';

// ——— Material Library ———
export const materials = {
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
    // Anteroom is at the back (z > 4), main cleanroom is at front (z < 4)

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

    // Divider wall between anteroom and main cleanroom (at z = 4)
    // Left section (5m wide, centered at x = -3.5, spans x = -6 to -1)
    makeWall(5, 4, -3.5, 2, 4, Math.PI);
    makeWall(5, 4, -3.5, 2, 4, 0);
    // Right section (5m wide, centered at x = 3.5, spans x = 1 to 6)
    makeWall(5, 4, 3.5, 2, 4, Math.PI);
    makeWall(5, 4, 3.5, 2, 4, 0);
    // Header above doorway (2m wide, centered at x = 0, y from 3 to 4)
    makeWall(2, 1, 0, 3.5, 4, Math.PI);
    makeWall(2, 1, 0, 3.5, 4, 0);

    // Main Laboratory Workbench (non-overlapping with BSC)
    // BSC is at x = -2 (width 2.4, spanning x = -3.2 to -0.8).
    // Workbench is placed at x = 1.6m (width 3.6, spanning x = -0.2 to +3.4),
    // providing a clean 0.6m aisle clearance.
    // Height is 1.5m, centered at y = 0.75, so tabletop surface rests at y = 1.50m.
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.5, 1.6), materials.metal);
    bench.position.set(1.6, 0.75, -2.5);
    bench.castShadow = true;
    bench.receiveShadow = true;
    scene.add(bench);

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
    bscBody.position.y = 0.75;
    bscBody.castShadow = true;
    bscGroup.add(bscBody);

    const bscUpper = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.0), materials.metal);
    bscUpper.position.y = 2.3;
    bscGroup.add(bscUpper);

    const workSurface = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.8), materials.surface_dirty);
    workSurface.position.set(0, 1.525, 0); // surface at y = 1.55m
    workSurface.receiveShadow = true;
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
                if (typeof document !== 'undefined') {
                    const bscStatusEl = document.getElementById('bsc-status');
                    if (bscStatusEl) bscStatusEl.classList.remove('hidden');
                }
                sm.updateBSCDisplay();
            }
        }
    };
    scene.add(blowerSwitch);
    interactables.push(blowerSwitch);
    labObjects.blowerSwitch = blowerSwitch;

    // ——— Glass Sash Interaction [FR-003] ———
    // Sash travel delta is 20cm (0.2m): closed at y = 1.9, open at y = 2.1.
    // The handle moves synchronously with the glass sash.
    const sashInteract = new THREE.Group();
    sashInteract.position.set(-2, 1.9, -2 + 0.5);
    const sashHandle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), materials.plastic_blue);
    sashHandle.position.y = 0.025; // height / 2
    sashInteract.add(sashHandle);
    sashInteract.userData = {
        interactable: true,
        tooltipText: 'Glass Sash — Click to set to 20 cm height [FR-003]',
        type: 'sash',
        onInteract: (obj, ctx) => {
            const sm = ctx.sessionManager;
            if (sm.D3.sash_height < 19.0) {
                sm.D3.sash_height = 20.0;
                sashGlass.position.y = 2.1;
                sashInteract.position.y = 2.1;
                obj.userData.tooltipText = 'Sash at 20.0 cm ✓';
            } else {
                sm.D3.sash_height = 0.0;
                sashGlass.position.y = 1.9;
                sashInteract.position.y = 1.9;
                obj.userData.tooltipText = 'Glass Sash — Click to raise';
            }
            sm.D2.sash_compliance = (sm.D3.sash_height >= 19.0 && sm.D3.sash_height <= 21.0);
            sm.updateBSCDisplay();
        }
    };
    scene.add(sashInteract);
    interactables.push(sashInteract);
    labObjects.sashInteract = sashInteract;

    // ——— 70% Ethanol Spray Bottle [FR-004] ———
    // Resting flush on workbench corner near the BSC
    const ethanolBottle = new THREE.Group();
    ethanolBottle.position.set(-0.1, 1.50, -1.9);
    const bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 12), materials.ethanol_bottle);
    bottleBody.position.y = 0.10; // height / 2
    ethanolBottle.add(bottleBody);
    const sprayHead = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.08), materials.plastic_white);
    sprayHead.position.set(0, 0.22, 0); // 0.20 + 0.04 / 2
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
    labObjects.ethanolBottle = ethanolBottle;

    // ——— Supply Shelf / Apparatus Staging [FR-005] ———
    // Resting flush on workbench
    const supplyShelf = new THREE.Group();
    supplyShelf.position.set(2.8, 1.50, -2.0);
    const tipBox = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.15), materials.plastic_blue);
    tipBox.position.y = 0.04; // height / 2
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
            supplyShelf.position.set(-2, 1.55, -2.2);
            sm.updateBSCDisplay();
        }
    };
    scene.add(supplyShelf);
    interactables.push(supplyShelf);
    labObjects.supplyShelf = supplyShelf;

    // ——— Grille Hazard Test Object [HZ-001] ———
    // Docked on workbench surface at z = -2.0 (flush at y = 1.50)
    const testObject = new THREE.Group();
    testObject.position.set(0.4, 1.50, -2.0);
    const testMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), materials.reagent_bottle);
    testMesh.position.y = 0.075; // height / 2
    testObject.add(testMesh);
    testObject.userData = {
        interactable: true,
        tooltipText: 'Media Bottle — Click to place in BSC',
        type: 'media_bottle',
        inBSC: false,
        nearGrille: false,
        temperature: 37.0,
        validateTemperature: (temp, sm) => {
            const mgr = sm || sessionManager;
            return mgr.validateReagentTemperature(temp !== undefined ? temp : testObject.userData.temperature);
        },
        onInteract: (obj, ctx) => {
            const sm = ctx.sessionManager;
            if (!obj.userData.inBSC) {
                obj.userData.inBSC = true;
                obj.userData.nearGrille = true;
                testObject.position.set(-2, 1.55, -2 + 0.4);
                // [FR-006] Validate reagent temperature upon container introduction into BSC
                const temp = obj.userData.temperature !== undefined ? obj.userData.temperature : sm.D3.medium_temperature;
                sm.validateReagentTemperature(temp);
                sm.logGrilleViolation();
                obj.userData.tooltipText = 'Media Bottle — ⚠ Too close to grille! Click to reposition';
            } else if (obj.userData.nearGrille) {
                obj.userData.nearGrille = false;
                testObject.position.set(-2, 1.55, -2.3);
                sm.clearGrilleViolation();
                obj.userData.tooltipText = 'Media Bottle — Positioned safely ✓';
            }
        }
    };
    scene.add(testObject);
    interactables.push(testObject);
    labObjects.testObject = testObject;

    // ——— Inverted Microscope [FR-007–010] ———
    const microscopeGroup = new THREE.Group();
    microscopeGroup.position.set(3, 0, 0);
    const microBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.4), materials.metal);
    microBase.position.y = 0.4;
    microBase.castShadow = true;
    microscopeGroup.add(microBase);
    const microArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), materials.metal);
    microArm.position.set(0, 1.2, -0.1);
    microscopeGroup.add(microArm);
    const microHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.2), materials.metal);
    microHead.position.set(0, 1.6, 0);
    microscopeGroup.add(microHead);
    const eyepiece1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), materials.plastic_white);
    eyepiece1.position.set(-0.06, 1.73, 0);
    eyepiece1.rotation.x = -0.3;
    microscopeGroup.add(eyepiece1);
    const eyepiece2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), materials.plastic_white);
    eyepiece2.position.set(0.06, 1.73, 0);
    eyepiece2.rotation.x = -0.3;
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
            if (typeof document !== 'undefined') {
                const modal = document.getElementById('microscope-modal');
                if (modal) modal.classList.remove('hidden');
            }
            ctx.controls?.unlock?.();
            ctx.biologyEngine?.renderMicroscopeView?.();
        }
    };
    scene.add(microscopeGroup);
    interactables.push(microscopeGroup);
    labObjects.microscope = microscopeGroup;

    // ——— T-75 Culture Flask ———
    // Sits flush inside BSC on the stainless work surface (y = 1.55)
    const flaskGroup = new THREE.Group();
    flaskGroup.position.set(-1.5, 1.55, -2);
    const flaskBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.04), materials.flask);
    flaskBody.position.y = 0.09; // height / 2
    flaskGroup.add(flaskBody);
    const flaskLiquid = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.035), materials.liquid_yellow);
    flaskLiquid.position.y = 0.045; // resting near flask bottom
    flaskGroup.add(flaskLiquid);
    labObjects.flaskLiquid = flaskLiquid;

    flaskGroup.userData = {
        interactable: true,
        tooltipText: 'T-75 Culture Flask',
        type: 'flask',
        onInteract: (obj, ctx) => { /* Context-sensitive via dedicated reagent objects */ }
    };
    scene.add(flaskGroup);
    interactables.push(flaskGroup);
    labObjects.flask = flaskGroup;

    // ——— Vacuum Aspiration System [FR-011] ———
    // Realistic floor stand/cart next to BSC
    const vacuumGroup = new THREE.Group();
    vacuumGroup.position.set(-3.5, 0, -2);
    const vacuumCart = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.35), materials.metal);
    vacuumCart.position.y = 0.05;
    vacuumGroup.add(vacuumCart);
    const vacuumBody = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 12), materials.plastic_white);
    vacuumBody.position.y = 0.30; // 0.10 cart + 0.20 canister half-height
    vacuumBody.castShadow = true;
    vacuumGroup.add(vacuumBody);
    const vacuumHose = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x555555 }));
    vacuumHose.position.set(0, 0.60, 0);
    vacuumHose.rotation.z = 0.4;
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
    labObjects.vacuum = vacuumGroup;

    // ——— PBS Bottle [FR-012] ———
    // Flush on workbench at y = 1.50
    const pbsBottle = new THREE.Group();
    pbsBottle.position.set(0.1, 1.50, -2.8);
    const pbsBody = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 12),
        new THREE.MeshStandardMaterial({ color: 0x90caf9, transparent: true, opacity: 0.6 }));
    pbsBody.position.y = 0.10; // height / 2
    pbsBottle.add(pbsBody);
    pbsBottle.userData = {
        interactable: true,
        tooltipText: 'PBS (DPBS 1X) — Wash monolayer [FR-012]',
        type: 'pbs',
        temperature: 37.0,
        dispenseAngle: 0.0,
        validateDispensingAngle: (angle, sm) => {
            const mgr = sm || sessionManager;
            if (mgr && typeof mgr.validateDispenseAngle === 'function') {
                return mgr.validateDispenseAngle(angle);
            }
            if (angle > (mgr?.D1?.pbs_dispense_angle_limit || 45.0)) {
                mgr?.logSidewallViolation();
                return false;
            }
            return true;
        },
        validateTemperature: (temp, sm) => {
            const mgr = sm || sessionManager;
            return mgr.validateReagentTemperature(temp !== undefined ? temp : pbsBottle.userData.temperature);
        },
        onInteract: (obj, ctx) => {
            if (ctx.stateMachine.getCurrentState() !== States.DISSOCIATION) return;
            const sm = ctx.sessionManager;
            if (!sm.D3.medium_aspirated) {
                sm.showWarning('Aspirate spent medium first.');
                setTimeout(() => sm.clearWarning(), 3000); return;
            }

            // [FR-006] Reagent temperature validation
            const temp = obj.userData.temperature !== undefined ? obj.userData.temperature : sm.D3.medium_temperature;
            sm.validateReagentTemperature(temp);

            // [FR-012] Sidewall wash angle validation
            const angle = obj.userData.dispenseAngle !== undefined ? obj.userData.dispenseAngle : (ctx.dispenseAngle ?? 0.0);
            if (typeof sm.validateDispenseAngle === 'function') {
                sm.validateDispenseAngle(angle);
            } else if (angle > (sm.D1.pbs_dispense_angle_limit || 45.0)) {
                sm.logSidewallViolation();
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
    labObjects.pbsBottle = pbsBottle;

    // ——— Trypsin Bottle [FR-013] ———
    // Flush on workbench at y = 1.50
    const trypsinBottle = new THREE.Group();
    trypsinBottle.position.set(0.6, 1.50, -2.8);
    const trypBody = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.15, 12),
        new THREE.MeshStandardMaterial({ color: 0xffab91 }));
    trypBody.position.y = 0.075; // height / 2
    trypsinBottle.add(trypBody);
    trypsinBottle.userData = {
        interactable: true,
        tooltipText: '0.25% Trypsin-EDTA — Start enzymatic dissociation [FR-013]',
        type: 'trypsin',
        temperature: 37.0,
        validateTemperature: (temp, sm) => {
            const mgr = sm || sessionManager;
            return mgr.validateReagentTemperature(temp !== undefined ? temp : trypsinBottle.userData.temperature);
        },
        onInteract: (obj, ctx) => {
            if (ctx.stateMachine.getCurrentState() !== States.DISSOCIATION) return;
            const sm = ctx.sessionManager;
            if (!sm.D3.pbs_washed) {
                sm.showWarning('Complete PBS wash first.');
                setTimeout(() => sm.clearWarning(), 3000); return;
            }

            // [FR-006] Reagent temperature validation
            const temp = obj.userData.temperature !== undefined ? obj.userData.temperature : sm.D3.medium_temperature;
            sm.validateReagentTemperature(temp);

            if (!sm.D3.trypsin_applied) {
                sm.D3.trypsin_applied = true;
                sm.D3.active_trypsin_volume = 2.5;
                sm.D2.trypsin_vol_actual = 2.5;
                sm.D3.trypsin_activity_state = 'Active';
                sm.D3.trypsin_timer_running = true;
                sm.D3.trypsin_timer_elapsed = 0;
                obj.userData.tooltipText = 'Trypsin applied — timer started ✓';
                ctx.biologyEngine?.startTrypsinTimer?.();
            }
        }
    };
    scene.add(trypsinBottle);
    interactables.push(trypsinBottle);
    labObjects.trypsinBottle = trypsinBottle;

    // ——— DMEM Bottle (for quenching) [FR-015] ———
    // Flush on workbench at y = 1.50
    const dmemBottle = new THREE.Group();
    dmemBottle.position.set(1.1, 1.50, -2.8);
    const dmemBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 12), materials.reagent_bottle);
    dmemBody.position.y = 0.11; // height / 2
    dmemBottle.add(dmemBody);
    dmemBottle.userData = {
        interactable: true,
        tooltipText: 'Complete DMEM (serum) — Quench trypsin [FR-015]',
        type: 'dmem',
        temperature: 37.0,
        validateTemperature: (temp, sm) => {
            const mgr = sm || sessionManager;
            return mgr.validateReagentTemperature(temp !== undefined ? temp : dmemBottle.userData.temperature);
        },
        onInteract: (obj, ctx) => {
            if (ctx.stateMachine.getCurrentState() !== States.DISSOCIATION) return;
            const sm = ctx.sessionManager;
            if (sm.D3.trypsin_activity_state !== 'Active') {
                sm.showWarning(sm.D3.trypsin_activity_state === 'Neutralized' ? 'Trypsin already neutralized.' : 'Apply trypsin first.');
                setTimeout(() => sm.clearWarning(), 3000); return;
            }

            // [FR-006] Reagent temperature validation
            const temp = obj.userData.temperature !== undefined ? obj.userData.temperature : sm.D3.medium_temperature;
            sm.validateReagentTemperature(temp);

            sm.D3.cells_quenched = true;
            sm.D2.quench_media_vol_actual = 7.5;
            sm.D3.flask_medium_level = 7.5 + sm.D3.active_trypsin_volume;
            sm.D3.trypsin_activity_state = 'Neutralized';
            sm.D3.trypsin_timer_running = false;
            sm.D3.medium_color_state = 'Red-Orange';
            ctx.biologyEngine?.stopTrypsinTimer?.();
            obj.userData.tooltipText = 'Trypsin neutralized ✓';
            sm.hideTimer();
            flaskLiquid.visible = true;
            flaskLiquid.material = materials.liquid_red;
        }
    };
    scene.add(dmemBottle);
    interactables.push(dmemBottle);
    labObjects.dmemBottle = dmemBottle;

    // ——— Microcentrifuge Tube & Trypan Blue [FR-017] ———
    // Flush on workbench at y = 1.50
    const trypanGroup = new THREE.Group();
    trypanGroup.position.set(1.6, 1.50, -2.0);
    const tubeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.005, 0.06, 8), materials.plastic_white);
    tubeBody.position.y = 0.03; // height / 2
    trypanGroup.add(tubeBody);
    const trypanBottleM = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8),
        new THREE.MeshStandardMaterial({ color: 0x1565c0 }));
    trypanBottleM.position.set(0.06, 0.04, 0); // height / 2
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
    labObjects.trypanGroup = trypanGroup;

    // ——— Hemocytometer [FR-018–019] ———
    // Flush on workbench at y = 1.50
    const hemoGroup = new THREE.Group();
    hemoGroup.position.set(2.1, 1.50, -2.0);
    const hemoSlide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.005, 0.04), materials.glass);
    hemoSlide.position.y = 0.0025; // height / 2
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
            if (typeof document !== 'undefined') {
                const hModal = document.getElementById('hemocytometer-modal');
                if (hModal) hModal.classList.remove('hidden');
            }
            ctx.controls?.unlock?.();
            ctx.biologyEngine?.renderHemocytometerGrid?.();
        }
    };
    scene.add(hemoGroup);
    interactables.push(hemoGroup);
    labObjects.hemoGroup = hemoGroup;

    // ——— Destination Flask [FR-021–022] ———
    // Flush on workbench at y = 1.50
    const destFlask = new THREE.Group();
    destFlask.position.set(2.2, 1.50, -2.8);
    const destBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.04), materials.flask);
    destBody.position.y = 0.09; // height / 2
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
                if (typeof document !== 'undefined') {
                    const c1El = document.getElementById('inoc-c1');
                    if (c1El) c1El.textContent = sm.D2.calculated_density.toExponential(2);
                    const iModal = document.getElementById('inoculation-modal');
                    if (iModal) iModal.classList.remove('hidden');
                }
                ctx.controls?.unlock?.();
            } else if (!sm.D3.vessel_labeled) {
                if (typeof document !== 'undefined') {
                    const now = new Date();
                    const pEl = document.getElementById('label-passage');
                    if (pEl) pEl.value = 'P+1';
                    const dEl = document.getElementById('label-date');
                    if (dEl) dEl.value = now.toISOString().split('T')[0];
                    const lModal = document.getElementById('label-modal');
                    if (lModal) lModal.classList.remove('hidden');
                }
                ctx.controls?.unlock?.();
            }
        }
    };
    scene.add(destFlask);
    interactables.push(destFlask);
    labObjects.destFlask = destFlask;

    // ——— Filter Cap Toggle [FR-023] ———
    // Mounted directly on top of the destination flask (at neck level: y = 1.50 + 0.18)
    const capToggle = new THREE.Group();
    capToggle.position.set(2.2, 1.68, -2.8);
    const capMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), materials.plastic_white);
    capMesh.position.y = 0.015; // height / 2
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
    labObjects.capToggle = capToggle;

    // ——— CO2 Incubator [FR-023] ———
    const incubatorGroup = new THREE.Group();
    incubatorGroup.position.set(4, 0, -5);
    const incBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.8), materials.incubator);
    incBody.position.y = 0.9;
    incBody.castShadow = true;
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

            // Hide destination flask & cap from workbench, docking them inside incubator chamber
            if (labObjects.destFlask) {
                labObjects.destFlask.position.set(4, 0.9, -5);
                labObjects.destFlask.visible = false;
            }
            if (labObjects.capToggle) {
                labObjects.capToggle.position.set(4, 1.08, -5);
                labObjects.capToggle.visible = false;
            }

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
