import * as THREE from 'three';
import Application from '../Application';

/** Places the supplied alarm clock on the desk beside the speakers. */
export default class DeskClock {
    application: Application;
    model: THREE.Group;
    private hourHand: THREE.Group;
    private minuteHand: THREE.Group;
    private readonly startedAt = performance.now();

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
    }
}
