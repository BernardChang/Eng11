import * as THREE from 'three';
import Application from '../Application';
import { CameraKey } from '../Camera/Camera';

/** Places the supplied alarm clock on the desk beside the speakers. */
export default class DeskClock {
    application: Application;
    model: THREE.Group;
    private hourHand: THREE.Group;
    private minuteHand: THREE.Group;
    private readonly startedAt = performance.now();
    private readonly dialCenter = new THREE.Vector3(
        0,
        (0.5419967 + 2.9325514) / 2,
        0.4652037
    );
    private focusHotspot: HTMLButtonElement;
    private focusHint: HTMLDivElement;

    constructor(source: LoadedModel) {
        this.application = new Application();
        this.model = source.scene.clone(true);
        this.model.name = 'deskAlarmClock';
        this.model.scale.setScalar(105);

        this.model.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            child.castShadow = true;
            child.receiveShadow = true;
            const convert = (material: THREE.Material) => {
                const sourceMaterial = material as THREE.MeshStandardMaterial;
                const color =
                    material.name === 'Clock'
                        ? 0x252629
                        : material.name === 'Silver'
                          ? 0x8d8e8c
                          : 0xffffff;
                return new THREE.MeshBasicMaterial({
                    name: material.name,
                    color,
                    map: sourceMaterial.map || null,
                    side: THREE.DoubleSide,
                    transparent: sourceMaterial.transparent,
                    opacity: sourceMaterial.opacity,
                });
            };
            child.material = Array.isArray(child.material)
                ? child.material.map(convert)
                : convert(child.material);
        });

        // The dial is modeled in the clock's local XY plane. Add independent
        // hands above the baked dial so they can keep time in the scene.
        const dialCenterY = (0.5419967 + 2.9325514) / 2;
        const dialFrontZ = 0.4652037 + 0.012;
        const handMaterial = new THREE.MeshBasicMaterial({
            color: 0x252629,
            side: THREE.DoubleSide,
            depthTest: true,
        });
        this.hourHand = this.createHand(0.075, 0.56, dialCenterY, dialFrontZ, handMaterial);
        this.minuteHand = this.createHand(0.052, 0.83, dialCenterY, dialFrontZ + 0.008, handMaterial);
        this.model.add(this.hourHand, this.minuteHand);

        const bounds = new THREE.Box3().setFromObject(this.model);
        const deskSurfaceY = -452;
        this.model.position.set(1250, deskSurfaceY - bounds.min.y, 600);
        // Turn the dial slightly toward the camera's left-of-center view.
        this.model.rotation.y = -0.22;
        this.application.scene.add(this.model);

        // Keep the clock independently zoomable, with its hint shown only while
        // the pointer is actually over the clock face.
        this.model.updateMatrixWorld(true);
        const focusPoint = this.dialCenter.clone().applyMatrix4(this.model.matrixWorld);
        const faceNormal = new THREE.Vector3(0, 0, 1)
            .transformDirection(this.model.matrixWorld)
            .normalize();
        const clockFrame = this.application.camera.keyframes.clock;
        clockFrame.focalPoint.copy(focusPoint);
        clockFrame.position.copy(focusPoint).addScaledVector(faceNormal, 650);

        this.focusHotspot = document.createElement('button');
        this.focusHotspot.type = 'button';
        this.focusHotspot.setAttribute('aria-label', 'Zoom into clock');
        Object.assign(this.focusHotspot.style, {
            position: 'fixed',
            display: 'none',
            width: '112px',
            height: '112px',
            padding: '0',
            border: '0',
            borderRadius: '50%',
            background: 'transparent',
            cursor: 'zoom-in',
            zIndex: '10000',
        });
        this.focusHotspot.addEventListener('pointerenter', () => {
            this.focusHint.style.display = 'block';
        });
        this.focusHotspot.addEventListener('pointerleave', () => {
            this.focusHint.style.display = 'none';
        });
        this.focusHotspot.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        this.focusHotspot.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const camera = this.application.camera;
            const zoomed =
                camera.currentKeyframe === CameraKey.CLOCK ||
                camera.targetKeyframe === CameraKey.CLOCK;
            camera.transition(zoomed ? CameraKey.DESK : CameraKey.CLOCK, 1000);
            this.updateFocusHint(zoomed);
        });
        document.body.appendChild(this.focusHotspot);

        this.focusHint = document.createElement('div');
        this.focusHint.textContent = 'CLICK TO ZOOM IN';
        Object.assign(this.focusHint.style, {
            position: 'fixed',
            display: 'none',
            padding: '8px 12px',
            color: '#fff',
            background: '#111',
            border: '2px solid #fff',
            font: '700 14px/1.2 monospace',
            letterSpacing: '0.1em',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: '10001',
        });
        document.body.appendChild(this.focusHint);
        this.update();
    }

    private updateFocusHint(zoomed: boolean) {
        this.focusHint.textContent = 'CLICK TO ZOOM IN';
        this.focusHotspot.setAttribute(
            'aria-label',
            zoomed ? 'Zoom into clock' : 'Return to desk view'
        );
        this.focusHotspot.style.cursor = zoomed ? 'zoom-in' : 'zoom-out';
    }

    private createHand(
        width: number,
        length: number,
        centerY: number,
        frontZ: number,
        material: THREE.Material
    ): THREE.Group {
        const pivot = new THREE.Group();
        pivot.position.set(0, centerY, frontZ);
        const hand = new THREE.Mesh(
            new THREE.BoxBufferGeometry(width, length, 0.018),
            material
        );
        hand.position.y = length / 2;
        hand.renderOrder = 4;
        pivot.add(hand);
        return pivot;
    }

    update() {
        // One in-world day passes every three real minutes. A 12-hour dial
        // therefore completes two turns on the hour hand and 24 on the minute.
        const dayProgress = ((performance.now() - this.startedAt) % 180_000) / 180_000;
        // Start at the dial's baked-in 10:10 pose, then keep advancing.
        this.hourHand.rotation.z = (Math.PI * 11) / 36 - Math.PI * 4 * dayProgress;
        this.minuteHand.rotation.z = -Math.PI / 3 - Math.PI * 48 * dayProgress;

        this.updateFocusHotspot();
    }

    private updateFocusHotspot() {
        const camera = this.application.camera;
        const visibleView = [
            camera.currentKeyframe,
            camera.targetKeyframe,
        ].some(
            (key) =>
                key === CameraKey.IDLE ||
                key === CameraKey.DESK ||
                key === CameraKey.CLOCK
        );
        if (!visibleView) {
            this.focusHotspot.style.display = 'none';
            this.focusHint.style.display = 'none';
            return;
        }

        const canvas = this.application.renderer.instance.domElement.getBoundingClientRect();
        this.model.updateMatrixWorld(true);
        camera.instance.updateMatrixWorld(true);
        const projected = this.dialCenter
            .clone()
            .applyMatrix4(this.model.matrixWorld)
            .project(camera.instance);
        if (
            projected.z < -1 ||
            projected.z > 1 ||
            projected.x < -1.2 ||
            projected.x > 1.2 ||
            projected.y < -1.2 ||
            projected.y > 1.2
        ) {
            this.focusHotspot.style.display = 'none';
            this.focusHint.style.display = 'none';
            return;
        }

        const centerX = canvas.left + ((projected.x + 1) / 2) * canvas.width;
        const centerY = canvas.top + ((1 - projected.y) / 2) * canvas.height;
        this.focusHotspot.style.left = `${centerX - 56}px`;
        this.focusHotspot.style.top = `${centerY - 56}px`;
        this.focusHotspot.style.display = 'block';
        this.focusHint.style.left = `${centerX + 48}px`;
        this.focusHint.style.top = `${centerY + 38}px`;
        this.focusHint.style.display = this.focusHotspot.matches(':hover')
            ? 'block'
            : 'none';

        const zoomed =
            camera.currentKeyframe === CameraKey.CLOCK ||
            camera.targetKeyframe === CameraKey.CLOCK;
        this.updateFocusHint(zoomed);
    }

}
