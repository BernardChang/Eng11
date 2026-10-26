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
    readonly slotPosition = new THREE.Vector3(500, -220, 500);
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
        this.homePosition = new THREE.Vector3(-1950, -500, 650);

        this.rack = this.createRack();
        this.rack.position.copy(this.homePosition);
        this.scene.add(this.rack);

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
        const floppyModel = this.application.resources.items.gltfModel
            .floppyDiskModel.scene;

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
        addBox('diskTrayBase', [2550, 58, 250], [0, 29, 0], orange);
        addBox('diskTrayFrontLip', [2550, 76, 32], [0, 75, 123], orangeLight);
        addBox('diskTrayBackLip', [2550, 104, 32], [0, 89, -123], orange);
        addBox('diskTrayLeftSupport', [48, 175, 260], [-1230, 115, 0], orangeLight);
        addBox('diskTrayRightSupport', [48, 175, 260], [1230, 115, 0], orangeLight);

        for (let index = 0; index < CASE_COUNT; index++) {
            const x = (index - (CASE_COUNT - 1) / 2) * 390;
            const caseGroup = new THREE.Group();
            caseGroup.name = `personnelDisk${index + 1}`;
            const diskHomeY = 245;
            caseGroup.position.set(x, diskHomeY, -20 + index * 4);
            caseGroup.userData.homeY = diskHomeY;
            this.homeLocalPositions.push(caseGroup.position.clone());
            rack.add(caseGroup);
            this.disks.push(caseGroup);

            const model = floppyModel.clone(true);
            model.name = `floppyModel${index + 1}`;
            model.rotation.z = -Math.PI / 2;
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
            const outline = new THREE.LineSegments(
                new THREE.EdgesGeometry(
                    new THREE.BoxBufferGeometry(378, 342, 30)
                ),
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
            this.outlines.push(outline);

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
            badgeContext.fillText('SELECT A FLOPPY DISK', 320, 59);
        }
        const badgeTexture = new THREE.CanvasTexture(badge);
        badgeTexture.encoding = THREE.sRGBEncoding;
        const badgeMesh = new THREE.Mesh(
            new THREE.PlaneBufferGeometry(620, 66),
            new THREE.MeshBasicMaterial({ map: badgeTexture })
        );
        badgeMesh.name = 'diskRackLabel';
        badgeMesh.position.set(0, 75, 151);
        badgeMesh.userData.hardDiskTarget = true;
        rack.add(badgeMesh);

        this.disks.forEach((disk, index) => this.createDiskHotspot(index));
        return rack;
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
            .to({ x: Math.PI / 2 }, 520)
            .easing(TWEEN.Easing.Cubic.InOut)
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
        disk.rotation.set(Math.PI / 2, 0, 0);
        new TWEEN.Tween(disk.position)
            .to({ x: this.slotPosition.x, y: this.slotPosition.y, z: 960 }, 650)
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
                        this.rack.attach(disk);
                        disk.position.copy(this.homeLocalPositions[index]);
                        disk.rotation.set(0, 0, 0);
                        this.inserted = false;
                        this.focusing = false;
                        this.camera.transition(CameraKey.ARCHIVE, 1050);
                    })
                    .start();
                new TWEEN.Tween(disk.rotation)
                    .to({ x: 0 }, 520)
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .start();
            })
            .start();
    }
}
