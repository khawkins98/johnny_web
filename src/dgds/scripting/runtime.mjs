/**
 * Instance-owned DGDS process runtime.
 *
 * This is the migration boundary between the script/scene engine and its host.
 * It deliberately does not schedule animation frames or create browser
 * services. Drawing and audio are still injected presenter dependencies; those
 * become logical machine operations in a later extraction.
 */
import { loadResourceEntry } from '../resource.mjs';
import { PALETTE } from '../../scrantic/palette.mjs';
import { canRunTtmScene, prepareTtmScene } from './scene-factory.mjs';
import { composeTtmFrame } from './composition.mjs';
import { traceEvent } from './trace.mjs';
import { ExecutionStatus, pendingExecution } from './execution-outcome.mjs';
import { clearContext, drawBackground } from './frame-renderer.mjs';
import { debugLog, runScript } from './script-runner.mjs';
import { presentSurfaceFrameOperation } from './surface-frame-presenter.mjs';

const createStoredSurface = surfaceFactory => ({
    surface: surfaceFactory(),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    canDraw: false,
});

export class DgdsRuntime {
    constructor(initialState) {
        if (typeof initialState?.surfaceFactory !== 'function') {
            throw new TypeError('DgdsRuntime requires an injected surfaceFactory');
        }
        if (!initialState?.timingCompatibility) {
            throw new TypeError('DgdsRuntime requires an injected timingCompatibility profile');
        }
        if (typeof initialState?.random !== 'function') {
            throw new TypeError('DgdsRuntime requires an injected random function');
        }

        const { random, surfaceFactory } = initialState;
        this.state = {
            currentScene: 0,
            scenesRes: [],
            scenes: [],
            scenesRandom: [],
            addScenes: [],
            removeScenes: [],
            bkgScreen: null,
            bkgRes: null,
            bkgOcean: [],
            bkgRaft: null,
            cloudIdx: 15 + Math.floor(random() * 3),
            cloudX: Math.floor(random() * 640),
            cloudY: Math.floor(random() * 80),
            cloudElapsed: 0,
            data: null,
            context: null,
            surface: null,
            mainContext: null,
            save: [],
            saveIndex: 0,
            saveBkg: [],
            audioOperations: [],
            frameOperations: [],
            presentFrameOperation: presentSurfaceFrameOperation,
            slot: 0,
            res: [],
            reentry: 0,
            elapsedTimer: 0,
            delay: 0,
            waitTicks: 0,
            frameReady: false,
            frameBoundary: null,
            timer: 0,
            continue: true,
            island: 1,
            foregroundColor: PALETTE[0],
            backgroundColor: PALETTE[0],
            clip: { x: 0, y: 0, width: 640, height: 480 },
            type: null,
            skip: false,
            randomize: false,
            purge: false,
            played: false,
            runs: 0,
            lastCommand: false,
            playedHistory: new Set(),
            orMode: false,
            orChainPassed: false,
            frameDelta: 0,
            trace: null,
            tick: 0,
            playbackRate: 1,
            speedRemainder: 0,
            ttmEnvironments: new Map(),
            reentryNow: 0,
            jumpTo: undefined,
            fadingOut: false,
            fadingIn: false,
            fadeOpacity: 0,
            ...initialState,
        };

        this.state.save = Array.from({ length: 3 }, () => createStoredSurface(surfaceFactory));
        this.state.saveBkg = [createStoredSurface(surfaceFactory)];
        this.state.surface ||= surfaceFactory();

        if (this.state.type === 'ADS') {
            this.#loadAdsResources();
        }
    }

