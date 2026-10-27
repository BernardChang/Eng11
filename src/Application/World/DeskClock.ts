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
    private focusHotspot: HTMLButtonElement;
    private focusHint: HTMLDivElement;
    private readonly dialCenter = new THREE.Vector3(
        0,
        (0.5419967 + 2.9325514) / 2,
        0.4652037
    );

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
        this.model.updateMatrixWorld(true);
        const focus = this.dialCenter.clone().applyMatrix4(this.model.matrixWorld);
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.model.matrixWorld);
        const clockFrame = this.application.camera.keyframes[CameraKey.CLOCK];
        clockFrame.focalPoint.copy(focus);
        clockFrame.position.copy(focus).addScaledVector(normal, 650);

        this.focusHotspot = document.createElement('button');
        this.focusHotspot.type = 'button';
        this.focusHotspot.setAttribute('aria-label', 'Zoom into the clock');
        this.focusHotspot.title = 'Zoom into the clock';
        this.focusHotspot.style.cssText =
            'position:fixed;display:none;width:116px;height:116px;padding:0;border:0;border-radius:50%;background:transparent;cursor:zoom-in;z-index:10006;';
        this.focusHotspot.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        this.focusHotspot.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const focused =
                this.application.camera.currentKeyframe === CameraKey.CLOCK ||
                this.application.camera.targetKeyframe === CameraKey.CLOCK;
            this.application.camera.transition(
                focused ? CameraKey.DESK : CameraKey.CLOCK,
                1000
            );
        });
        document.body.appendChild(this.focusHotspot);

        this.focusHint = document.createElement('div');
        this.focusHint.textContent = 'CLICK CLOCK TO ZOOM';
        this.focusHint.style.cssText =
            'position:fixed;display:none;z-index:10007;pointer-events:none;padding:7px 10px;background:#111;color:#fff;border:1px solid #fff;font:10px monospace;letter-spacing:.08em;white-space:nowrap;';
        document.body.appendChild(this.focusHint);
        this.update();
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
        const allowedViews = [CameraKey.IDLE, CameraKey.DESK, CameraKey.CLOCK];
        if (
            !(camera.currentKeyframe && allowedViews.includes(camera.currentKeyframe)) &&
            !(camera.targetKeyframe && allowedViews.includes(camera.targetKeyframe))
        ) {
            this.focusHotspot.style.display = 'none';
            this.focusHint.style.display = 'none';
            return;
        }

        this.model.updateMatrixWorld(true);
        camera.instance.updateMatrixWorld(true);
        const point = this.dialCenter
            .clone()
            .applyMatrix4(this.model.matrixWorld)
            .project(camera.instance);
        if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1) {
            this.focusHotspot.style.display = 'none';
            this.focusHint.style.display = 'none';
            return;
        }

        const canvas = this.application.renderer.instance.domElement.getBoundingClientRect();
        const x = canvas.left + ((point.x + 1) / 2) * canvas.width;
        const y = canvas.top + ((1 - point.y) / 2) * canvas.height;
        this.focusHotspot.style.left = `${x - 58}px`;
        this.focusHotspot.style.top = `${y - 58}px`;
        this.focusHotspot.style.cursor =
            camera.currentKeyframe === CameraKey.CLOCK || camera.targetKeyframe === CameraKey.CLOCK
                ? 'zoom-out'
                : 'zoom-in';
        this.focusHotspot.setAttribute(
            'aria-label',
            camera.currentKeyframe === CameraKey.CLOCK || camera.targetKeyframe === CameraKey.CLOCK
                ? 'Return to the desk view'
                : 'Zoom into the clock'
        );
        this.focusHotspot.title =
            camera.currentKeyframe === CameraKey.CLOCK || camera.targetKeyframe === CameraKey.CLOCK
                ? 'Return to the desk view'
                : 'Zoom into the clock';
        this.focusHotspot.style.display = 'block';
        const isFocused =
            camera.currentKeyframe === CameraKey.CLOCK || camera.targetKeyframe === CameraKey.CLOCK;
        this.focusHint.textContent = isFocused ? 'CLICK TO RETURN TO DESK' : 'CLICK CLOCK TO ZOOM';
        this.focusHint.style.left = `${x + 54}px`;
        this.focusHint.style.top = `${y + 50}px`;
        this.focusHint.style.display = 'block';
    }
}
