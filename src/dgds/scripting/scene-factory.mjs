/**
 * scene-factory.mjs — Builds TTM scene state objects spawned by ADS branches.
 *
 * Field sharing policy (documented here as the authoritative source):
 *
 *  SHARED within one TTM resource environment (prologue-loaded assets):
 *    res[], bkgScreen, bkgRes, bkgRaft, bkgOcean, saveBkg,
 *    foregroundColor, backgroundColor.
 *    The first scene for a resource owns any separate frame-zero prologue. Siblings
 *    inherit its assets after host setup; a different TTM gets a different environment.
 *
 *  FRESH per scene (from initialState):
 *    reentry, played, runs, continue, delay, lastCommand, skip.
 *    Never inherited — stale execution state from a sibling must not bleed into a new scene.
 *    There are no per-scene sprite save-under slots: the renderer is immediate-mode, so
 *    a moving/stopped sprite is handled by the per-tick clear+replay, not by GET/PUT.
 *
 *  SHARED OUTPUTS/HOST INPUTS from the parent ADS state:
 *    audioOperations, frameOperations, the frame presenter, resource provider, scenesRes,
 *    random, and the ONE shared presentation raster (state.surface). Every scene draws
 *    into it; composeTtmFrame clears the raster and redraws every active scene each tick.
 *
 * ADS controller fields (scene queues, condition state, fades, and ADS program
 * counters) are deliberately not copied into child TTM states.
 */
import { pendingExecution } from './execution-outcome.mjs';
import { TtmRunMode, TtmRunState } from './ttm-run-state.mjs';
import { sequenceKey } from './ttm-sequence-order.mjs';
import { getTtmThreadScript } from './ttm-thread-script.mjs';

/**
 * Default runtime fields reset for every new scene execution.
 * These are always FRESH per scene — never inherited from siblings.
 */
const initialState = {
    reentry: 0,
    lastCommand: false,
    runs: 0,
    played: false,
    continue: true,
    skip: false,
    backgroundId: 1,
    delay: 0,
    waitTicks: 0,
    frameReady: false,
    frameBoundary: null,
    gotoRestart: false,
    clip: { x: 0, y: 0, width: 640, height: 480 },
};

/**
 * ADS ADD's third argument (FUN_1048_0db6): 0 -> run once (state 1); >0 -> run
 * that many times (state 2, count = arg-1 further passes); <0 -> loop until the
 * timer of -arg original 16 ms clock units expires (state 3). The runtime
 * converts that deadline to 20 ms fine ticks and stores only the additional
 * passes remaining after the first execution.
 */
export const runCountToRunMode = (runCount, timingCompatibility = null) => ({
    retries: runCount > 0 ? runCount - 1 : 0,
    timeLimitTicks: runCount < 0 ? (timingCompatibility?.mapTimeLimit?.(-runCount) ?? -runCount) : null,
    runMode: runCount < 0 ? TtmRunMode.TIME_LIMITED : runCount > 1 ? TtmRunMode.COUNTED : TtmRunMode.ONCE,
});

/**
 * Construct the explicit host/resource contract visible to a TTM interpreter.
 * `assets` is either the ADS root for the first child or the first sibling whose
 * prologue has already populated the shared caches.
 */
export const createTtmRuntimeState = (parent, assets, sceneIdx, tagId) => ({
    ...initialState,
    clip: { ...initialState.clip },
    type: 'TTM',
    sceneIdx,
    tagId,
    gagId: parent.data?.scenes?.[parent.currentScene]?.tagId,
    // Every scene draws into the ONE shared raster owned by the runtime root.
    // There is no per-scene surface; the renderer is immediate-mode (composeTtmFrame
    // clears the raster and redraws every active scene's frame each tick). `root`
    // links back to the owning runtime state.
    surface: parent.surface,
    root: parent,
    allScenes: parent.scenes,

    // Host services
    resourceProvider: parent.resourceProvider,
    audioOperations: parent.audioOperations,
    frameOperations: parent.frameOperations,
    presentFrameOperation: parent.presentFrameOperation,
    scenesRes: parent.scenesRes,
    random: parent.random,
    storyRandom: parent.storyRandom,
    game: parent.game,
    titleState: parent.titleState,
    trace: parent.trace,
    getTraceTick: () => parent.tick,
    layerRevision: 0,

    // Shared/cached DGDS resources
    res: assets.res || [],
    bkgScreen: assets.bkgScreen || null,
    bkgRes: assets.bkgRes || null,
    bkgRaft: assets.bkgRaft || null,
    bkgOcean: assets.bkgOcean || [],
    saveBkg: assets.saveBkg,

    // Drawing and world values required by TTM opcodes/background composition
    slot: 0,
    saveIndex: 0,
    backgroundId: assets.backgroundId ?? parent.backgroundId ?? 1,
    isNightMode: parent.isNightMode === true,
    foregroundColor: assets.foregroundColor,
    backgroundColor: assets.backgroundColor,
    cloudIdx: assets.cloudIdx,
    cloudX: assets.cloudX,
    cloudY: assets.cloudY,
    cloudElapsed: assets.cloudElapsed || 0,
    waveElapsed: assets.waveElapsed || 0,
    waveFrame: assets.waveFrame || 0,
});

