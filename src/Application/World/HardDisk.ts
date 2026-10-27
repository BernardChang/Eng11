import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import Application from '../Application';
import Camera, { CameraKey } from '../Camera/Camera';
import MonitorScreen from './MonitorScreen';
import UIEventBus from '../UI/EventBus';

const CASE_COUNT = 10;
const CREATED_DISK_CAPACITY = 10;
const MAX_DISKS = CASE_COUNT + CREATED_DISK_CAPACITY;
const CREATED_DISKS_KEY = 'truth-terminal-created-disks-v1';
const DEFAULT_DISK_NAMES = [
    'Comrade Arlen Ogilvy',
    'Mara Venn',
    'Tomas Wren',
    'Elia North',
    'Pavel Sorn',
    'Iris Bell',
    'Sera Quill',
    'Oren Vale',
    'Cato Mire',
    'Nella Firth',
];

type CharacterDiskProfile = {
    id: string;
    name: string;
    dob: string;
    job: string;
};

/** A small, clickable archive-disk rack placed beside the computer keyboard. */
export default class HardDisk {
    application: Application;
    camera: Camera;
    monitorScreen: MonitorScreen;
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    rack: THREE.Group;
    hotspots: HTMLButtonElement[] = [];
    disks: THREE.Group[] = [];
    outlines: THREE.LineSegments[] = [];
    homeLocalPositions: THREE.Vector3[] = [];
    homeLocalRotations: THREE.Euler[] = [];
    homePosition: THREE.Vector3;
    readonly slotPosition = new THREE.Vector3(500, -220, 500);
    inserted = false;
    selectedIndex: number | undefined;
    private hoveredIndex: number | undefined;
    private hint: HTMLDivElement;
    private focusing = false;
    private ejecting = false;
    private fileOpened = false;
    private fileOpenTimer = 0;
    private fallbackEjectButton: HTMLButtonElement;
    private readonly purgedDisks = new Set<number>();
    private purgeHole: THREE.Group;
    // The black circle sits directly beneath the coffee cup on the desk.
    private readonly purgeHolePosition = new THREE.Vector3(1740, -458, 909);
    private purging = false;
    private pointerPosition = new THREE.Vector2(-1, -1);
    private coffeeMotion: THREE.Group | undefined;
    private coffeeMotionHome = new THREE.Vector3();
    private coffeeAnimationStartedAt: number | undefined;
    private coffeeSteam: THREE.Object3D | undefined;
    private readonly createdProfileIds = new Set<string>();
    private readonly pendingProfileIds = new Set<string>();
    private createdDiskSlots: Array<string | null> = [];

    constructor(monitorScreen: MonitorScreen) {
        this.application = new Application();
        this.camera = this.application.camera;
        this.monitorScreen = monitorScreen;
        this.scene = this.application.scene;
        this.renderer = this.application.renderer.instance;
        this.homePosition = new THREE.Vector3(-1950, -500, 650);
        try {
            const stored = JSON.parse(
                window.localStorage.getItem('truth-terminal-purged-disks-v1') || '[]'
            );
            if (Array.isArray(stored)) {
                stored.forEach((index) => {
                    if (Number.isInteger(index) && index >= 0 && index < MAX_DISKS) {
                        this.purgedDisks.add(index);
                    }
                });
            }
        } catch {
            // Ignore malformed local game state and start with a usable rack.
        }

        this.rack = this.createRack();
        this.rack.position.copy(this.homePosition);
        this.scene.add(this.rack);
        this.loadCreatedCharacterDisks();
        this.purgeHole = this.createPurgeHole();
        this.scene.add(this.purgeHole);
        this.disks.forEach((disk, index) => {
            if (this.purgedDisks.has(index)) {
                disk.visible = false;
                this.hotspots[index].style.display = 'none';
            }
        });
        this.reflowRackDisks();

        this.hint = document.createElement('div');
        this.hint.textContent = 'SELECT A PERSONNEL DISK';
        this.hint.style.cssText =
            'position:fixed;display:none;z-index:10003;pointer-events:none;padding:9px 13px;background:#111;color:#fff;border:1px solid #fff;font:12px monospace;letter-spacing:.08em;';
        document.body.appendChild(this.hint);
        this.fallbackEjectButton = document.createElement('button');
        this.fallbackEjectButton.type = 'button';
        this.fallbackEjectButton.textContent = 'EJECT DISK · RETURN TO STORAGE';
        this.fallbackEjectButton.style.cssText =
            'position:fixed;display:none;right:20px;bottom:20px;z-index:10005;padding:13px 16px;background:#8f382f;color:#fff;border:1px solid #f0e8d7;font:12px monospace;letter-spacing:.06em;cursor:pointer;';
        this.fallbackEjectButton.addEventListener('click', () => this.eject());
        document.body.appendChild(this.fallbackEjectButton);
        window.addEventListener('mousemove', (event) => {
            this.pointerPosition.set(event.clientX, event.clientY);
        });
        document.addEventListener('mousedown', this.onOutsideRackClick);
        window.addEventListener('message', this.onMessage);
    }

    private onOutsideRackClick = (event: MouseEvent) => {
        const archiveIsFocused =
            this.camera.currentKeyframe === CameraKey.ARCHIVE ||
            this.camera.targetKeyframe === CameraKey.ARCHIVE;
        if (
            !archiveIsFocused ||
            this.inserted ||
            this.focusing ||
            this.ejecting
        ) {
            return;
        }

        // Disk hotspots stop the event themselves. Any other click leaves the
        // rack close-up and returns to the full computer desk view.
        if (event.target instanceof Element && event.target.closest('button')) return;

        this.selectedIndex = undefined;
        this.focusing = false;
        this.setHovered(undefined);
        this.camera.transition(CameraKey.DESK, 900);
    };

