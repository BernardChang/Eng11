import EventEmitter from './EventEmitter';

export default class Sizes extends EventEmitter {
    width: number;
    height: number;
    pixelRatio: number;

    constructor() {
        super();

        // Size the renderers to the actual fixed viewport layers. Using the
        // visual viewport can make a canvas smaller than the page at browser
        // zoom levels, leaving the unrendered area black.
        const readViewport = () => {
            const bounds = document
                .querySelector('#webgl')
                ?.getBoundingClientRect();
            return {
                width: Math.round(
                    bounds?.width || document.documentElement.clientWidth || window.innerWidth
                ),
                height: Math.round(
                    bounds?.height || document.documentElement.clientHeight || window.innerHeight
                ),
            };
        };
        const viewport = readViewport();
        this.width = viewport.width;
        this.height = viewport.height;
        this.pixelRatio = Math.min(window.devicePixelRatio, 2);

        // Resize event
        const resize = (_event?: Event, force = false) => {
            const currentViewport = readViewport();
            const width = currentViewport.width;
            const height = currentViewport.height;
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
        const viewportLayer = document.querySelector('#webgl');
        if (viewportLayer && 'ResizeObserver' in window) {
            new ResizeObserver(() => resize()).observe(viewportLayer);
        }

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
