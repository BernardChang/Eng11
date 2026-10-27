import * as THREE from 'three';
import Application from '../Application';

/** Places the supplied alarm clock on the desk beside the speakers. */
export default class DeskClock {
    application: Application;
    model: THREE.Group;

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

        const bounds = new THREE.Box3().setFromObject(this.model);
        const deskSurfaceY = -452;
        this.model.position.set(1250, deskSurfaceY - bounds.min.y, 600);
        this.application.scene.add(this.model);
    }
}
