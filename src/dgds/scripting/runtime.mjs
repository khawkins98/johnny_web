/**
 * Instance-owned DGDS process runtime.
 *
 * This is the migration boundary between the script/scene engine and its host.
 * It deliberately does not schedule animation frames or create browser
 * services. Opcode drawing and audio are emitted as logical operations, while
 * deterministic retained pixels preserve synchronous DGDS GET/PUT semantics.
 */
import { PALETTE } from '../palette.mjs';
import { canRunTtmScene } from './scene-factory.mjs';
import { traceEvent } from './trace.mjs';
import { ExecutionStatus, pendingExecution } from './execution-outcome.mjs';
import { clearAdsSceneBatch, debugLog, runScript, sceneLabel, sceneLog } from './script-runner.mjs';
import { presentSurfaceFrameOperation } from './surface-frame-presenter.mjs';
import { pruneEnvironmentBackground } from './composition.mjs';
import { selectOceanIndex } from './background-resources.mjs';
import { isTtmFinished, TtmRunMode, TtmRunState } from './ttm-run-state.mjs';
import { sequenceKey, sequencePaintIndex } from './ttm-sequence-order.mjs';

const createStoredSurface = (surfaceFactory) => ({
    surface: surfaceFactory(),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    canDraw: false,
    revision: 0,
});

const expandAdsScript = (data, script, stack = []) =>
    script.flatMap((command) => {
        if (command.opcode !== 0xf200) return [command];
        const tagId = command.params[0];
        if (stack.includes(tagId)) {
            throw new RangeError(`Recursive ADS RUN_SCRIPT chain: ${[...stack, tagId].join(' -> ')}`);
        }
        const target = data.scenes.find((scene) => scene.tagId?.id === tagId);
        if (!target) throw new RangeError(`ADS RUN_SCRIPT target ${tagId} does not exist in "${data.name}"`);
        return expandAdsScript(
            data,
            target.script.filter((nested) => nested.opcode !== 0xffff),
            [...stack, tagId],
        );
    });

export class DgdsRuntime {
    #adsScripts = [];

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
        if (typeof initialState?.resourceProvider?.resolve !== 'function') {
            throw new TypeError('DgdsRuntime requires an injected resourceProvider');
        }