    private createPurgeHole(): THREE.Group {
        const hole = new THREE.Group();
        hole.name = 'blackCircle';
        hole.position.copy(this.purgeHolePosition);
        const circle = new THREE.Mesh(
            new THREE.CircleBufferGeometry(365, 64),
            new THREE.MeshBasicMaterial({
                color: 0x000000,
                side: THREE.DoubleSide,
            })
        );
        circle.name = 'blackCircleSurface';
        circle.rotation.x = -Math.PI / 2;
        circle.position.y = 8;
        hole.add(circle);
        return hole;
    }

    /** Animate the separate coffee mesh into the desk circle after Start. */
    animateCoffeeCup(cup: THREE.Object3D, steam: THREE.Object3D) {
        this.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(cup);
        this.coffeeMotionHome.copy(bounds.getCenter(new THREE.Vector3()));
        this.coffeeMotion = new THREE.Group();
        this.coffeeMotion.position.copy(this.coffeeMotionHome);
        this.scene.add(this.coffeeMotion);
        this.coffeeMotion.attach(cup);
        this.coffeeSteam = steam;

        UIEventBus.on('loadingScreenDone', () => {
            if (this.coffeeAnimationStartedAt !== undefined) return;
            this.monitorScreen.setFocusLocked(true);
            this.coffeeAnimationStartedAt = performance.now() + 800;
        });
    }

    private updateCoffeeCup() {
        if (!this.coffeeMotion || this.coffeeAnimationStartedAt === undefined) return;
        const elapsed = performance.now() - this.coffeeAnimationStartedAt;
        if (elapsed < 0) return;

        const duration = 3200;
        const progress = THREE.MathUtils.clamp(elapsed / duration, 0, 1);
        const ease = (value: number) => value * value * (3 - 2 * value);
        const drop = ease(THREE.MathUtils.clamp(progress / 0.48, 0, 1));
        const sink = ease(THREE.MathUtils.clamp((progress - 0.48) / 0.52, 0, 1));
        const swirl = (1 - progress) * 85;
        const angle = progress * Math.PI * 4;

        if (progress < 0.48) {
            this.coffeeMotion.position.y = THREE.MathUtils.lerp(
                this.coffeeMotionHome.y,
                this.purgeHolePosition.y + 115,
                drop
            );
        } else {
            this.coffeeMotion.position.y = THREE.MathUtils.lerp(
                this.purgeHolePosition.y + 115,
                this.purgeHolePosition.y - 760,
                sink
            );
        }
        this.coffeeMotion.position.x = this.coffeeMotionHome.x + Math.cos(angle) * swirl;
        this.coffeeMotion.position.z = this.coffeeMotionHome.z + Math.sin(angle) * swirl;
        this.coffeeMotion.rotation.set(
            progress * 0.75,
            angle,
            progress * Math.PI * 0.6
        );
        this.coffeeMotion.scale.setScalar(1 - sink * 0.96);

        if (progress > 0.08 && this.coffeeSteam) this.coffeeSteam.visible = false;
        if (progress >= 1) {
            this.coffeeMotion.visible = false;
            if (this.coffeeSteam) this.coffeeSteam.visible = false;
            this.monitorScreen.setFocusLocked(false);
            this.coffeeAnimationStartedAt = undefined;
        }
    }

    private createRack(): THREE.Group {
        const rack = new THREE.Group();
        rack.name = 'personnelDiskRack';

        const orange = new THREE.MeshBasicMaterial({ color: 0xb95a21 });
        const orangeLight = new THREE.MeshBasicMaterial({ color: 0xd17432 });
        const floppyModel = this.application.resources.items.gltfModel
            .floppyDiskModel.scene;

        // Long, slotted archive holder. The disks stay upright and parallel,
        // with their broad faces aimed forward and the row turned sideways.
        // Built-in disks and character-created disks share one evenly spaced
        // 20-position storage row.
        const storageWidth = (CASE_COUNT + CREATED_DISK_CAPACITY - 1) * 72 + 72;
        const base = new THREE.Mesh(
            new THREE.BoxBufferGeometry(storageWidth, 58, 500),
            orange
        );
        base.name = 'diskTrayBase';
        base.position.y = 29;
        rack.add(base);
        const sideWalls = new THREE.BoxBufferGeometry(storageWidth, 105, 36);
        const leftWall = new THREE.Mesh(sideWalls, orangeLight);
        leftWall.name = 'diskTrayLeftWall';
        leftWall.position.set(0, 66, -232);
        rack.add(leftWall);
        const rightWall = new THREE.Mesh(sideWalls, orangeLight);
        rightWall.name = 'diskTrayRightWall';
        rightWall.position.set(0, 66, 232);
        rack.add(rightWall);
        for (let divider = 1; divider < CASE_COUNT + CREATED_DISK_CAPACITY; divider++) {
            const rib = new THREE.Mesh(
                new THREE.BoxBufferGeometry(8, 14, 462),
                orangeLight
            );
            rib.name = `diskSlotDivider${divider}`;
            rib.position.set((divider - (CASE_COUNT + CREATED_DISK_CAPACITY) / 2) * 72, 64, 0);
            rack.add(rib);
        }

        for (let index = 0; index < CASE_COUNT; index++) {
            this.createDiskSlot(index, undefined, rack);
        }
        return rack;
    }

