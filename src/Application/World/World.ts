import Application from '../Application';
import Resources from '../Utils/Resources';
import ComputerSetup from './Computer';
import MonitorScreen from './MonitorScreen';
import Environment from './Environment';
import Decor from './Decor';
import CoffeeSteam from './CoffeeSteam';
import Cursor from './Cursor';
import Hitboxes from './Hitboxes';
import HardDisk from './HardDisk';
import DeskClock from './DeskClock';
import AudioManager from '../Audio/AudioManager';
export default class World {
    application: Application;
    scene: THREE.Scene;
    resources: Resources;

    // Objects in the scene
    environment: Environment;
    decor: Decor;
    computerSetup: ComputerSetup;
    monitorScreen: MonitorScreen;
    hardDisk: HardDisk;
    deskClock: DeskClock;
    coffeeSteam: CoffeeSteam;
    cursor: Cursor;
    audioManager: AudioManager;

    constructor() {
        this.application = new Application();
        this.scene = this.application.scene;
        this.resources = this.application.resources;
        // Wait for resources
        this.resources.on('ready', () => {
            // Setup
            this.environment = new Environment();
            this.decor = new Decor();
            this.computerSetup = new ComputerSetup();
            this.monitorScreen = new MonitorScreen();
            this.hardDisk = new HardDisk(this.monitorScreen);
            this.deskClock = new DeskClock(
                this.resources.items.gltfModel.deskAlarmClockModel
            );
            this.coffeeSteam = new CoffeeSteam();
            const coffeeCup = this.resources.items.gltfModel.decorModel.scene.getObjectByName(
                'coffee'
            );
            if (coffeeCup) {
                this.hardDisk.animateCoffeeCup(coffeeCup, this.coffeeSteam.model.mesh);
            }
            this.audioManager = new AudioManager();
            // const hb = new Hitboxes();
            // this.cursor = new Cursor();
        });
    }

    update() {
        if (this.monitorScreen) this.monitorScreen.update();
        if (this.hardDisk) this.hardDisk.update();
        if (this.deskClock) this.deskClock.update();
        if (this.environment) this.environment.update();
        if (this.coffeeSteam) this.coffeeSteam.update();
    }
}
