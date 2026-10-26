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
    hotspot: HTMLButtonElement;
    homePosition: THREE.Vector3;
    inserted = false;

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

        this.hotspot = document.createElement('button');
        this.hotspot.type = 'button';
        this.hotspot.setAttribute(
            'aria-label',
            'Insert personnel disk into the computer'
        );
        this.hotspot.title = 'Click to insert personnel disk';
        this.hotspot.style.cssText =
            'position:fixed;display:none;opacity:0;background:transparent;border:0;padding:0;z-index:10002;cursor:pointer;pointer-events:auto;';
        this.hotspot.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        });
        this.hotspot.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.insert();
        });
        document.body.appendChild(this.hotspot);
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
            caseGroup.position.set(x, 112 + index % 2 * 3, -20 + index * 4);
            rack.add(caseGroup);

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
                context.fillText(index === 0 ? 'OGILVY' : 'ARCHIVE', 128, 180);
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
            badgeContext.fillText('PERSONNEL DISKS  /  CLICK TO LOAD', 320, 59);
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

        return rack;
    }

    update() {
        const deskIsVisible = [
            this.camera.currentKeyframe,
            this.camera.targetKeyframe,
        ].some((key) => key === CameraKey.IDLE || key === CameraKey.DESK);
        if (this.inserted || !this.rack.visible || !deskIsVisible) {
            this.hotspot.style.display = 'none';
            return;
        }

        this.rack.updateMatrixWorld(true);
        this.camera.instance.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(this.rack);
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
        if (projected.every((point) => point.z > 1 || point.z < -1)) {
            this.hotspot.style.display = 'none';
            return;
        }

        const visible = projected.filter(
            (point) => point.z > -1 && point.z < 1
        );
        if (visible.length === 0) {
            this.hotspot.style.display = 'none';
            return;
        }
        const minX = Math.min(...visible.map((point) => point.x));
        const maxX = Math.max(...visible.map((point) => point.x));
        const minY = Math.min(...visible.map((point) => point.y));
        const maxY = Math.max(...visible.map((point) => point.y));
        const canvas = this.renderer.domElement.getBoundingClientRect();
        const left = canvas.left + ((minX + 1) / 2) * canvas.width;
        const top = canvas.top + ((1 - maxY) / 2) * canvas.height;
        const width = Math.max(56, ((maxX - minX) / 2) * canvas.width);
        const height = Math.max(52, ((maxY - minY) / 2) * canvas.height);

        if (
            maxX < -1 ||
            minX > 1 ||
            maxY < -1 ||
            minY > 1
        ) {
            this.hotspot.style.display = 'none';
            return;
        }

        this.hotspot.style.left = `${Math.max(canvas.left, left - 7)}px`;
        this.hotspot.style.top = `${Math.max(canvas.top, top - 7)}px`;
        this.hotspot.style.width = `${Math.min(width + 14, canvas.width)}px`;
        this.hotspot.style.height = `${Math.min(height + 14, canvas.height)}px`;
        this.hotspot.style.display = 'block';
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

    private insert() {
        this.inserted = true;
        this.renderer.domElement.style.cursor = 'default';
        this.camera.transition(CameraKey.MONITOR, 1500);

        new TWEEN.Tween(this.rack.position)
            .to({ x: 0, y: 930, z: 310 }, 1350)
            .easing(TWEEN.Easing.Cubic.InOut)
            .onComplete(() => {
                this.rack.visible = false;
                this.monitorScreen.openPersonFile();
            })
            .start();
    }

    private eject() {
        if (!this.inserted) return;
        this.monitorScreen.closePersonFile();
        this.camera.transition(CameraKey.DESK, 1400);
        this.rack.visible = true;
        this.rack.position.set(0, 930, 310);

        new TWEEN.Tween(this.rack.position)
            .to(this.homePosition, 1350)
            .easing(TWEEN.Easing.Cubic.InOut)
            .onComplete(() => {
                this.inserted = false;
            })
            .start();
    }
}