    private createDiskSlot(
        index: number,
        profile: CharacterDiskProfile | undefined,
        rack: THREE.Group
    ) {
        const floppyModel = this.application.resources.items.gltfModel
            .floppyDiskModel.scene;
        const caseGroup = new THREE.Group();
        caseGroup.name = `personnelDisk${index + 1}`;
        const diskHomeY = 245;
        // Keep built-in disks first, then place created disks in consecutive
        // slots from left to right instead of alternating between built-ins.
        const storageSlot = index;
        const diskHomeX =
            (storageSlot - (CASE_COUNT + CREATED_DISK_CAPACITY - 1) / 2) * 72;
        caseGroup.position.set(diskHomeX, diskHomeY, 0);
        caseGroup.rotation.set(0, Math.PI / 2, 0);
        caseGroup.userData.homeY = diskHomeY;
        caseGroup.userData.profileId = profile?.id;
        this.homeLocalPositions[index] = caseGroup.position.clone();
        this.homeLocalRotations[index] = caseGroup.rotation.clone();
        rack.add(caseGroup);
        this.disks[index] = caseGroup;

        const model = floppyModel.clone(true);
        model.name = `floppyModel${index + 1}`;
        model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                const materials = Array.isArray(child.material)
                    ? child.material
                    : [child.material];
                const palette: Record<string, number> = {
                    Plastic: 0x1d3159,
                    Metal: 0xb9b8b1,
                    Disc: 0x252a32,
                    Label: 0xffffff,
                };
                const converted = materials.map(
                    (material) =>
                        new THREE.MeshBasicMaterial({
                            color: palette[material.name] || 0xe7e0ce,
                            map: material.map || null,
                            side: THREE.DoubleSide,
                        })
                );
                child.material = Array.isArray(child.material)
                    ? converted
                    : converted[0];
            }
        });
        caseGroup.add(model);
        const diskLabel = this.createDiskLabel(index, profile);
        caseGroup.userData.personName = diskLabel.userData.personName;
        caseGroup.add(diskLabel);
        const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxBufferGeometry(342, 378, 30)),
            new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 1,
                depthTest: false,
            })
        );
        outline.visible = false;
        outline.renderOrder = 10;
        caseGroup.add(outline);
        this.outlines[index] = outline;
        this.createDiskHotspot(index);
    }

    private createDiskLabel(index: number, profile?: CharacterDiskProfile): THREE.Mesh {
        const defaults = [
            {
                name: 'Comrade Arlen Ogilvy',
                dob: '1961-03-12',
                job: 'Junior Anti-Sex League organizer',
            },
            { name: 'Mara Venn', dob: '1954-08-19', job: 'Records clerk' },
            { name: 'Tomas Wren', dob: '1948-02-04', job: 'Transit scheduler' },
            { name: 'Elia North', dob: '1960-11-23', job: 'Junior instructor' },
            { name: 'Pavel Sorn', dob: '1939-06-01', job: 'Supply coordinator' },
            { name: 'Iris Bell', dob: '1958-04-15', job: 'Community liaison' },
            { name: 'Sera Quill', dob: '1946-09-27', job: 'Weather records analyst' },
            { name: 'Oren Vale', dob: '1951-01-16', job: 'Civic transport inspector' },
            { name: 'Cato Mire', dob: '1937-12-08', job: 'Public works foreman' },
            { name: 'Nella Firth', dob: '1963-05-21', job: 'Junior archive assistant' },
        ];
        let details = profile || defaults[index] || defaults[0];
        try {
            const saved = JSON.parse(
                window.localStorage.getItem('truth-terminal-profiles-v4') || '{}'
            );
            const assignmentIds = ['0041', '0178', '0264'];
            const assignmentId = assignmentIds[index];
            const savedProfile = saved.profiles?.find(
                (profile: { assignmentId?: string; name?: string }) =>
                    profile.assignmentId === assignmentId
            );
            if (savedProfile?.name) {
                details = {
                    ...details,
                    name: savedProfile.name,
                    dob: savedProfile.dob || details.dob,
                    job: savedProfile.job || details.job,
                };
            }
        } catch {
            // Keep the built-in person label if there is no saved profile yet.
        }

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 384;
        const context = canvas.getContext('2d');
        if (context) {
            // The model's white label is about 200 by 187 world units. Keep
            // the name on a small inset panel within that printed area.
            context.fillStyle = 'rgba(250, 248, 240, 0.94)';
            context.fillRect(18, 126, 476, 132);
            context.fillStyle = '#20211f';
            context.textAlign = 'center';
            context.textBaseline = 'middle';

            const words = details.name.trim().split(/\s+/);
            let fontSize = 62;
            let lines: string[] = [];
            while (fontSize >= 32) {
                context.font = `700 ${fontSize}px Arial, sans-serif`;
                lines = [];
                let line = '';
                for (const word of words) {
                    const candidate = line ? `${line} ${word}` : word;
                    if (context.measureText(candidate).width > 430 && line) {
                        lines.push(line);
                        line = word;
                    } else {
                        line = candidate;
                    }
                }
                if (line) lines.push(line);
                if (lines.length <= 2) break;
                fontSize -= 2;
            }

            context.font = `700 ${fontSize}px Arial, sans-serif`;
            const lineHeight = Math.min(72, fontSize * 1.16);
            const firstY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
            lines.forEach((line, lineIndex) => {
                context.fillText(line, canvas.width / 2, firstY + lineIndex * lineHeight, 438);
            });
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        const label = new THREE.Mesh(
            new THREE.PlaneBufferGeometry(190, 176),
            new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
                depthTest: false,
            })
        );
        label.name = `personnelDiskLabel${index + 1}`;
        label.userData.personName = details.name;
        // The local +X face points toward the viewer after the slot quarter-turn.
        label.position.set(12, -49, 0);
        label.renderOrder = 2;
        return label;
    }

    private loadCreatedCharacterDisks() {
        let ids: Array<string | null> = [];
        let profiles: CharacterDiskProfile[] = [];
        let cachedProfiles: Record<string, CharacterDiskProfile> = {};
        try {
            const storedIds = JSON.parse(
                window.localStorage.getItem(CREATED_DISKS_KEY) || '[]'
            );
            const saved = JSON.parse(
                window.localStorage.getItem('truth-terminal-profiles-v4') || '{}'
            );
            cachedProfiles = JSON.parse(
                window.localStorage.getItem('truth-terminal-disk-profiles-v1') || '{}'
            );
            ids = Array.isArray(storedIds)
                ? [...new Set(storedIds.filter((id): id is string => typeof id === 'string'))]
                      .slice(0, MAX_DISKS - CASE_COUNT)
                : [];
            profiles = Array.isArray(saved.profiles) ? saved.profiles : [];
        } catch {
            return;
        }

        const validIds: string[] = [];
        let clearedStalePurge = false;
        ids.forEach((id) => {
            if (!id) return;
            const profile = cachedProfiles[id] || profiles.find((entry) => entry.id === id);
            if (!profile || !profile.name || !profile.dob || !profile.job) return;
            const offset = validIds.length;
            validIds.push(id);
            const index = CASE_COUNT + offset;
            clearedStalePurge = this.purgedDisks.delete(index) || clearedStalePurge;
            this.createdProfileIds.add(id);
            this.createDiskSlot(index, profile, this.rack);
        });
        this.createdDiskSlots = validIds;
        if (clearedStalePurge) {
            try {
                window.localStorage.setItem(
                    'truth-terminal-purged-disks-v1',
                    JSON.stringify(Array.from(this.purgedDisks))
                );
            } catch {
                // Active profile disks stay available for this session.
            }
        }
        try {
            window.localStorage.setItem(CREATED_DISKS_KEY, JSON.stringify(this.createdDiskSlots));
        } catch {
            // Existing disks remain available for this session.
        }
    }

    /** Keep all live disks packed into the earliest visible rack slots. */
    private reflowRackDisks() {
        let storageSlot = 0;
        for (let index = 0; index < MAX_DISKS; index++) {
            const disk = this.disks[index];
            const home = this.homeLocalPositions[index];
            if (!disk || !home || !disk.visible || this.purgedDisks.has(index)) continue;

            const x = (storageSlot - (MAX_DISKS - 1) / 2) * 72;
            home.x = x;
            disk.position.x = x;
            storageSlot++;
        }
        this.rack.updateMatrixWorld(true);
    }

    private refreshCreatedCharacterDisks() {
        if (this.inserted || this.focusing || this.ejecting) {
            window.setTimeout(() => {
                if (!this.inserted && !this.focusing && !this.ejecting) {
                    this.refreshCreatedCharacterDisks();
                }
            }, 900);
            return;
        }

        for (let index = CASE_COUNT; index < MAX_DISKS; index++) {
            this.disks[index]?.parent?.remove(this.disks[index]);
            this.hotspots[index]?.remove();
            this.outlines[index]?.parent?.remove(this.outlines[index]);
            delete this.disks[index];
            delete this.hotspots[index];
            delete this.outlines[index];
            delete this.homeLocalPositions[index];
        }
        this.createdProfileIds.clear();
        this.createdDiskSlots = [];
        this.loadCreatedCharacterDisks();
        this.reflowRackDisks();
    }

    private saveCreatedDiskSlots() {
        try {
            window.localStorage.setItem(
                CREATED_DISKS_KEY,
                JSON.stringify(this.createdDiskSlots)
            );
        } catch {
            // Keep this session usable if storage is temporarily unavailable.
        }
    }

    private createCharacterDisk(profileId: unknown) {
        if (typeof profileId !== 'string' || !profileId) return;
        if (this.pendingProfileIds.has(profileId)) return;

        let profile: CharacterDiskProfile | undefined;
        try {
            const saved = JSON.parse(
                window.localStorage.getItem('truth-terminal-profiles-v4') || '{}'
            );
            const profiles = Array.isArray(saved.profiles) ? saved.profiles : [];
            const cached = JSON.parse(
                window.localStorage.getItem('truth-terminal-disk-profiles-v1') || '{}'
            );
            profile = profiles.find((entry: CharacterDiskProfile) => entry.id === profileId) ||
                cached[profileId];
        } catch {
            profile = undefined;
        }
        if (!profile?.id || !profile.name || !profile.dob || !profile.job) {
            this.replyDiskCreated(profileId, 'error');
            return;
        }

        if (this.createdProfileIds.has(profileId)) {
            const index = this.disks.findIndex(
                (disk) => disk?.userData.profileId === profileId
            );
            this.replyDiskCreated(profileId, 'exists', index);
            return;
        }
        let slotOffset = this.createdDiskSlots.findIndex((id) => !id);
        if (slotOffset < 0) slotOffset = this.createdDiskSlots.length;
        if (slotOffset >= MAX_DISKS - CASE_COUNT) {
            this.replyDiskCreated(profileId, 'full');
            return;
        }

        const index = CASE_COUNT + slotOffset;
        this.pendingProfileIds.add(profileId);
        this.createdProfileIds.add(profileId);
        this.createdDiskSlots[slotOffset] = profileId;
        try {
            this.saveCreatedDiskSlots();
            const cache = JSON.parse(
                window.localStorage.getItem('truth-terminal-disk-profiles-v1') || '{}'
            );
            cache[profileId] = profile;
            window.localStorage.setItem('truth-terminal-disk-profiles-v1', JSON.stringify(cache));
        } catch {
            this.createdProfileIds.delete(profileId);
            this.createdDiskSlots[slotOffset] = null;
            this.pendingProfileIds.delete(profileId);
            this.replyDiskCreated(profileId, 'error');
            return;
        }

        this.rack.updateMatrixWorld(true);
        this.createDiskSlot(index, profile, this.rack);
        this.purgedDisks.delete(index);
        try {
            window.localStorage.setItem(
                'truth-terminal-purged-disks-v1',
                JSON.stringify(Array.from(this.purgedDisks))
            );
        } catch {
            // The new disk is still available for this session.
        }
        const disk = this.disks[index];
        const homePosition = this.rack.localToWorld(
            this.homeLocalPositions[index].clone()
        );
        this.scene.attach(disk);
        disk.visible = true;
        disk.position.copy(this.slotPosition);
        disk.rotation.set(Math.PI / 2, 0, 0);
        disk.scale.setScalar(0.82);
        this.monitorScreen.setFocusLocked(true);
        this.camera.transition(CameraKey.DESK, 900);

        let complete = false;
        let safetyTimer = 0;
        const finishCreation = () => {
            if (complete) return;
            complete = true;
            window.clearTimeout(safetyTimer);
            this.rack.updateMatrixWorld(true);
            this.rack.attach(disk);
            disk.position.copy(this.homeLocalPositions[index]);
            disk.rotation.copy(this.homeLocalRotations[index]);
            disk.scale.setScalar(1);
            disk.visible = true;
            this.reflowRackDisks();
            this.camera.transition(CameraKey.ARCHIVE, 1050);
            this.pendingProfileIds.delete(profileId);
            window.setTimeout(() => this.monitorScreen.setFocusLocked(false), 1100);
            this.replyDiskCreated(profileId, 'created', index);
        };

        const toss = { progress: 0 };
        new TWEEN.Tween(toss)
            .to({ progress: 1 }, 2100)
            .easing(TWEEN.Easing.Cubic.InOut)
            .onUpdate(() => {
                const t = toss.progress;
                disk.position.set(
                    THREE.MathUtils.lerp(this.slotPosition.x, homePosition.x, t),
                    THREE.MathUtils.lerp(this.slotPosition.y, homePosition.y, t) + Math.sin(t * Math.PI) * 520,
                    THREE.MathUtils.lerp(this.slotPosition.z, homePosition.z, t)
                );
                disk.rotation.set(
                    Math.PI / 2 + t * Math.PI * 2,
                    t * Math.PI * 4,
                    t * Math.PI * 1.5
                );
                disk.scale.setScalar(THREE.MathUtils.lerp(0.82, 1, t));
            })
            .onComplete(finishCreation)
            .start();
        safetyTimer = window.setTimeout(finishCreation, 2800);
    }

    private replyDiskCreated(
        profileId: string,
        status: 'created' | 'exists' | 'full' | 'error',
        diskIndex?: number
    ) {
        this.monitorScreen.iframe.contentWindow?.postMessage(
            { type: 'character-disk-created', profileId, status, diskIndex },
            window.location.origin
        );
    }

    private createDiskHotspot(index: number) {
        const button = document.createElement('button');
        button.type = 'button';
        const personName = this.getDiskPersonName(index);
        button.setAttribute('aria-label', `Select ${personName}`);
        button.title = `${personName} — hover to inspect, click to focus`;
        button.style.cssText =
            'position:fixed;display:none;opacity:0;background:transparent;border:0;padding:0;z-index:10002;cursor:pointer;pointer-events:auto;';
        button.addEventListener('pointerenter', () => {
            if (!this.focusing) this.setHovered(index);
        });
        button.addEventListener('pointerleave', () => {
            if (!this.focusing) this.refreshHoveredDisk();
        });
        button.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        });
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.selectDisk(index);
        });
        document.body.appendChild(button);
        this.hotspots[index] = button;
    }

    private getDiskPersonName(index: number): string {
        const name = this.disks[index]?.userData.personName;
        return typeof name === 'string' && name.trim()
            ? name
            : DEFAULT_DISK_NAMES[index] || 'Archive record';
    }

    private setHovered(index: number | undefined) {
        const archiveIsFocused =
            this.camera.currentKeyframe === CameraKey.ARCHIVE ||
            this.camera.targetKeyframe === CameraKey.ARCHIVE;
        if (this.hoveredIndex === index) {
            if (index === undefined || !archiveIsFocused) {
                this.hint.style.display = 'none';
            }
            return;
        }
        if (this.hoveredIndex !== undefined) this.liftDisk(this.hoveredIndex, false);
        if (index !== undefined) this.liftDisk(index, true);
        this.hoveredIndex = index;
        this.outlines.forEach((outline, outlineIndex) => {
            outline.visible = outlineIndex === index;
        });
        if (index === undefined || !archiveIsFocused) {
            this.hint.style.display = 'none';
        } else {
            this.hint.textContent = `${this.getDiskPersonName(index)} · CLICK TO FOCUS`;
            this.hint.style.display = 'block';
        }
    }

    private refreshHoveredDisk() {
        const index = this.hotspots.findIndex((hotspot) => {
            if (!hotspot) return false;
            const bounds = hotspot.getBoundingClientRect();
            return (
                this.pointerPosition.x >= bounds.left &&
                this.pointerPosition.x <= bounds.right &&
                this.pointerPosition.y >= bounds.top &&
                this.pointerPosition.y <= bounds.bottom &&
                hotspot.style.display !== 'none'
            );
        });
        this.setHovered(index < 0 ? undefined : index);
    }

    private liftDisk(index: number, raised: boolean) {
        const disk = this.disks[index];
        if (!disk) return;
        const homeY = disk.userData.homeY as number;
        new TWEEN.Tween(disk.position)
            .to({ y: homeY + (raised ? 78 : 0) }, 230)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();
    }

    update() {
        this.updateCoffeeCup();
        const deskIsVisible = [
            this.camera.currentKeyframe,
            this.camera.targetKeyframe,
        ].some(
            (key) =>
                key === CameraKey.IDLE ||
                key === CameraKey.DESK ||
                key === CameraKey.ARCHIVE
        );
        if (this.inserted || !this.rack.visible || !deskIsVisible) {
            this.hotspots.forEach((hotspot) => (hotspot.style.display = 'none'));
            this.hint.style.display = 'none';
            return;
        }

        this.rack.updateMatrixWorld(true);
        this.camera.instance.updateMatrixWorld(true);
        const canvas = this.renderer.domElement.getBoundingClientRect();
        this.disks.forEach((disk, index) => {
            const hotspot = this.hotspots[index];
            const box = new THREE.Box3().setFromObject(disk);
            const corners = [
                new THREE.Vector3(box.min.x, box.min.y, box.min.z),
                new THREE.Vector3(box.min.x, box.min.y, box.max.z),
                new THREE.Vector3(box.min.x, box.max.y, box.min.z),
                new THREE.Vector3(box.min.x, box.max.y, box.max.z),
                new THREE.Vector3(box.max.x, box.min.y, box.min.z),
                new THREE.Vector3(box.max.x, box.min.y, box.max.z),
                new THREE.Vector3(box.max.x, box.max.y, box.min.z),
                new THREE.Vector3(box.max.x, box.max.y, box.max.z),
            ];
            const projected = corners.map((corner) =>
                corner.project(this.camera.instance)
            );
            const visible = projected.filter(
                (point) => point.z > -1 && point.z < 1
            );
            if (visible.length === 0) {
                hotspot.style.display = 'none';
                return;
            }
            const minX = Math.min(...visible.map((point) => point.x));
            const maxX = Math.max(...visible.map((point) => point.x));
            const minY = Math.min(...visible.map((point) => point.y));
            const maxY = Math.max(...visible.map((point) => point.y));
            if (maxX < -1 || minX > 1 || maxY < -1 || minY > 1) {
                hotspot.style.display = 'none';
                return;
            }
            const left = canvas.left + ((minX + 1) / 2) * canvas.width;
            const top = canvas.top + ((1 - maxY) / 2) * canvas.height;
            const width = Math.max(30, ((maxX - minX) / 2) * canvas.width);
            const height = Math.max(38, ((maxY - minY) / 2) * canvas.height);
            hotspot.style.left = `${Math.max(canvas.left, left - 3)}px`;
            hotspot.style.top = `${Math.max(canvas.top, top - 3)}px`;
            hotspot.style.width = `${Math.min(width + 6, canvas.width)}px`;
            hotspot.style.height = `${Math.min(height + 6, canvas.height)}px`;
            hotspot.style.display = 'block';
            if (this.selectedIndex === index && this.hint.style.display === 'block') {
                this.hint.style.left = `${Math.max(canvas.left, left)}px`;
                this.hint.style.top = `${Math.max(canvas.top, top - 34)}px`;
            }
        });
    }

    private onMessage = (event: MessageEvent) => {
        if (
            event.source !== this.monitorScreen.iframe.contentWindow ||
            event.origin !== window.location.origin
        ) {
            return;
        }
        if (event.data?.type === 'person-file-opened') {
            if (event.data.diskIndex === this.selectedIndex) {
                this.fileOpened = true;
                this.monitorScreen.setFocusLocked(false);
                window.clearTimeout(this.fileOpenTimer);
                this.fallbackEjectButton.style.display = 'none';
            }
            return;
        }
        if (event.data?.type === 'create-character-disk') {
            this.createCharacterDisk(event.data.profileId);
            return;
        }
        if (event.data?.type === 'purge-character-from-history') {
            this.purgeCharacterFromHistory(event.data.profileId);
            return;
        }
        if (event.data?.type === 'cloud-character-disks-updated') {
            this.refreshCreatedCharacterDisks();
            return;
        }
        if (event.data?.type === 'file-disk-to-history') {
            this.fileDiskToHistory(Number(event.data.diskIndex));
            return;
        }
        if (event.data?.type === 'eject-hard-disk') this.eject();
        if (event.data?.type === 'purge-hard-disk') this.purgeDisk(event.data.profileId);
    };

    private purgeCharacterFromHistory(profileId: unknown) {
        if (typeof profileId !== 'string' || !profileId) return;
        if (this.inserted || this.ejecting || this.focusing) {
            this.replyCharacterPurge(profileId, 'busy');
            return;
        }

        let profile: CharacterDiskProfile | undefined;
        try {
            const saved = JSON.parse(
                window.localStorage.getItem('truth-terminal-profiles-v4') || '{}'
            );
            profile = saved.profiles?.find(
                (entry: CharacterDiskProfile) => entry.id === profileId
            );
        } catch {
            profile = undefined;
        }
        if (!profile?.id || !profile.name || !profile.dob || !profile.job) {
            this.replyCharacterPurge(profileId, 'error');
            return;
        }

        let index = MAX_DISKS;
        while (this.disks[index]) index++;
        this.createDiskSlot(index, profile, this.rack);
        const disk = this.disks[index];
        this.rack.updateMatrixWorld(true);
        this.scene.attach(disk);
        disk.visible = true;
        disk.position.copy(this.slotPosition);
        disk.rotation.set(Math.PI / 2, 0, 0);
        disk.scale.setScalar(0.82);
        disk.userData.directPurge = true;
        this.selectedIndex = index;
        this.inserted = true;
        this.replyCharacterPurge(profileId, 'started');
        this.purgeDisk(profileId, 'history');
    }

    private replyCharacterPurge(profileId: string, status: 'started' | 'busy' | 'error') {
        this.monitorScreen.iframe.contentWindow?.postMessage(
            { type: 'character-disk-purge-result', profileId, status },
            window.location.origin
        );
    }

    private fileDiskToHistory(index: number) {
        if (!this.inserted || this.ejecting || index !== this.selectedIndex) return;
        const disk = this.disks[index];
        if (!disk) return;

        this.ejecting = true;
        this.monitorScreen.setFocusLocked(true);
        window.clearTimeout(this.fileOpenTimer);
        this.fallbackEjectButton.style.display = 'none';
        this.scene.remove(disk);
        disk.visible = false;

        const profileId = disk.userData.profileId as string | undefined;
        if (index >= CASE_COUNT && profileId) {
            const slotOffset = index - CASE_COUNT;
            this.createdProfileIds.delete(profileId);
            this.createdDiskSlots[slotOffset] = null;
            this.saveCreatedDiskSlots();
            try {
                const cache = JSON.parse(
                    window.localStorage.getItem('truth-terminal-disk-profiles-v1') || '{}'
                );
                delete cache[profileId];
                window.localStorage.setItem(
                    'truth-terminal-disk-profiles-v1',
                    JSON.stringify(cache)
                );
            } catch {
                // The record has already been filed by the monitor page.
            }
        } else {
            this.purgedDisks.add(index);
            try {
                window.localStorage.setItem(
                    'truth-terminal-purged-disks-v1',
                    JSON.stringify(Array.from(this.purgedDisks))
                );
            } catch {
                // The disk remains consumed for this session.
            }
        }

        this.hotspots[index]?.remove();
        delete this.hotspots[index];
        delete this.disks[index];
        delete this.outlines[index];
        delete this.homeLocalPositions[index];
        delete this.homeLocalRotations[index];
        this.reflowRackDisks();
        this.inserted = false;
        this.ejecting = false;
        this.fileOpened = false;
        this.focusing = false;
        this.selectedIndex = undefined;
        this.setHovered(undefined);
        window.setTimeout(() => this.monitorScreen.setFocusLocked(false), 350);
    }

    private selectDisk(index: number) {
        if (this.purgedDisks.has(index) || this.inserted || this.ejecting) return;
        if (
            this.camera.currentKeyframe === CameraKey.ARCHIVE &&
            this.selectedIndex === index
        ) {
            this.openDiskFile(index);
            return;
        }
        if (this.selectedIndex !== index) {
            if (this.selectedIndex !== undefined) {
                this.liftDisk(this.selectedIndex, false);
            }
            this.selectedIndex = index;
        }
        this.setHovered(index);
        if (this.camera.currentKeyframe !== CameraKey.ARCHIVE) {
            this.focusing = true;
            this.camera.transition(CameraKey.ARCHIVE, 1100);
            new TWEEN.Tween({ progress: 0 })
                .to({ progress: 1 }, 1100)
                .onComplete(() => {
                    this.focusing = false;
                    this.refreshHoveredDisk();
                    this.hint.textContent = 'DISK FOCUSED · CLICK AGAIN TO READ FILE';
                    this.hint.style.display = 'block';
                })
                .start();
        }
    }

    private openDiskFile(index: number) {
        this.inserted = true;
        this.monitorScreen.setFocusLocked(true);
        this.ejecting = false;
        this.fileOpened = false;
        this.fallbackEjectButton.style.display = 'none';
        window.clearTimeout(this.fileOpenTimer);
        this.fileOpenTimer = window.setTimeout(() => {
            if (!this.inserted || this.fileOpened) return;
            // If a camera interruption cancelled the insert tweens, complete
            // the handoff and request the selected disk's own dossier again.
            this.disks[index].visible = false;
            this.camera.transition(CameraKey.MONITOR, 650);
            this.monitorScreen.openPersonFile(index);
            this.fileOpenTimer = window.setTimeout(() => {
                if (this.inserted && !this.fileOpened) {
                    this.fallbackEjectButton.style.display = 'block';
                }
            }, 1800);
        }, 3200);
        this.focusing = true;
        this.renderer.domElement.style.cursor = 'default';
        const disk = this.disks[index];
        this.rack.updateMatrixWorld(true);
        const start = disk.getWorldPosition(new THREE.Vector3());
        this.scene.attach(disk);
        this.camera.transition(CameraKey.DESK, 1350);

        new TWEEN.Tween(disk.position)
            .to({ x: start.x, y: start.y + 110, z: start.z + 300 }, 460)
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(() => {
                new TWEEN.Tween(disk.position)
                    .to({ x: this.slotPosition.x, y: this.slotPosition.y, z: 960 }, 900)
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .onComplete(() => {
                        new TWEEN.Tween(disk.position)
                            .to({ z: this.slotPosition.z }, 300)
                            .easing(TWEEN.Easing.Quadratic.In)
                            .onComplete(() => {
                                disk.visible = false;
                                this.camera.transition(CameraKey.MONITOR, 1200);
                                new TWEEN.Tween({ progress: 0 })
                                    .to({ progress: 1 }, 1200)
                                    .onComplete(() =>
                                        this.monitorScreen.openPersonFile(index)
                                    )
                                    .start();
                            })
                            .start();
                    })
                    .start();
            })
            .start();
        new TWEEN.Tween(disk.rotation)
            .to({ x: Math.PI / 2, y: 0 }, 520)
            .easing(TWEEN.Easing.Cubic.InOut)
            .start();
    }

    private purgeDisk(profileId?: unknown, returnPage?: string) {
        if (!this.inserted || this.ejecting || this.selectedIndex === undefined) return;
        const index = this.selectedIndex;
        const disk = this.disks[index];
        this.ejecting = true;
        this.purging = true;
        this.monitorScreen.setFocusLocked(true);
        this.fileOpened = false;
        window.clearTimeout(this.fileOpenTimer);
        this.fallbackEjectButton.style.display = 'none';
        this.monitorScreen.closePersonFile(returnPage);
        this.camera.transition(CameraKey.DESK, 1150);
        disk.visible = true;
        disk.position.copy(this.slotPosition);
        disk.rotation.set(Math.PI / 2, 0, 0);
        disk.scale.setScalar(1);

        let complete = false;
        let activeTween: { stop: () => unknown } | undefined;
        let safetyTimer = 0;
        const finishPurge = () => {
            if (complete) return;
            complete = true;
            window.clearTimeout(safetyTimer);
            activeTween?.stop();
            this.scene.remove(disk);
            disk.visible = false;
            disk.scale.setScalar(1);
            const directPurge = disk.userData.directPurge === true;
            if (!directPurge) this.purgedDisks.add(index);
            if (index >= CASE_COUNT && index < MAX_DISKS) {
                const slotOffset = index - CASE_COUNT;
                const activeProfileId = this.disks[index]?.userData.profileId;
                if (
                    typeof profileId === 'string' &&
                    (!activeProfileId || activeProfileId === profileId)
                ) {
                    this.createdProfileIds.delete(profileId);
                    this.createdDiskSlots[slotOffset] = null;
                    this.saveCreatedDiskSlots();
                    try {
                        const cache = JSON.parse(
                            window.localStorage.getItem('truth-terminal-disk-profiles-v1') || '{}'
                        );
                        delete cache[profileId];
                        window.localStorage.setItem(
                            'truth-terminal-disk-profiles-v1',
                            JSON.stringify(cache)
                        );
                    } catch {
                        // The record remains in cloud storage with its purged status.
                    }
                }
            }
            if (!directPurge) {
                try {
                    window.localStorage.setItem(
                        'truth-terminal-purged-disks-v1',
                        JSON.stringify(Array.from(this.purgedDisks))
                    );
                } catch {
                    // Keep the animation complete even when browser storage is unavailable.
                }
            }
            this.hotspots[index]?.remove();
            if (directPurge) {
                delete this.disks[index];
                delete this.hotspots[index];
                delete this.outlines[index];
                delete this.homeLocalPositions[index];
                delete this.homeLocalRotations[index];
            }
            this.reflowRackDisks();
            this.inserted = false;
            this.ejecting = false;
            this.purging = false;
            this.focusing = false;
            this.selectedIndex = undefined;
            this.setHovered(undefined);
            if (typeof profileId === 'string') {
                this.monitorScreen.iframe.contentWindow?.postMessage(
                    { type: 'character-disk-purged', profileId },
                    window.location.origin
                );
            }
            this.camera.transition(CameraKey.ARCHIVE, 1050);
            window.setTimeout(() => this.monitorScreen.setFocusLocked(false), 1100);
        };

        const launch = new TWEEN.Tween(disk.position)
            .to({ x: this.slotPosition.x, y: this.slotPosition.y, z: 960 }, 600)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(() => {
                const start = disk.position.clone();
                const end = this.purgeHolePosition.clone().add(new THREE.Vector3(0, 34, 0));
                const flightTime = 1.25;
                const gravity = 1500;
                const initialVerticalVelocity =
                    (end.y - start.y + 0.5 * gravity * flightTime * flightTime) /
                    flightTime;
                const flight = { progress: 0 };
                const flightTween = new TWEEN.Tween(flight)
                    .to({ progress: 1 }, flightTime * 1000)
                    .easing(TWEEN.Easing.Linear.None)
                    .onUpdate(() => {
                        const t = flight.progress * flightTime;
                        disk.position.set(
                            THREE.MathUtils.lerp(start.x, end.x, flight.progress),
                            start.y + initialVerticalVelocity * t - 0.5 * gravity * t * t,
                            THREE.MathUtils.lerp(start.z, end.z, flight.progress)
                        );
                        disk.rotation.set(
                            Math.PI / 2 + flight.progress * Math.PI * 3,
                            flight.progress * Math.PI * 4,
                            flight.progress * Math.PI * 2
                        );
                    })
                    .onComplete(() => {
                        const sink = { progress: 0 };
                        const sinkTween = new TWEEN.Tween(sink)
                            .to({ progress: 1 }, 520)
                            .easing(TWEEN.Easing.Quadratic.In)
                            .onUpdate(() => {
                                disk.position.y = end.y - sink.progress * 300;
                                disk.scale.setScalar(1 - sink.progress * 0.82);
                                disk.rotation.z += 0.035;
                            })
                            .onComplete(() => {
                                // Leave the disk visibly settled in the opening
                                // before returning to the archive camera.
                                window.setTimeout(finishPurge, 850);
                            });
                        activeTween = sinkTween;
                        sinkTween.start();
                    });
                activeTween = flightTween;
                flightTween.start();
            });
        activeTween = launch;
        launch.start();
        safetyTimer = window.setTimeout(finishPurge, 4300);
    }

    private eject() {
        if (!this.inserted || this.ejecting) return;
        const index = this.selectedIndex ?? 0;
        const disk = this.disks[index];
        const returnPosition = this.rack
            .localToWorld(this.homeLocalPositions[index].clone())
            .clone();
        let finished = false;
        let activePositionTween: { stop: () => unknown } | undefined;
        let activeRotationTween: { stop: () => unknown } | undefined;
        let safetyTimer = 0;
        const finishReturn = () => {
            if (finished) return;
            finished = true;
            window.clearTimeout(safetyTimer);
            activePositionTween?.stop();
            activeRotationTween?.stop();
            this.rack.updateMatrixWorld(true);
            this.rack.attach(disk);
            disk.position.copy(this.homeLocalPositions[index]);
            disk.rotation.copy(this.homeLocalRotations[index]);
            disk.visible = true;
            this.inserted = false;
            this.ejecting = false;
            this.fileOpened = false;
            this.fallbackEjectButton.style.display = 'none';
            this.focusing = false;
            this.setHovered(undefined);
            this.camera.transition(CameraKey.ARCHIVE, 1050);
            window.setTimeout(() => this.monitorScreen.setFocusLocked(false), 1100);
        };

        this.ejecting = true;
        this.monitorScreen.setFocusLocked(true);
        window.clearTimeout(this.fileOpenTimer);
        this.fallbackEjectButton.style.display = 'none';
        this.monitorScreen.closePersonFile();
        this.camera.transition(CameraKey.DESK, 1150);
        disk.visible = true;
        disk.position.copy(this.slotPosition);
        disk.rotation.set(Math.PI / 2, 0, 0);

        const returnToRack = () => {
            const tween = new TWEEN.Tween(disk.position)
                .to(
                    {
                        x: returnPosition.x,
                        y: returnPosition.y,
                        z: returnPosition.z,
                    },
                    1100
                )
                .easing(TWEEN.Easing.Cubic.InOut)
                .onComplete(finishReturn);
            activePositionTween = tween;
            tween.start();
        };

        const slideOut = new TWEEN.Tween(disk.position)
            .to({ x: this.slotPosition.x, y: this.slotPosition.y, z: 960 }, 650)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(returnToRack);
        activePositionTween = slideOut;
        slideOut.start();

        const rotateHome = new TWEEN.Tween(disk.rotation)
            .to({ x: 0, y: this.homeLocalRotations[index].y }, 650)
            .easing(TWEEN.Easing.Cubic.InOut);
        activeRotationTween = rotateHome;
        rotateHome.start();

        // If a tween is interrupted by a camera or tab transition, snap the
        // disk back to its recorded slot instead of leaving it detached.
        safetyTimer = window.setTimeout(finishReturn, 2400);
    }}
