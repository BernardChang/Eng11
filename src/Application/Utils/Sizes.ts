import EventEmitter from './EventEmitter';

export default class Sizes extends EventEmitter {
    width: number;
    height: number;
    pixelRatio: number;

    constructor() {
        super();

        // Setup
        const viewport = window.visualViewport;
        this.width = viewport?.width || document.documentElement.clientWidth || window.innerWidth;
        this.height = viewport?.height || window.innerHeight;
        this.pixelRatio = Math.min(window.devicePixelRatio, 2);

        // Resize event
        const resize = (_event?: Event, force = false) => {
            const currentViewport = window.visualViewport;
            const width = currentViewport?.width || document.documentElement.clientWidth || window.innerWidth;
            const height = currentViewport?.height || window.innerHeight;
            const pixelRatio = Math.min(window.devicePixelRatio, 2);
            const changed =
                width !== this.width ||
                height !== this.height ||
                pixelRatio !== this.pixelRatio;
            this.width = width;
            this.height = height;
            this.pixelRatio = pixelRatio;

            if (changed || force) this.trigger('resize');
        };
        window.addEventListener('resize', resize);
        window.visualViewport?.addEventListener('resize', resize);
        window.addEventListener('orientationchange', resize);

        // Some browsers settle their available viewport just after the app's
        // first frame. Re-sync then so the scene and its HTML layers cannot
        // retain an initial, vertically offset canvas size.
        const syncAfterFrame = () =>
            requestAnimationFrame(() => resize(undefined, true));
        syncAfterFrame();
        window.setTimeout(syncAfterFrame, 250);
        window.setTimeout(syncAfterFrame, 1000);
    }
}
