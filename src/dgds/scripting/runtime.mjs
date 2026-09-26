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
import { traceEvent } from './trace-event.mjs';
import { ExecutionStatus, pendingExecution } from './execution-outcome.mjs';
import { debugLog, runScript, sceneLabel, sceneLog } from './script-runner.mjs';
import { createAdsProgram, isAdsTagEnded, resetAdsProgram, stepAdsProgram } from './ads-walker.mjs';
import { presentSurfaceFrameOperation } from './surface-frame-presenter.mjs';
import { clearAdsSceneBatch, resetAdsDisplayList } from './ads-scene-changes.mjs';
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

export class DgdsRuntime {
    // The ADS tag table (ads-walker.mjs): one record per tag with the binary's
    // flag word and WHILE resume point. `#adsProgramScene` is the currentScene
    // index the table was last (re)armed for; a change (a jump, or a free-run
    // advance to the next tag) re-arms it with that tag fresh.
    #adsProgram = null;
    #adsProgramScene = -1;

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
            // The binary's per-node "ever ADDed" counter (+0x2d), as the set of
            // (slot:tag) keys ADDed since the gag started; IF_NOT_PLAYED reads it.
            adsAdded: new Set(),
            adsTagEnded: false,
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
            continue: true,
            backgroundId: 1,
            foregroundColor: PALETTE[0],
            backgroundColor: PALETTE[0],
            clip: { x: 0, y: 0, width: 640, height: 480 },
            type: null,
            skip: false,
            played: false,
            runs: 0,
            lastCommand: false,
            // Diagnostic record of every (slot:tag) a gag ran (filled when the
            // display list is cleared or a node is stopped). No ADS condition
            // reads it: the binary has no latched "played" state.
            playedHistory: new Set(),
            frameDelta: 0,
            trace: null,
            tick: 0,
            playbackRate: 1,
            speedRemainder: 0,
            ttmEnvironments: new Map(),
            ttmSequenceOrder: [],
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
            this.#adsProgram = createAdsProgram(this.state.data);
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
        state.adsTagEnded = false;
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
        // Two-clock timing (faithful to the original): the fine tick above counts
        // down delays/time-limits every call, but animation frames only ADVANCE on
        // the 50 ms WM_TIMER present (the #runTtmController gate). The HOST clock
        // recovery of that ~50 ms cadence lives in the injected timing hook; the
        // canonical runtime only consumes the result. state.wmTimerMs overrides the
        // period (logical unit tests run per fine tick).
        const cadence = this.state.timingCompatibility.advancePresentCadence(
            this.state.presentAccumulatorMs,
            frameDelta,
            this.state.wmTimerMs,
        );
        this.state.presentAccumulatorMs = cadence.accumulatorMs;
        this.state.isPresentTick = cadence.isPresent;
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
        const scene = state.data.scenes[state.currentScene];

        if (scene === undefined) {
            // currentScene walked off the end (a free-run advance past the last
            // tag, or an empty program). Complete once its final children drain.
            if (state.scenes.length === 0) {
                debugLog('ADS cycle complete');
                return true;
            }
            state.continue = false;
            return false;
        }

