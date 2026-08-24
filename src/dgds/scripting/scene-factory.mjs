/**
 * scene-factory.mjs — Builds TTM scene state objects spawned by ADS branches.
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
 *    reentry, played, runs, continue, delay, timer, lastCommand, skip.
 *    GET/PUT save[] slots are copied from the environment after setup and then
 *    remain private because this renderer uses one retained layer per sequence.
 *    Never inherited — stale execution state from a sibling must not bleed into a new scene.
 *
 *  SHARED OUTPUTS/HOST INPUTS from the parent ADS state:
 *    audioOperations, frameOperations, the frame presenter, resource provider, scenesRes,
 *    random, and a fresh scene-layer surface.
 *
 * ADS controller fields (scene queues, condition state, fades, and ADS program
 * counters) are deliberately not copied into child TTM states.
 */
import { pendingExecution } from './execution-outcome.mjs';
import { TtmRunMode, TtmRunState } from './ttm-run-state.mjs';
import { sequenceKey } from './ttm-sequence-order.mjs';

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
    timer: 0,
    delay: 0,
    waitTicks: 0,
    frameReady: false,
    frameBoundary: null,
    gotoRestart: false,
    clip: { x: 0, y: 0, width: 640, height: 480 },
};

/** True when the selected ADS program explicitly re-adds a sequence when it finishes. */
export const isSelfRearmingSequence = (state, sceneIdx, tagId) => {
    const script = state.activeAdsScript || state.data?.scenes?.[state.currentScene]?.script || [];
    for (let index = 0; index < script.length; index++) {
        const command = script[index];
        if (command.opcode !== 0x1350 || command.params?.[0] !== sceneIdx || command.params?.[1] !== tagId) {
            continue;
        }
        let depth = 1;
        for (let body = index + 1; body < script.length && depth > 0; body++) {
            const nested = script[body];
            if ([0x1330, 0x1350, 0x1360, 0x1370].includes(nested.opcode)) depth++;
            if (nested.opcode === 0xfff0) depth--;
            if (
                depth > 0 &&
                nested.opcode === 0x2005 &&
                nested.params?.[0] === sceneIdx &&
                nested.params?.[1] === tagId
            ) {
                return true;
            }
        }
    }
    return false;
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
    resourceProvider: parent.resourceProvider,
    audioOperations: parent.audioOperations,
    frameOperations: parent.frameOperations,
    presentFrameOperation: parent.presentFrameOperation,
    scenesRes: parent.scenesRes,
    random: parent.random,
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
    save: assets.save,

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

const cloneSaveSlots = (slots, surfaceFactory) =>
    (slots || []).map((source) => {
        const copy = createSaveSlot(surfaceFactory);
        if (!source) return copy;
        copy.x = source.x;
        copy.y = source.y;
        copy.width = source.width;
        copy.height = source.height;
        copy.canDraw = source.canDraw;
        copy.revision = source.revision || 0;
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
        save: Array.from({ length: 3 }, () => createSaveSlot(parent.surfaceFactory)),
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

/** Detach a runnable sequence's GET/PUT buffers from its environment template. */
export const prepareTtmScene = (scene) => {
    if (!scene?.needsPrivateSave || !scene.environment?.ready) return;
    scene.state.save = cloneSaveSlots(scene.environment.assets.save, scene.environment.surfaceFactory);
    scene.needsPrivateSave = false;
};

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
    // ADS positive run counts include the initial pass. The runtime stores only
    // the number of additional passes remaining after that first execution.
    const retries = runCount > 0 ? runCount - 1 : 0;
    // ADS negative run counts are lifetimes, in DGDS timer ticks, for TTM
    // sequences that can otherwise GOTO-loop forever. They are not frame delays.
    const timeLimitTicks = runCount < 0 ? -runCount : null;
    const runMode =
        runCount < 0
            ? TtmRunMode.TIME_LIMITED
            : runCount > 1
              ? TtmRunMode.COUNTED
              : TtmRunMode.ONCE;

    const s = Object.assign(
        {
            sceneIdx,
            retries,
            timeLimitTicks,
            runMode,
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
