/**
 * scene-factory.mjs — Builds TTM scene state objects for spawning via ADD_SCENE / PLAY_SCENE.
 *
 * Field sharing policy (documented here as the authoritative source):
 *
 *  SHARED within one TTM resource environment (prologue-loaded assets):
 *    res[], bkgScreen, bkgRes, bkgRaft, bkgOcean, saveBkg,
 *    foregroundColor, backgroundColor.
 *    The first scene for a resource owns its prologue. Siblings inherit its assets only
 *    after that prologue has finished; a different TTM resource gets a different environment.
 *
 *  FRESH per scene (from initialState):
 *    reentry, played, runs, continue, delay, timer, lastCommand, skip, elapsedTimer.
 *    GET/PUT save[] slots are copied from the environment once setup completes,
 *    then remain private working buffers for concurrent scenes.
 *    Never inherited — stale execution state from a sibling must not bleed into a new scene.
 *
 *  HOST SERVICES from the parent ADS state:
 *    audioManager, entries, scenesRes, random, and a fresh scene-layer surface.
 *
 * ADS controller fields (scene queues, condition state, fades, and ADS program
 * counters) are deliberately not copied into child TTM states.
 */
import { pendingExecution } from './execution-outcome.mjs';

/**
 * Default runtime fields reset for every new scene execution.
 * These are always FRESH per scene — never inherited from siblings.
 */
export const initialState = {
    reentry: 0,
    lastCommand: false,
    runs: 0,
    played: false,
    continue: true,
    skip: false,
    island: 1,
    elapsedTimer: 0,
    timer: 0,
    delay: 0,
    waitTicks: 0,
    gotoRestart: false,
    clip: { x: 0, y: 0, width: 640, height: 480 },
};

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
    // A TTM sequence retains only its own current frame. The process compositor
    // rebuilds the shared presentation surface from active layers every tick.
    surface: parent.surfaceFactory(),
    allScenes: parent.scenes,

    // Host services
    entries: parent.entries,
    audioManager: parent.audioManager,
    scenesRes: parent.scenesRes,
    random: parent.random,
    compatibility: parent.compatibility,
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
    save: assets.save,

    // Drawing and world values required by TTM opcodes/background composition
    slot: 0,
    saveIndex: 0,
    island: assets.island ?? parent.island ?? 1,
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

const createSaveSlot = surfaceFactory => ({
    surface: surfaceFactory(),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    canDraw: false,
});

const cloneSaveSlots = (slots, surfaceFactory) => (slots || []).map(source => {
    const copy = createSaveSlot(surfaceFactory);
    if (!source) return copy;
    copy.x = source.x;
    copy.y = source.y;
    copy.width = source.width;
    copy.height = source.height;
    copy.canDraw = source.canDraw;
    if (source.canDraw) {
        copy.surface.drawSurface(source.surface, {
            x: source.x,
            y: source.y,
            width: source.width,
            height: source.height,
        });
    }
    return copy;
});

/** Allocate the mutable resources owned by a single loaded TTM environment. */
export const createTtmEnvironmentAssets = (parent) => {
    if (typeof parent.surfaceFactory !== 'function') {
        throw new TypeError('TTM runtime requires an injected surfaceFactory');
    }

    return {
        res: [],
        bkgScreen: null,
        bkgRes: null,
        bkgRaft: null,
        bkgOcean: [],
        save: Array.from({ length: 3 }, () => createSaveSlot(parent.surfaceFactory)),
        saveBkg: [createSaveSlot(parent.surfaceFactory)],
        island: parent.island,
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

export const canRunTtmScene = scene => (
    !scene.environment || scene.environment.ready || scene.environment.owner === scene
);

/** Detach a runnable sibling's mutable GET/PUT buffers from its resource template. */
export const prepareTtmScene = scene => {
    if (!scene?.needsPrivateSave || !scene.environment?.ready) return;
    scene.state.save = cloneSaveSlots(
        scene.environment.assets.save,
        scene.environment.surfaceFactory,
    );
    scene.needsPrivateSave = false;
};

/**
 * Build the full state object for a newly spawned TTM scene.
 * See module docblock for the complete field-sharing policy.
 */
export const getSceneState = (state, sceneIdx, tagId, retriesDelay, unk) => {
    // scenesRes is indexed by the resource ID declared in the ADS [RESOURCES] block.
    // IDs are 1-based and may be non-sequential, so we look up directly by ID.
    const ttm = state.scenesRes[sceneIdx];
    if (ttm === undefined || ttm.scenes === undefined) {
        console.log('add failed ttm', sceneIdx, tagId);
        return;
    }
    const sequenceOrder = ttm.scenes.findIndex(s => s.tagId === tagId);
    const scene = ttm.scenes[sequenceOrder];
    const retries = retriesDelay >= 0 ? retriesDelay : 0;
    const delay = retriesDelay < 0 ? retriesDelay : state.delay;

    const resourceOrder = state.data?.resources?.findIndex(resource => resource.id === sceneIdx) ?? -1;
    const s = Object.assign({
        sceneIdx,
        delay,
        retries,
        lifecycle: 'active',
        // DGDS repaints active TTM sequences in resource/declaration order. ADS
        // start order is scheduling state, not painter state.
        paintOrder: {
            resource: resourceOrder < 0 ? sceneIdx : resourceOrder,
            sequence: sequenceOrder,
        },
    }, scene);
    if (s.script === undefined) {
        console.log('add failed script', sceneIdx, tagId, scene, ttm);
        return;
    }
    state.ttmEnvironments ||= new Map();
    let environment = state.ttmEnvironments.get(sceneIdx);
    if (!environment) {
        // A TTM environment owns decoded assets and initial GET/PUT templates.
        // Running siblings receive private working copies after setup completes.
        const assets = createTtmEnvironmentAssets(state);
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
        s.state = createTtmRuntimeState(state, environment.assets, sceneIdx, tagId);
        s.needsPrivateSave = true;
        s.environment = environment;
        if (environment.ready) prepareTtmScene(s);
    }
    s.environment = environment;
    s.execution = pendingExecution(s.state);
    return s;
};