        const runtimeInitialState = { ...initialState };
        for (const hostKey of [
            'context',
            'mainContext',
            'audioManager',
            'onComplete',
            'entries',
            'compatibility',
            'presentationPolicy',
        ]) {
            delete runtimeInitialState[hostKey];
        }
        const { random, surfaceFactory } = runtimeInitialState;
        const cloudFrames = runtimeInitialState.game?.background?.cloud?.frames || [0];
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
            cloudIdx: cloudFrames[Math.floor(random() * cloudFrames.length)] ?? cloudFrames[0],
            cloudX: Math.floor(random() * 640),
            cloudY: Math.floor(random() * 80),
            cloudElapsed: 0,
            data: null,
            surface: null,
            save: [],
            saveIndex: 0,
            saveBkg: [],
            audioOperations: [],
            frameOperations: [],
            presentFrameOperation: presentSurfaceFrameOperation,
            slot: 0,
            res: [],
            reentry: 0,
            delay: 0,
            waitTicks: 0,
            frameReady: false,
            frameBoundary: null,
            timer: 0,
            continue: true,
            backgroundId: 1,
            foregroundColor: PALETTE[0],
            backgroundColor: PALETTE[0],
            clip: { x: 0, y: 0, width: 640, height: 480 },
            type: null,
            skip: false,
            randomize: false,
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
            ttmSequenceOrder: [],
            activeAdsScript: null,
            reentryNow: 0,
            jumpTo: undefined,
            fadingOut: false,
            fadingIn: false,
            fadeOpacity: 0,
            ...runtimeInitialState,
        };

        this.state.saveBkg = [createStoredSurface(surfaceFactory)];
        this.state.surface ||= surfaceFactory();

        if (this.state.type === 'ADS') {
            this.#adsScripts = this.state.data.scenes.map((scene) =>
                expandAdsScript(this.state.data, scene.script, [scene.tagId?.id]),
            );
            this.#loadAdsResources();
            this.#selectInitialAdsScene();
        }
    }

    #loadAdsResources() {
        const state = this.state;
        debugLog(`ADS cycle starting: ${state.data.scenes.length} scenes in "${state.data?.name ?? '?'}"`);
        state.data.resources.forEach((resource) => {
            const decoded = state.resourceProvider.resolve(resource.name);
            if (decoded !== undefined) {
                state.scenesRes[resource.id] = decoded;
                for (const sequence of decoded.scenes || []) {
                    state.ttmSequenceOrder.push(sequenceKey(resource.id, sequence.tagId));
                }
            }
        });
        debugLog(
            'scenesRes:',
            state.scenesRes
                .map((resource, index) => (resource ? `[${index}]=${resource.name}` : null))
                .filter(Boolean)
                .join(', '),
        );
    }

    #selectInitialAdsScene() {
        const state = this.state;
        if (state.adsSceneTag == null) return;

        const sceneIndex = state.data.scenes.findIndex((scene) => scene.tagId?.id === state.adsSceneTag);
        if (sceneIndex === -1) {
            throw new RangeError(`ADS scene ${state.adsSceneTag} does not exist in "${state.data.name}"`);
        }
        state.currentScene = sceneIndex;
        state.adsSceneEnd = state.singleAdsScene ? sceneIndex + 1 : null;
    }

    describe() {
        const state = this.state;
        return {
            type: state.type,
            game: state.game
                ? {
                      id: state.game.id,
                      version: state.game.version,
                  }
                : null,
            currentAdsScene: state.currentScene,
            activeScenes: state.scenes.map((scene) => ({
                sceneIdx: scene.sceneIdx,
                tagId: scene.tagId,
                runState: scene.runState,
                execution: scene.execution?.status || null,
            })),
            timingCompatibility: state.timingCompatibility
                ? {
                      profile: state.timingCompatibility.profile,
                      patches: state.timingCompatibility.patchNames,
                  }
                : null,
        };
    }

    tick(frameDelta) {
        this.state.audioOperations.length = 0;
        this.state.frameOperations.length = 0;
        this.state.tick++;
        this.state.frameDelta = frameDelta;
        const execution = this.#runScripts();
        return Object.freeze({
            completed: execution.completed,
            presentation: execution.presentation,
            audioOperations: Object.freeze([...this.state.audioOperations]),
            frameOperations: Object.freeze([...this.state.frameOperations]),
        });
    }

    #runAdsController() {
        const state = this.state;
        let completed = false;
        if (state.adsSceneEnd != null && state.currentScene >= state.adsSceneEnd) {
            const blockers = state.scenes.filter((scene) => {
                const done = isTtmFinished(scene);
                const unboundedLoop =
                    scene.runMode === TtmRunMode.KEEP_GOING ||
                    (scene.execution?.status === ExecutionStatus.LOOPED &&
                        scene.retries === 0 &&
                        !Number.isFinite(scene.timeLimitTicks));
                return !done && !unboundedLoop;
            });
            if (blockers.length === 0 && state.addScenes.length === 0) {
                clearAdsSceneBatch(state);
                state.continue = true;
                debugLog(`ADS selected scene complete in "${state.data?.name ?? '?'}"`);
                return true;
            }
            // Do not enter the next ADS tag while the selected tag's concluding
            // children are still running. Keep presenting and ticking their TTMs.
            state.continue = false;
            return false;
        }
        const scene = state.data.scenes[state.currentScene];

        if (scene !== undefined) {
            const previousScene = state.currentScene;
            state.activeAdsScript = this.#adsScripts[state.currentScene];
            const execution = runScript(state, state.activeAdsScript, true);
            completed = execution.status === ExecutionStatus.COMPLETED;
            if (
                state.adsSceneEnd != null &&
                state.currentScene >= state.adsSceneEnd &&
                (state.scenes.length > 0 || state.addScenes.length > 0)
            ) {
                // END has stopped ADS interpretation, but the selected tag's
                // final child batch still owns the presentation.
                state.continue = false;
                completed = false;
            }
            if (state.currentScene !== previousScene) {
                const tagInfo = state.data.scenes[state.currentScene]?.tagId;
                const tagDescription = !tagInfo
                    ? 'done'
                    : typeof tagInfo === 'object'
                      ? `${tagInfo.id}:${tagInfo.description}`
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
        // Draw order == z-order. Tick scenes in the MUTABLE TTM paint order so
        // MOVE_SEQUENCE_TO_BACK re-layers correctly: later-painted scenes draw
        // over earlier ones on the shared raster.
        const ordered = [...rootState.scenes].sort(
            (a, b) => sequencePaintIndex(rootState, a) - sequencePaintIndex(rootState, b),
        );
        ordered.forEach((scene) => {
            if (!isTtmFinished(scene) && Number.isFinite(scene.timeLimitTicks)) {
                scene.timeLimitTicks--;
                if (scene.timeLimitTicks <= 0) {
                    scene.state.played = true;
                    scene.state.waitTicks = 0;
                    scene.runState = TtmRunState.FINISHED;
                    sceneLog(scene.state, 'TIME_LIMIT', sceneLabel(rootState.scenesRes, scene.sceneIdx, scene.tagId));
                    return;
                }
            }
            const isEnvironmentOwner = scene.environment?.owner === scene;
            if (!canRunTtmScene(scene)) return;
            if (scene.state.waitTicks > 0) {
                scene.runState = TtmRunState.WAITING;
                scene.state.waitTicks--;
                if (scene.state.waitTicks > 0) {
                    scene.execution = pendingExecution(scene.state, 'compatibility-delay');
                    return;
                }
                scene.state.frameReady = true;
            }

            if (!isTtmFinished(scene)) {
                scene.runState = TtmRunState.RUNNING;
                scene.execution = runScript(scene.state, scene.state.script || scene.script);
                if (scene.execution.frameBoundary) {
                    const mapped = rootState.timingCompatibility.mapFrameBoundary(scene.execution.frameBoundary, {
                        sceneIdx: scene.sceneIdx,
                        tagId: scene.tagId,
                    });
                    scene.state.waitTicks = mapped.runtimeDelayTicks;
                    traceEvent(scene.state, 'frame-timing-map', mapped);
                }
                if (
                    isEnvironmentOwner &&
                    !scene.environment.ready &&
                    scene.state.reentry >= (scene.prologueLength || 0)
                ) {
                    scene.environment.ready = true;
                }
                if (scene.execution.status === ExecutionStatus.COMPLETED) {
                    const repeatsUntilTimeLimit = scene.runMode === TtmRunMode.TIME_LIMITED;
                    const repeatsUntilStopped = scene.runMode === TtmRunMode.KEEP_GOING;
                    if (scene.retries > 0 || repeatsUntilTimeLimit || repeatsUntilStopped) {
                        if (scene.retries > 0) scene.retries--;
                        scene.state.played = false;
                        scene.state.reentry = scene.targetStart || 0;
                        scene.state.delay = 0;
                        scene.state.waitTicks = 0;
                        scene.state.frameReady = false;
                        scene.state.frameBoundary = null;
                        scene.state.timer = 0;
                        scene.execution = pendingExecution(
                            scene.state,
                            repeatsUntilTimeLimit
                                ? 'time-limited-retry'
                                : repeatsUntilStopped
                                  ? 'restart-until-stopped'
                                  : 'retry',
                        );
                        scene.runState = TtmRunState.RUNNING;
                    } else {
                        scene.runState = TtmRunState.FINISHED;
                    }
                }
            }
            if (scene.state.timer > 0) scene.state.timer--;
        });
    }

    #runScripts() {
        const state = this.state;
        if (state.type === 'ADS') {
            const completed = this.#runAdsController();
            const scene = state.data.scenes[state.currentScene];
            const compose = !state.continue || scene === undefined;
            if (compose) {
                this.#runTtmController();
            }
            return {
                completed,
                presentation: Object.freeze({
                    // ADS controller-only ticks do not replace the retained
                    // framebuffer. Clearing here exposes the background until
                    // the next TTM frame and causes visible actor flashes.
                    clearForeground: false,
                    backgroundOnly: false,
                    compose,
                }),
            };
        }

        return {
            completed: runScript(state, state.data.scripts).status === ExecutionStatus.COMPLETED,
            presentation: Object.freeze({
                clearForeground: false,
                backgroundOnly: Boolean(state.backgroundId),
                compose: false,
            }),
        };
    }

    jumpToScene(tagId) {
        const state = this.state;
        if (state.type !== 'ADS') return false;
        const sceneIndex = state.data.scenes.findIndex((scene) => scene.tagId?.id === tagId);
        if (sceneIndex === -1) return false;

        traceEvent(state, 'runtime-control', { action: 'jump-to-scene', tagId });
        state.currentScene = sceneIndex;
        state.scenes = [];
        state.addScenes = [];
        state.removeScenes = [];
        state.scenesRandom = [];
        state.playedHistory.clear();
        // Prune stored backgrounds on the OLD environment map before discarding it,
        // so a persistent background does not survive the jump onto the raster.
        for (const sceneIdx of state.ttmEnvironments?.keys?.() || []) pruneEnvironmentBackground(state, sceneIdx);
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
        debugLog(`DEBUG: jumped to scene ${tagId} (index ${sceneIndex})`);
        return true;
    }

    stepScene(direction) {
        const state = this.state;
        if (state.type !== 'ADS') return;
        const scenes = state.data.scenes.filter((scene) => scene.tagId?.id);
        const currentTag = state.data.scenes[state.currentScene]?.tagId?.id;
        const currentIndex = Math.max(
            0,
            scenes.findIndex((scene) => scene.tagId.id === currentTag),
        );
        const nextIndex = Math.max(0, Math.min(scenes.length - 1, currentIndex + Math.sign(direction)));
        this.jumpToScene(scenes[nextIndex]?.tagId.id);
    }

    setNightMode(isNight) {
        const state = this.state;
        if (state.type !== 'ADS') return;
        state.isNightMode = isNight;
        // A Johnny host selection owns day/night in titleState. Keep that
        // presentation contract in sync with the legacy runtime control so
        // drawBackground does not immediately override the selected ocean.
        if (state.titleState) state.titleState = Object.freeze({ ...state.titleState, night: isNight });
        const oceanIdx = selectOceanIndex(state, isNight);
        if (oceanIdx < 0) return;
        if (state.bkgOcean.length > 0) state.bkgScreen = state.bkgOcean[oceanIdx];
        state.scenes.forEach((scene) => {
            if (scene.state?.titleState) {
                scene.state.titleState = Object.freeze({ ...scene.state.titleState, night: isNight });
            }
            if (scene.state?.bkgOcean?.length > 0) {
                scene.state.bkgScreen = scene.state.bkgOcean[oceanIdx];
            }
        });
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