const createSaveSlot = (surfaceFactory) => ({
    surface: surfaceFactory(),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    canDraw: false,
    revision: 0,
});

/** Allocate the mutable resources owned by a single loaded TTM environment. */
const createTtmEnvironmentAssets = (parent) => {
    if (typeof parent.surfaceFactory !== 'function') {
        throw new TypeError('TTM runtime requires an injected surfaceFactory');
    }

    return {
        res: [],
        bkgScreen: null,
        bkgRes: null,
        bkgRaft: null,
        bkgOcean: [],
        saveBkg: [createSaveSlot(parent.surfaceFactory)],
        backgroundId: parent.backgroundId,
        foregroundColor: parent.foregroundColor,
        backgroundColor: parent.backgroundColor,
        cloudIdx: parent.cloudIdx,
        cloudX: parent.cloudX,
        cloudY: parent.cloudY,
        cloudElapsed: parent.cloudElapsed,
        waveElapsed: parent.waveElapsed,
        waveFrame: parent.waveFrame,
    };
};

export const canRunTtmScene = (scene) =>
    !scene.environment || scene.environment.ready || scene.environment.owner === scene;

/**
 * Build the full state object for a newly spawned TTM scene.
 * See module docblock for the complete field-sharing policy.
 */
export const getSceneState = (state, sceneIdx, tagId, runCount, proportion) => {
    // scenesRes is indexed by the resource ID declared in the ADS [RESOURCES] block.
    // IDs are 1-based and may be non-sequential, so we look up directly by ID.
    const ttm = state.scenesRes[sceneIdx];
    if (ttm === undefined || ttm.scenes === undefined) {
        console.log('add failed ttm', sceneIdx, tagId);
        return;
    }
    const sequenceOrder = ttm.scenes.findIndex((s) => s.tagId === tagId);
    const scene = ttm.scenes[sequenceOrder];

    const s = Object.assign(
        {
            sceneIdx,
            ...runCountToRunMode(runCount, state.timingCompatibility),
            proportion,
            runState: TtmRunState.STARTING,
            sequenceKey: sequenceKey(sceneIdx, tagId),
        },
        scene,
    );
    if (s.script === undefined) {
        console.log('add failed script', sceneIdx, tagId, scene, ttm);
        return;
    }
    // A named SET_SCENE begins this node's first frame, but does not bound its
    // execution. A node with no PURGE/GOTO runs into later named frames while
    // retaining its own ADS-visible tag (MJFISHC 4:44 -> 4:45, for example).
    s.script = getTtmThreadScript(ttm, tagId);
    state.ttmEnvironments ||= new Map();
    let environment = state.ttmEnvironments.get(sceneIdx);
    if (!environment) {
        // A TTM environment owns decoded assets and initial GET/PUT templates.
        // Running siblings receive private working copies after setup completes.
        const assets = createTtmEnvironmentAssets(state);
        // WOULDBE.TTM starts with SET_SCENE in frame 0, so this length is zero.
        // Its first thread owns the screen/palette ops in its tagged first frame
        // and targetStart=0 replays them on every counted/timed loop.
        const prologueLength = ttm.scenes[0].script.length;
        s.script = [...ttm.scenes[0].script, ...s.script];
        s.prologueLength = prologueLength;
        s.targetStart = prologueLength;
        s.state = createTtmRuntimeState(state, assets, sceneIdx, tagId);
        environment = {
            assets: s.state,
            owner: s,
            ready: prologueLength === 0,
            surfaceFactory: state.surfaceFactory,
        };
        state.ttmEnvironments.set(sceneIdx, environment);
    } else {
        // Siblings of one environment share the same save slots. Sprite save-under
        // no longer lives in per-scene slots: it goes to the global rect-keyed
        // registry (save-under.mjs) where different rects never collide, so no
        // per-scene clone is needed.
        s.state = createTtmRuntimeState(state, environment.assets, sceneIdx, tagId);
        s.environment = environment;
    }
    s.environment = environment;
    s.execution = pendingExecution(s.state);
    return s;
};