        // Arm the tag table the first tick we enter a tag: every tag idle, the
        // selected one fresh (FUN_1048_0805 with state 3). Its flag becomes 1 as
        // the walk loop reaches it.
        if (this.#adsProgramScene !== state.currentScene) {
            this.#adsProgramScene = state.currentScene;
            resetAdsProgram(this.#adsProgram, state.currentScene);
        }

        // FUN_1048_1acb: walk every active tag from its top (or its armed WHILE)
        // every tick, BEFORE the node pass below. ADD/STOP take effect at once, so
        // a thread added here runs its first frame in this same tick.
        stepAdsProgram(state, this.#adsProgram);

        // The binary checks completion after the node pass. A zero-delay ADD in
        // the exit body can therefore finish before this tick's decision.
        this.#runTtmController();

        // Non-Johnny hosts: the cosmetic alpha fade an F010 starts advances while
        // the live threads drain (the browser presenter draws it).
        if (!state.hostManagedTransitions && state.fadingOut && state.fadeOpacity < 1) {
            state.fadeOpacity = Math.min(1, state.fadeOpacity + state.frameDelta / 400);
        }

        // Completion (FUN_1048_0766, called by the story driver after each tick):
        // the gag's tag must have ENDED (its F010 ran: flag neither 1 nor 4) AND
        // no live TTM thread may remain. A live thread (incl. a self-rearming
        // ambient) blocks completion inherently by staying in the list -- no
        // KEEP_GOING/unbounded-loop exclusion. An active tag with idle nodes is
        // NOT complete: it keeps being walked until its F010.
        const tagEnded = isAdsTagEnded(this.#adsProgram.tags[state.currentScene]);
        state.adsTagEnded = tagEnded;
        const blockers = state.scenes.filter((s) => !isTtmFinished(s));
        const willComplete = tagEnded && blockers.length === 0 &&
            (state.singleAdsScene || state.hostManagedTransitions || state.fadeOpacity >= 1);
        // INERT observability hook (no behavior change): emit the completion
        // decision -- the live-thread set + the verdict -- for the differential
        // faithfulness oracle. No-op unless a trace sink is attached.
        traceEvent(state, 'ads-completion-decision', {
            currentScene: state.currentScene,
            adsSceneEnd: state.adsSceneEnd,
            willComplete,
            tagEnded,
            pendingAdds: 0,
            blockers: blockers.map((s) => `${s.sceneIdx}:${s.tagId}`),
            liveThreads: state.scenes
                .filter((s) => !isTtmFinished(s))
                .map((s) => ({
                    key: `${s.sceneIdx}:${s.tagId}`,
                    runState: s.runState ?? null,
                    runMode: s.runMode ?? null,
                    excludedAsUnboundedLoop:
                        s.runMode === TtmRunMode.KEEP_GOING ||
                        (s.execution?.status === ExecutionStatus.LOOPED &&
                            s.retries === 0 &&
                            !Number.isFinite(s.timeLimitTicks)),
                })),
        });

        if (willComplete) {
            if (state.singleAdsScene) {
                // Host-selected single gag: report completion; the host picks the
                // next gag. Advance currentScene to adsSceneEnd (one past the
                // selected tag) so describe()/getPresentation report the same
                // position the old linear driver left on completion.
                clearAdsSceneBatch(state);
                if (state.adsSceneEnd != null) state.currentScene = state.adsSceneEnd;
                state.continue = true;
                debugLog(`ADS selected scene complete in "${state.data?.name ?? '?'}"`);
                return true;
            }
            // Free-run: this gag drained -> advance to the next tag with fresh
            // slots (the debug/preview cycle the browser scene-stepper drives).
            clearAdsSceneBatch(state);
            state.currentScene++;
            state.adsTagEnded = false;
            const tagInfo = state.data.scenes[state.currentScene]?.tagId;
            debugLog(
                `Scene ${state.currentScene}/${state.data.scenes.length} started (${
                    !tagInfo ? 'done' : typeof tagInfo === 'object' ? `${tagInfo.id}:${tagInfo.description}` : tagInfo
                })`,
            );
            if (state.fadeOpacity >= 1) {
                state.fadingOut = false;
                state.fadingIn = true;
                state.fadeOpacity = 1;
            } else {
                state.fadingOut = false;
                state.fadeOpacity = 0;
            }
            if (state.data.scenes[state.currentScene] === undefined) {
                debugLog('ADS cycle complete');
                state.continue = true;
                return true;
            }
            state.continue = false;
            return false;
        }

        // Children still live: hold interpretation this tick so the TTM
        // controller advances/composes them (compose = !state.continue).
        state.continue = false;
        return false;
    }

    #runTtmController() {
        const rootState = this.state;
        // Draw order == z-order. Tick scenes in the MUTABLE TTM paint order so
        // MOVE_SEQUENCE_TO_BACK re-layers correctly: later-painted scenes draw
        // over earlier ones on the shared raster.
        const ordered = [...rootState.scenes].sort(
            (a, b) => sequencePaintIndex(rootState, a) - sequencePaintIndex(rootState, b),
        );
        // The node pass (FUN_1048_1acb dc:14988): a node left in state 4 by the
        // previous pass goes back to 0 here, AFTER this tick's ADS walk has read it.
        // So IF_PLAYED sees each completion for exactly one tick.
        for (const scene of ordered) scene.playedPulse = false;
        ordered.forEach((scene) => {
            if (!isTtmFinished(scene) && Number.isFinite(scene.timeLimitTicks)) {
                scene.timeLimitTicks--;
                if (scene.timeLimitTicks <= 0) {
                    scene.state.played = true;
                    scene.state.waitTicks = 0;
                    scene.runState = TtmRunState.FINISHED;
                    scene.playedPulse = true; // timer expiry -> state 4 (dc:15062)
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

            // Frame advancement is gated to the 50 ms WM_TIMER present. The fine-tick
            // delay countdown above runs every tick, but once a frame is ready we only
            // ADVANCE (run the script to emit the next frame) on a present tick;
            // otherwise hold the current frame untouched -- its recorded execution
            // state, runState, and frameOps carry over, so ADS sequencing reads a
            // stable scene and composeTtmFrame keeps drawing the held frame.
            //
            // EXCEPTION: a just-added scene draws its FIRST frame on the tick it is
            // armed, matching the original's arm->draw order within one tick. Without
            // this, a scene added on a non-present fine tick would stay blank until the
            // next present tick, so a hand-off shows a background-only frame while the
            // successor waits to draw (the 2-tick blip). The first frame is a one-time
            // bootstrap; every later advance is present-gated as normal.
            if (!rootState.isPresentTick && scene.needsFirstFrame !== true) return;

            if (!isTtmFinished(scene)) {
                scene.needsFirstFrame = false;
                scene.runState = TtmRunState.RUNNING;
                scene.execution = runScript(scene.state, scene.state.script || scene.script);
                // A PURGE frame with zero delay has no hold, so the sequence ends in the
                // same tick (FUN_1048_196e passes at once with delay 0, and FUN_1048_1acb
                // sets runstate 4 before the next tick). This is why the original
                // never shows zero-delay loaders such as JOHNNY:6's 3:9 or ACTIVITY:11's
                // 5:20/5:42 as live threads.
                if (scene.execution.frameBoundary?.delayTicks === 0 && scene.state.endOfSequence) {
                    scene.execution = runScript(scene.state, scene.state.script || scene.script);
                }
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
                        scene.playedPulse = true; // TTM end -> state 4 (dc:15009)
                    }
                }
            }
        });

        // Age finished scenes for composeTtmFrame. `agedOut` is a three-state flag:
        // `undefined` while running; `false` on the FIRST tick a scene is finished
        // (composeTtmFrame draws its final frame once more, so it stays visible while
        // its successor first paints); `true` on every later tick (dropped). Runs
        // every compose tick, so a finished scene that is never explicitly stopped
        // still ages out after one tick and can never freeze on the raster. A revived
        // (retried) scene is reset to `undefined`.
        for (const scene of rootState.scenes) {
            if (!isTtmFinished(scene)) {
                scene.agedOut = undefined;
            } else if (scene.agedOut === undefined) {
                scene.agedOut = false;
            } else {
                scene.agedOut = true;
            }
        }
    }

    #runScripts() {
        const state = this.state;
        if (state.type === 'ADS') {
            const completed = this.#runAdsController();
            const scene = state.data.scenes[state.currentScene];
            const compose = !state.continue || scene === undefined;
            if (compose && scene === undefined) {
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

    jumpToScene(tagId, { single = true } = {}) {
        const state = this.state;
        if (state.type !== 'ADS') return false;
        const sceneIndex = state.data.scenes.findIndex((scene) => scene.tagId?.id === tagId);
        if (sceneIndex === -1) return false;

        traceEvent(state, 'runtime-control', { action: 'jump-to-scene', tagId });
        state.currentScene = sceneIndex;
        // Re-arm the tag table for the jumped-to tag (flags + WHILE resume reset),
        // even when re-jumping to the same tag index.
        this.#adsProgramScene = -1;
        // Default to the browser's single-gag completion path (adsSceneEnd set, so
        // completion runs through the concluding-children hold + `blockers` check),
        // NOT the legacy free-run where the linear PC drives to script END. Tests and
        // probes MUST see the same completion model the browser uses -- the divergence
        // between the two was the source of a long mis-diagnosis. Interactive debug
        // scene-stepping opts out (`single: false`) to keep its free-run preview.
        state.singleAdsScene = single;
        state.adsSceneEnd = single ? sceneIndex + 1 : null;
        state.playedHistory.clear();
        // Prune stored backgrounds on the OLD environment map before discarding it,
        // so a persistent background does not survive the jump onto the raster.
        // (resetAdsDisplayList also drops the scene list and the ADDed-node
        // record -- shared with clearAdsSceneBatch.)
        resetAdsDisplayList(state);
        state.ttmEnvironments = new Map();
        state.continue = true;
        state.reentry = 0;
        state.jumpTo = undefined;
        state.lastCommand = false;
        state.fadingOut = false;
        state.fadingIn = false;
        state.fadeOpacity = 0;
        state.surface?.clear();
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
        // Debug preview keeps the legacy free-run flow (no single-gag hold), so
        // stepping repeatedly through scenes behaves as before.
        this.jumpToScene(scenes[nextIndex]?.tagId.id, { single: false });
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
