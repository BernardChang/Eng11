import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import Application from '../Application';
import Camera, { CameraKey } from '../Camera/Camera';
import MonitorScreen from './MonitorScreen';

const CASE_COUNT = 6;

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
    homePosition: THREE.Vector3;
    driveSlot: THREE.Group;
    readonly slotPosition = new THREE.Vector3(350, -220, 690);
    inserted = false;
    selectedIndex: number | undefined;
    private hoveredIndex: number | undefined;
    private hint: HTMLDivElement;
    private focusing = false;
    private pointerPosition = new THREE.Vector2(-1, -1);

    constructor(monitorScreen: MonitorScreen) {
        this.application = new Application();
        this.camera = this.application.camera;
        this.monitorScreen = monitorScreen;
        this.scene = this.application.scene;
        this.renderer = this.application.renderer.instance;
        this.homePosition = new THREE.Vector3(-1380, -500, 650);

        this.rack = this.createRack();
        this.rack.position.copy(this.homePosition);
        this.scene.add(this.rack);
        this.driveSlot = this.createDriveSlot();
        this.scene.add(this.driveSlot);

        this.hint = document.createElement('div');
        this.hint.textContent = 'SELECT A PERSONNEL DISK';
        this.hint.style.cssText =
            'position:fixed;display:none;z-index:10003;pointer-events:none;padding:9px 13px;background:#111;color:#fff;border:1px solid #fff;font:12px monospace;letter-spacing:.08em;';
        document.body.appendChild(this.hint);
        window.addEventListener('mousemove', (event) => {
            this.pointerPosition.set(event.clientX, event.clientY);
        });
        window.addEventListener('message', this.onMessage);
    }

    private createRack(): THREE.Group {
        const rack = new THREE.Group();
        rack.name = 'personnelDiskRack';

        const orange = new THREE.MeshBasicMaterial({ color: 0xb95a21 });
        const orangeLight = new THREE.MeshBasicMaterial({ color: 0xd17432 });
        const darkCase = new THREE.MeshBasicMaterial({ color: 0x171817 });
        const edge = new THREE.LineBasicMaterial({ color: 0x4e4b43 });

        const addBox = (
            name: string,
            size: [number, number, number],
            position: [number, number, number],
            material: THREE.Material,
            parent: THREE.Group = rack
        ) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxBufferGeometry(...size),
                material
            );
            mesh.name = name;
            mesh.position.set(...position);
            mesh.userData.hardDiskTarget = true;
            parent.add(mesh);
            return mesh;
        };

        // Orange molded holder: a shallow tray with two raised end supports.
        addBox('diskTrayBase', [850, 58, 270], [0, 29, 0], orange);
        addBox('diskTrayFrontLip', [850, 76, 32], [0, 75, 133], orangeLight);
        addBox('diskTrayBackLip', [850, 104, 32], [0, 89, -133], orange);
        addBox('diskTrayLeftSupport', [48, 175, 280], [-401, 115, 0], orangeLight);
        addBox('diskTrayRightSupport', [48, 175, 280], [401, 115, 0], orangeLight);

        for (let index = 0; index < CASE_COUNT; index++) {
            const x = (index - (CASE_COUNT - 1) / 2) * 112;
            const caseGroup = new THREE.Group();
            caseGroup.name = `personnelDisk${index + 1}`;
            const diskHomeY = 112 + index % 2 * 3;
            caseGroup.position.set(x, diskHomeY, -20 + index * 4);
            caseGroup.userData.homeY = diskHomeY;
            this.homeLocalPositions.push(caseGroup.position.clone());
            rack.add(caseGroup);
            this.disks.push(caseGroup);

            const body = addBox(
                `diskCase${index + 1}`,
                [102, 370, 55],
                [0, 185, 0],
                darkCase,
                caseGroup
            );
            caseGroup.add(
                new THREE.LineSegments(
                    new THREE.EdgesGeometry(body.geometry),
                    edge
                )
            );
            const outline = new THREE.LineSegments(
                new THREE.EdgesGeometry(body.geometry),
                new THREE.LineBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 1,
                    depthTest: false,
                })
            );
            outline.position.copy(body.position);
            outline.visible = false;
            outline.renderOrder = 10;
            caseGroup.add(outline);
            this.outlines.push(outline);

            const labelCanvas = document.createElement('canvas');
            labelCanvas.width = 256;
            labelCanvas.height = 400;
            const context = labelCanvas.getContext('2d');
            if (context) {
                context.fillStyle = '#e7e0ce';
                context.fillRect(0, 0, 256, 400);
                context.strokeStyle = '#b5ab96';
                context.lineWidth = 8;
                context.strokeRect(9, 9, 238, 382);
                context.fillStyle = '#8d3c32';
                context.font = 'bold 19px monospace';
                context.textAlign = 'center';
                context.fillText('MINISTRY OF TRUTH', 128, 49);
                context.fillStyle = '#39372f';
                context.font = 'bold 27px monospace';
                context.fillText('PERSON FILE', 128, 101);
                context.font = 'bold 38px Georgia';
                const fallbackNames = [
                    'OGILVY',
                    'MARA VENN',
                    'TOMAS WREN',
                    'ELIA NORTH',
                    'PAVEL SORN',
                    'IRIS BELL',
                ];
                let savedName: string | undefined;
                try {
                    const saved = JSON.parse(
                        localStorage.getItem('truth-terminal-profiles-v4') || '{}'
                    );
                    savedName = saved.profiles?.[index]?.name;
                } catch {}
                context.font = 'bold 30px Georgia';
                context.fillText(
                    (savedName || fallbackNames[index]).toUpperCase().slice(0, 14),
                    128,
                    180,
                    220
                );
                context.font = '21px monospace';
                context.fillText(`MTR-0041-${index + 1}`, 128, 223);
                context.fillStyle = '#8c8577';
                context.fillRect(47, 265, 162, 5);
                for (let bar = 0; bar < 14; bar++) {
                    const width = bar % 3 === 0 ? 6 : 3;
                    context.fillStyle = '#39372f';
                    context.fillRect(58 + bar * 10, 296, width, 52);
                }
                context.fillStyle = '#625e54';
                context.font = '15px monospace';
                context.fillText('AUTHORIZED COPY', 128, 375);
            }
            const labelTexture = new THREE.CanvasTexture(labelCanvas);
            labelTexture.encoding = THREE.sRGBEncoding;
            const label = new THREE.Mesh(
                new THREE.PlaneBufferGeometry(78, 145),
                new THREE.MeshBasicMaterial({ map: labelTexture })
            );
            label.name = `diskLabel${index + 1}`;
            label.position.set(0, 201, 28.5);
            label.userData.hardDiskTarget = true;
            caseGroup.add(label);
        }

        // Front-facing rack label makes the prop legible from the desk view.
        const badge = document.createElement('canvas');
        badge.width = 640;
        badge.height = 96;
        const badgeContext = badge.getContext('2d');
        if (badgeContext) {
            badgeContext.fillStyle = '#e7e0ce';
            badgeContext.fillRect(0, 0, badge.width, badge.height);
            badgeContext.fillStyle = '#342f28';
            badgeContext.font = 'bold 29px monospace';
            badgeContext.textAlign = 'center';
            badgeContext.fillText('SELECT A PERSONNEL DISK', 320, 59);
        }
        const badgeTexture = new THREE.CanvasTexture(badge);
        badgeTexture.encoding = THREE.sRGBEncoding;
        const badgeMesh = new THREE.Mesh(
            new THREE.PlaneBufferGeometry(440, 66),
            new THREE.MeshBasicMaterial({ map: badgeTexture })
        );
        badgeMesh.name = 'diskRackLabel';
        badgeMesh.position.set(0, 75, 151);
        badgeMesh.userData.hardDiskTarget = true;
        rack.add(badgeMesh);

        this.disks.forEach((disk, index) => this.createDiskHotspot(index));
        return rack;
    }

    /** Adds a small, visible drive opening to the front of the retro computer. */
    private createDriveSlot(): THREE.Group {
        const slot = new THREE.Group();
        slot.name = 'personnelDiskDriveSlot';
        slot.position.set(350, -220, 746);
        const frame = new THREE.Mesh(
            new THREE.BoxBufferGeometry(430, 118, 24),
            new THREE.MeshBasicMaterial({ color: 0x4a4841 })
        );
        const opening = new THREE.Mesh(
            new THREE.BoxBufferGeometry(390, 74, 8),
            new THREE.MeshBasicMaterial({ color: 0x080908 })
        );
        opening.position.z = 15;
        const inner = new THREE.Mesh(
            new THREE.BoxBufferGeometry(366, 8, 3),
            new THREE.MeshBasicMaterial({ color: 0x8b897e })
        );
        inner.position.set(0, 22, 20);
        const statusLight = new THREE.Mesh(
            new THREE.BoxBufferGeometry(12, 12, 4),
            new THREE.MeshBasicMaterial({ color: 0x9d332b })
        );
        statusLight.position.set(198, 0, 17);
        slot.add(frame, opening, inner, statusLight);
        return slot;
    }

    private createDiskHotspot(index: number) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', `Select personnel disk ${index + 1}`);
        button.title = `Personnel disk ${index + 1} — hover to inspect, click to focus`;
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
        this.hotspots.push(button);
    }

    private setHovered(index: number | undefined) {
        if (this.hoveredIndex === index) return;
        if (this.hoveredIndex !== undefined) this.liftDisk(this.hoveredIndex, false);
        if (index !== undefined) this.liftDisk(index, true);
        this.hoveredIndex = index;
        this.outlines.forEach((outline, outlineIndex) => {
            outline.visible = outlineIndex === index;
        });
        if (index === undefined) {
            this.hint.style.display = 'none';
        } else {
            this.hint.textContent = `DISK ${String(index + 1).padStart(2, '0')} · CLICK TO FOCUS`;
            this.hint.style.display = 'block';
        }
    }

    private refreshHoveredDisk() {
        const index = this.hotspots.findIndex((hotspot) => {
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
        const homeY = disk.userData.homeY as number;
        new TWEEN.Tween(disk.position)
            .to({ y: homeY + (raised ? 78 : 0) }, 230)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();
    }

    update() {
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
            event.origin !== window.location.origin ||
            event.data?.type !== 'eject-hard-disk'
        ) {
            return;
        }
        this.eject();
    };

    private selectDisk(index: number) {
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
                })
                .start();
        }
    }

    private openDiskFile(index: number) {
        this.inserted = true;
        this.focusing = true;
        this.renderer.domElement.style.cursor = 'default';
        const disk = this.disks[index];
        this.rack.updateMatrixWorld(true);
        const start = disk.getWorldPosition(new THREE.Vector3());
        this.scene.attach(disk);
        this.camera.transition(CameraKey.DESK, 1350);

        new TWEEN.Tween(disk.position)
            .to({ x: start.x, y: start.y + 145, z: start.z + 140 }, 360)
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(() => {
                new TWEEN.Tween(disk.position)
                    .to({ x: this.slotPosition.x, y: this.slotPosition.y, z: 810 }, 940)
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
                new TWEEN.Tween(disk.rotation)
                    .to({ z: -Math.PI / 2 }, 650)
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .start();
            })
            .start();
    }

    private eject() {
        if (!this.inserted) return;
        const index = this.selectedIndex ?? 0;
        const disk = this.disks[index];
        const returnPosition = this.rack
            .localToWorld(this.homeLocalPositions[index].clone())
            .clone();
        this.monitorScreen.closePersonFile();
        this.camera.transition(CameraKey.DESK, 1150);
        disk.visible = true;
        disk.position.copy(this.slotPosition);
        disk.rotation.set(0, 0, -Math.PI / 2);
        new TWEEN.Tween(disk.position)
            .to({ x: this.slotPosition.x, y: this.slotPosition.y, z: 810 }, 260)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(() => {
                new TWEEN.Tween(disk.position)
                    .to(
                        {
                            x: returnPosition.x,
                            y: returnPosition.y,
                            z: returnPosition.z,
                        },
                        1100
                    )
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .onComplete(() => {
                        new TWEEN.Tween(disk.rotation)
                            .to({ z: 0 }, 500)
                            .onComplete(() => {
                                this.rack.attach(disk);
                                disk.position.copy(this.homeLocalPositions[index]);
                                disk.rotation.set(0, 0, 0);
                            this.inserted = false;
                            this.focusing = false;
                                this.camera.transition(CameraKey.ARCHIVE, 1050);
                            })
                            .start();
                    })
                    .start();
            })
            .start();
    }
}
