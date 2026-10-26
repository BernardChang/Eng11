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
    private readonly purgeHolePosition = new THREE.Vector3(-1050, -410, 850);
    private purging = false;
    private pointerPosition = new THREE.Vector2(-1, -1);

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
                    if (Number.isInteger(index) && index >= 0 && index < CASE_COUNT) {
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
        this.purgeHole = this.createPurgeHole();
        this.scene.add(this.purgeHole);
        this.disks.forEach((disk, index) => {
            if (this.purgedDisks.has(index)) {
                disk.visible = false;
                this.hotspots[index].style.display = 'none';
            }
        });

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
        window.addEventListener('message', this.onMessage);
    }

    private createPurgeHole(): THREE.Group {
        const hole = new THREE.Group();
        hole.name = 'deskPurgeHole';
        hole.position.copy(this.purgeHolePosition);
        const rimMaterial = new THREE.MeshBasicMaterial({ color: 0x20201e });
        const throatMaterial = new THREE.MeshBasicMaterial({
            color: 0x050505,
            side: THREE.DoubleSide,
        });
        const base = new THREE.Mesh(
            new THREE.CylinderBufferGeometry(325, 340, 28, 48),
            rimMaterial
        );
        base.position.y = -4;
        hole.add(base);
        const throat = new THREE.Mesh(
            new THREE.CylinderBufferGeometry(285, 190, 240, 48, 1, true),
            throatMaterial
        );
        throat.position.y = -130;
        hole.add(throat);
        const bottom = new THREE.Mesh(
            new THREE.CircleBufferGeometry(190, 48),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        bottom.rotation.x = -Math.PI / 2;
        bottom.position.y = -250;
        hole.add(bottom);
        const lip = new THREE.Mesh(
            new THREE.TorusBufferGeometry(280, 22, 12, 48),
            rimMaterial
        );
        lip.rotation.x = Math.PI / 2;
        lip.position.y = 12;
        hole.add(lip);
        return hole;
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
        const base = new THREE.Mesh(
            new THREE.BoxBufferGeometry(620, 58, 500),
            orange
        );
        base.name = 'diskTrayBase';
        base.position.y = 29;
        rack.add(base);
        const sideWalls = new THREE.BoxBufferGeometry(620, 105, 36);
        const leftWall = new THREE.Mesh(sideWalls, orangeLight);
        leftWall.name = 'diskTrayLeftWall';
        leftWall.position.set(0, 66, -232);
        rack.add(leftWall);
        const rightWall = new THREE.Mesh(sideWalls, orangeLight);
        rightWall.name = 'diskTrayRightWall';
        rightWall.position.set(0, 66, 232);
        rack.add(rightWall);
        for (let divider = -2; divider <= 2; divider++) {
            const rib = new THREE.Mesh(
                new THREE.BoxBufferGeometry(8, 14, 462),
                orangeLight
            );
            rib.name = `diskSlotDivider${divider + 3}`;
            rib.position.set(divider * 72, 64, 0);
            rack.add(rib);
        }

        for (let index = 0; index < CASE_COUNT; index++) {
            const caseGroup = new THREE.Group();
            caseGroup.name = `personnelDisk${index + 1}`;
            const diskHomeY = 245;
            const diskHomeX = (index - (CASE_COUNT - 1) / 2) * 72;
            caseGroup.position.set(diskHomeX, diskHomeY, 0);
            caseGroup.rotation.set(0, Math.PI / 2, 0);
            caseGroup.userData.homeY = diskHomeY;
            this.homeLocalPositions.push(caseGroup.position.clone());
            this.homeLocalRotations.push(caseGroup.rotation.clone());
            rack.add(caseGroup);
            this.disks.push(caseGroup);

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
            const outline = new THREE.LineSegments(
                new THREE.EdgesGeometry(
                    new THREE.BoxBufferGeometry(342, 378, 30)
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
            event.origin !== window.location.origin
        ) {
            return;
        }
        if (event.data?.type === 'person-file-opened') {
            if (event.data.diskIndex === this.selectedIndex) {
                this.fileOpened = true;
                window.clearTimeout(this.fileOpenTimer);
                this.fallbackEjectButton.style.display = 'none';
            }
            return;
        }
        if (event.data?.type === 'eject-hard-disk') this.eject();
        if (event.data?.type === 'purge-hard-disk') this.purgeDisk();
    };

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
                })
                .start();
        }
    }

    private openDiskFile(index: number) {
        this.inserted = true;
        this.ejecting = false;
        this.fileOpened = false;
        this.fallbackEjectButton.style.display = 'none';
        window.clearTimeout(this.fileOpenTimer);
        this.fileOpenTimer = window.setTimeout(() => {
            if (this.inserted && !this.fileOpened) {
                this.fallbackEjectButton.style.display = 'block';
            }
        }, 4500);
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

    private purgeDisk() {
        if (!this.inserted || this.ejecting || this.selectedIndex === undefined) return;
        const index = this.selectedIndex;
        const disk = this.disks[index];
        this.ejecting = true;
        this.purging = true;
        this.fileOpened = false;
        window.clearTimeout(this.fileOpenTimer);
        this.fallbackEjectButton.style.display = 'none';
        this.monitorScreen.closePersonFile();
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
            this.purgedDisks.add(index);
            try {
                window.localStorage.setItem(
                    'truth-terminal-purged-disks-v1',
                    JSON.stringify(Array.from(this.purgedDisks))
                );
            } catch {
                // Keep the animation complete even when browser storage is unavailable.
            }
            this.hotspots[index].style.display = 'none';
            this.inserted = false;
            this.ejecting = false;
            this.purging = false;
            this.focusing = false;
            this.selectedIndex = undefined;
            this.setHovered(undefined);
            this.camera.transition(CameraKey.ARCHIVE, 1050);
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
                            .onComplete(finishPurge);
                        activeTween = sinkTween;
                        sinkTween.start();
                    });
                activeTween = flightTween;
                flightTween.start();
            });
        activeTween = launch;
        launch.start();
        safetyTimer = window.setTimeout(finishPurge, 3200);
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
        };

        this.ejecting = true;
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
