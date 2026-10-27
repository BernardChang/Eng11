import * as THREE from 'three';
import Application from '../Application';
import Sizes from '../Utils/Sizes';
import EventEmitter from '../Utils/EventEmitter';
import TWEEN from '@tweenjs/tween.js';
import Renderer from '../Renderer';
import Resources from '../Utils/Resources';
import UIEventBus from '../UI/EventBus';
import Time from '../Utils/Time';
import {
    CameraKeyframeInstance,
    MonitorKeyframe,
    IdleKeyframe,
    LoadingKeyframe,
    DeskKeyframe,
    ArchiveKeyframe,
    CoffeeKeyframe,
} from './CameraKeyframes';

export enum CameraKey {
    IDLE = 'idle',
    MONITOR = 'monitor',
    LOADING = 'loading',
    DESK = 'desk',
    ARCHIVE = 'archive',
    COFFEE = 'coffee',
}
export default class Camera extends EventEmitter {
    application: Application;
    sizes: Sizes;
    scene: THREE.Scene;
    instance: THREE.PerspectiveCamera;
    renderer: Renderer;
    resources: Resources;
    time: Time;

    position: THREE.Vector3;
    focalPoint: THREE.Vector3;

    currentKeyframe: CameraKey | undefined;
    targetKeyframe: CameraKey | undefined;
    keyframes: { [key in CameraKey]: CameraKeyframeInstance };
    private archiveFocusPoint: THREE.Vector3 | undefined;

    constructor() {
        super();
        this.application = new Application();
        this.sizes = this.application.sizes;
        this.scene = this.application.scene;
        this.renderer = this.application.renderer;
        this.resources = this.application.resources;
        this.time = this.application.time;

        this.position = new THREE.Vector3(0, 0, 0);
        this.focalPoint = new THREE.Vector3(0, 0, 0);

        this.keyframes = {
            idle: new IdleKeyframe(),
            monitor: new MonitorKeyframe(),
            loading: new LoadingKeyframe(),
            desk: new DeskKeyframe(),
            archive: new ArchiveKeyframe(),
            coffee: new CoffeeKeyframe(),
        };
        this.updateMonitorFraming();

        document.addEventListener('mousedown', (event: MouseEvent & { inComputer?: boolean }) => {
            // MonitorScreen forwards clicks from the embedded webpage into the
            // scene so pointer tracking still works. Those clicks belong to the
            // website (including its nav); they must not toggle the 3D camera.
            if (event.inComputer) return;

            event.preventDefault();
            // print target and current keyframe
            if (
                this.currentKeyframe === CameraKey.IDLE ||
                this.targetKeyframe === CameraKey.IDLE
            ) {
                this.transition(CameraKey.DESK);
            } else if (
                this.currentKeyframe === CameraKey.DESK ||
                this.targetKeyframe === CameraKey.DESK
            ) {
                this.transition(CameraKey.IDLE);
            }
        });

        this.setPostLoadTransition();
        this.setInstance();
        this.setEventListeners();
    }

    transition(key: CameraKey, duration: number = 1000, easing?: any) {
        if (this.currentKeyframe === key) {
            if (
                key !== CameraKey.ARCHIVE ||
                this.focalPoint.distanceToSquared(this.keyframes.archive.focalPoint) < 1
            ) {
                return;
            }
        }

        if (key === CameraKey.MONITOR) this.updateMonitorFraming();
        if (key === CameraKey.ARCHIVE) this.updateArchiveFraming();

        if (this.targetKeyframe) TWEEN.removeAll();

        this.currentKeyframe = undefined;
        this.targetKeyframe = key;

        const keyframe = this.keyframes[key];
        const posTween = new TWEEN.Tween(this.position)
            .to(keyframe.position, duration)
            .easing(easing || TWEEN.Easing.Quintic.InOut)
            .onComplete(() => {
                this.currentKeyframe = key;
                this.targetKeyframe = undefined;
            });

        const focTween = new TWEEN.Tween(this.focalPoint)
            .to(keyframe.focalPoint, duration)
            .easing(easing || TWEEN.Easing.Quintic.InOut);

        posTween.start();
        focTween.start();
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(
            35,
            this.sizes.width / this.sizes.height,
            10,
            900000
        );
        this.currentKeyframe = CameraKey.LOADING;

        this.scene.add(this.instance);
    }

    setEventListeners() {
        this.on('enterMonitor', () => {
            const idling =
                this.currentKeyframe === CameraKey.IDLE ||
                this.targetKeyframe === CameraKey.IDLE;
            const easing = !idling
                ? TWEEN.Easing.Exponential.Out
                : TWEEN.Easing.Exponential.InOut;
            const duration = !idling ? 1000 : 1500;
            this.transition(CameraKey.MONITOR, duration, easing);
        });
        this.on('leftMonitor', () => {
            this.transition(CameraKey.DESK);
        });
    }

    setPostLoadTransition() {
        UIEventBus.on('loadingScreenDone', () => {
            this.transition(CameraKey.IDLE, 2500, TWEEN.Easing.Exponential.Out);
        });
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height;
        this.instance.updateProjectionMatrix();
        this.updateMonitorFraming();
        this.updateArchiveFraming();
    }

    updateMonitorFraming() {
        // Keep the complete display and a little of the computer bezel in
        // frame while preserving a readable, close monitor view.
        const aspect = this.sizes.width / this.sizes.height;
        const referenceDistance = 2200 - 255;
        const distance = referenceDistance * Math.max(1, 1.5 / aspect);
        this.keyframes.monitor.position.z = 255 + distance;
        if (this.currentKeyframe === CameraKey.MONITOR) {
            this.position.z = this.keyframes.monitor.position.z;
        }
    }

    updateArchiveFraming() {
        const aspect = this.sizes.width / this.sizes.height;
        const scale = Math.max(1, 1.5 / aspect);
        const defaultTarget = new THREE.Vector3(-1950, -210, 650);
        const target = this.archiveFocusPoint?.clone() || defaultTarget;
        const archiveViewDirection = new THREE.Vector3(1000, 590, 3200).normalize();
        const position = this.archiveFocusPoint
            ? target.clone().addScaledVector(archiveViewDirection, 1650 * scale)
            : target
                  .clone()
                  .add(new THREE.Vector3(1000, 590, 3200).multiplyScalar(scale));
        this.keyframes.archive.focalPoint.copy(target);
        this.keyframes.archive.position.copy(position);
    }

    focusArchivePoint(target: THREE.Vector3) {
        this.archiveFocusPoint = target.clone();
        this.updateArchiveFraming();
    }

    update() {
        for (const key in this.keyframes) {
            const _key = key as CameraKey;
            this.keyframes[_key].update();
        }
        TWEEN.update();

        if (this.currentKeyframe) {
            const keyframe = this.keyframes[this.currentKeyframe];
            this.position.copy(keyframe.position);
            this.focalPoint.copy(keyframe.focalPoint);
        }

        this.instance.position.copy(this.position);
        this.instance.lookAt(this.focalPoint);
    }
}