    #loadAdsResources() {
        const state = this.state;
        debugLog(`ADS cycle starting: ${state.data.scenes.length} scenes in "${state.data?.name ?? '?'}"`);
        state.data.resources.forEach(resource => {
            const entry = state.entries.find(candidate => candidate.name === resource.name);
            if (entry !== undefined) {
                state.scenesRes[resource.id] = loadResourceEntry(entry);
            }
        });
        debugLog('scenesRes:', state.scenesRes
            .map((resource, index) => resource ? `[${index}]=${resource.name}` : null)
            .filter(Boolean)
            .join(', '));
    }

    describe() {
        const state = this.state;
        return {
            type: state.type,
            currentAdsScene: state.currentScene,
            activeScenes: state.scenes.map(scene => ({
                sceneIdx: scene.sceneIdx,
                tagId: scene.tagId,
                lifecycle: scene.lifecycle,
                execution: scene.execution?.status || null,
            })),
            timingCompatibility: state.timingCompatibility ? {
                profile: state.timingCompatibility.profile,
                patches: state.timingCompatibility.patchNames,
            } : null,
        };
    }

    tick(frameDelta) {
        this.state.audioOperations.length = 0;
        this.state.frameOperations.length = 0;
        this.state.tick++;
        this.state.frameDelta = frameDelta;
        const completed = this.#runScripts();
        return Object.freeze({
            completed,
            audioOperations: Object.freeze([...this.state.audioOperations]),
            frameOperations: Object.freeze([...this.state.frameOperations]),
        });
    }

    #renderPipeline() {
        const state = this.state;
        composeTtmFrame(state);

        state.mainContext.clearRect(0, 0, 640, 480);
        const bgState = state.scenes.find(scene => scene?.state?.bkgScreen)?.state ?? state;
        drawBackground(bgState, state.mainContext);

        if (state.fadingOut || state.fadingIn) {
            state.context.fillStyle = `rgba(0, 0, 0, ${state.fadeOpacity})`;
            state.context.fillRect(0, 0, 640, 480);

            if (state.fadingOut && state.fadeOpacity >= 1) {
                state.fadingOut = false;
            } else if (state.fadingIn) {
                state.fadeOpacity -= state.frameDelta / 400;
                if (state.fadeOpacity <= 0) {
                    state.fadingIn = false;
                    state.fadeOpacity = 0;
                }
            }
        }

        if (state.surface?.canvas) {
            state.context.drawImage(state.surface.canvas, 0, 0);
        }
    }

    #runAdsController() {
        const state = this.state;
        let completed = false;
        const scene = state.data.scenes[state.currentScene];

        if (scene !== undefined) {
            const previousScene = state.currentScene;
            const execution = runScript(state, scene.script, true);
            completed = execution.status === ExecutionStatus.COMPLETED;
            if (state.currentScene !== previousScene) {
                const tagInfo = state.data.scenes[state.currentScene]?.tagId;
                const tagDescription = !tagInfo ? 'done'
                    : typeof tagInfo === 'object' ? `${tagInfo.id}:${tagInfo.description}`
                    : tagInfo;
                debugLog(`Scene ${state.currentScene}/${state.data.scenes.length} started (${tagDescription})`);

                if (state.fadeOpacity >= 1) {
                    state.fadingOut = false;
                    state.fadingIn = true;
                    state.fadeOpacity = 1;
                } else {
                    state.fadingOut = false;
                    state.fadeOpacity = 0;
                }
            }
        } else if (state.scenes.length === 0 && state.addScenes.length === 0) {
            debugLog('ADS cycle complete');
            completed = true;
        }

        return completed;
    }

    #runTtmController() {
        const rootState = this.state;
        rootState.scenes.forEach(scene => {
            const isEnvironmentOwner = scene.environment?.owner === scene;
            if (!canRunTtmScene(scene)) return;
            prepareTtmScene(scene);

            if (scene.state.waitTicks > 0) {
                scene.state.waitTicks--;
                if (scene.state.waitTicks > 0) {
                    scene.execution = pendingExecution(scene.state, 'compatibility-delay');
                    return;
                }
                scene.state.frameReady = true;
            }

            if (scene.lifecycle !== 'completed') {
                scene.lifecycle = 'running';
                scene.execution = runScript(scene.state, scene.state.script || scene.script);
                if (scene.execution.frameBoundary) {
                    const mapped = rootState.timingCompatibility.mapFrameBoundary(
                        scene.execution.frameBoundary,
                        { sceneIdx: scene.sceneIdx, tagId: scene.tagId },
                    );
                    scene.state.waitTicks = mapped.runtimeDelayTicks;
                    traceEvent(scene.state, 'frame-timing-map', mapped);
                }
                if (isEnvironmentOwner && !scene.environment.ready
                    && scene.state.reentry >= (scene.prologueLength || 0)) {
                    scene.environment.ready = true;
                }
                if (scene.execution.status === ExecutionStatus.COMPLETED) {
                    if (scene.retries > 0) {
                        scene.retries--;
                        scene.state.played = false;
                        scene.state.reentry = scene.targetStart || 0;
                        scene.state.delay = 0;
                        scene.state.waitTicks = 0;
                        scene.state.frameReady = false;
                        scene.state.frameBoundary = null;
                        scene.state.timer = 0;
                        scene.execution = pendingExecution(scene.state, 'retry');
                    } else {
                        scene.lifecycle = 'completed';
                    }
                }
            }
            if (scene.state.timer > 0) scene.state.timer--;
        });
    }

    #runScripts() {
        const state = this.state;
        if (state.type === 'ADS') {
            clearContext(state.context);
            const completed = this.#runAdsController();
            const scene = state.data.scenes[state.currentScene];
            if (!state.continue || scene === undefined) {
                this.#runTtmController();
                this.#renderPipeline();
            }
            return completed;
        }

        if (state.island) drawBackground(state, state.mainContext);
        return runScript(state, state.data.scripts).status === ExecutionStatus.COMPLETED;
    }

    jumpToScene(tagId) {
        const state = this.state;
        if (state.type !== 'ADS') return false;
        const sceneIndex = state.data.scenes.findIndex(scene => scene.tagId?.id === tagId);
        if (sceneIndex === -1) return false;

        traceEvent(state, 'runtime-control', { action: 'jump-to-scene', tagId });
        state.currentScene = sceneIndex;
        state.scenes = [];
        state.addScenes = [];
        state.removeScenes = [];
        state.scenesRandom = [];
        state.playedHistory.clear();
        state.ttmEnvironments = new Map();
        state.continue = true;
        state.reentry = 0;
        state.jumpTo = undefined;
        state.lastCommand = false;
        state.orMode = false;
        state.orChainPassed = false;
        state.fadingOut = false;
        state.fadingIn = false;
        state.fadeOpacity = 0;
        state.surface?.clear();
        if (state.saveBkg?.[0]) state.saveBkg[0].canDraw = false;
        if (state.context) clearContext(state.context);
        debugLog(`DEBUG: jumped to scene ${tagId} (index ${sceneIndex})`);
        return true;
    }

    stepScene(direction) {
        const state = this.state;
        if (state.type !== 'ADS') return;
        const scenes = state.data.scenes.filter(scene => scene.tagId?.id);
        const currentTag = state.data.scenes[state.currentScene]?.tagId?.id;
        const currentIndex = Math.max(0, scenes.findIndex(scene => scene.tagId.id === currentTag));
        const nextIndex = Math.max(0, Math.min(scenes.length - 1, currentIndex + Math.sign(direction)));
        this.jumpToScene(scenes[nextIndex]?.tagId.id);
    }

    setNightMode(isNight) {
        const state = this.state;
        if (state.type !== 'ADS') return;
        state.isNightMode = isNight;
        const oceanIdx = isNight ? 3 : state.compatibility.randomInt(0, 2);
        if (state.bkgOcean.length > 0) state.bkgScreen = state.bkgOcean[oceanIdx];
        state.scenes.forEach(scene => {
            if (scene.state?.bkgOcean?.length > 0) {
                scene.state.bkgScreen = scene.state.bkgOcean[oceanIdx];
            }
        });
        if (state.mainContext) {
            const bgState = state.scenes.find(scene => scene?.state?.bkgScreen)?.state ?? state;
            drawBackground(bgState, state.mainContext);
        }
    }

    setPlaybackRate(rate) {
        const state = this.state;
        if (!Number.isFinite(rate)) return;
        state.playbackRate = Math.max(0.25, Math.min(4, rate));
        state.speedRemainder = 0;
        traceEvent(state, 'runtime-control', {
            action: 'playback-rate',
            rate: state.playbackRate,
        });
    }

    getPresentation() {
        const state = this.state;
        const tag = state.data?.scenes?.[state.currentScene]?.tagId;
        return {
            scene: tag?.id ?? null,
            name: tag?.description ?? '',
            playbackRate: state.playbackRate,
        };
    }
}
