/**
 * scene-factory.mjs — Builds TTM scene state objects for spawning via ADD_SCENE / PLAY_SCENE.
 *
 * Field sharing policy (documented here as the authoritative source):
 *
 *  SHARED from the first TTM sibling (prologue-loaded assets):
 *    res[], bkgScreen, bkgRes, bkgRaft, bkgOcean, saveBkg, save, tmpContext,
 *    foregroundColor, backgroundColor.
 *    These are expensive to reload and are identical across all concurrent sibling scenes.
 *    The first scene's prologue (scenes[0] in the TTM) runs LOAD_SCREEN / LOAD_IMAGE once;
 *    all subsequent siblings inherit the results rather than re-running the prologue.
 *
 *  FRESH per scene (from initialState):
 *    reentry, played, runs, continue, delay, timer, lastCommand, skip, elapsedTimer.
 *    Never inherited — stale execution state from a sibling must not bleed into a new scene.
 *
 *  HOST SERVICES from the parent ADS state:
 *    audioManager, entries, scenesRes, random, and the unified sprite context.
 *
 * ADS controller fields (scene queues, condition state, fades, and ADS program
 * counters) are deliberately not copied into child TTM states.
 */

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
    context: parent.spriteContext,
    allScenes: parent.scenes,

    // Host services
    entries: parent.entries,
    audioManager: parent.audioManager,
    scenesRes: parent.scenesRes,
    random: parent.random,

    // Shared/cached DGDS resources
    res: assets.res || [],
    bkgScreen: assets.bkgScreen || null,
    bkgRes: assets.bkgRes || null,
    bkgRaft: assets.bkgRaft || null,
    bkgOcean: assets.bkgOcean || [],
    saveBkg: assets.saveBkg,
    save: assets.save,
    tmpContext: assets.tmpContext,

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
    const scene = ttm.scenes.find(s => s.tagId === tagId);
    const retries = retriesDelay >= 0 ? retriesDelay : 0;
    const delay = retriesDelay < 0 ? retriesDelay : state.delay;

    const s = Object.assign({ sceneIdx, delay, retries, lifecycle: 'active' }, scene);
    if (s.script === undefined) {
        console.log('add failed script', sceneIdx, tagId, scene, ttm);
        return;
    }
    if (!state.scenes.length) {
        // First TTM scene: prepend the TTM prologue (scenes[0]) so it loads resources,
        // then start with the root's explicit resource/cache handles.
        s.script = [...ttm.scenes[0].script, ...s.script];
        s.state = createTtmRuntimeState(state, state, sceneIdx, tagId);
    } else {
        // Subsequent scenes share only prologue-loaded assets and host services;
        // execution state is always fresh.
        const firstSibling = state.scenes[0].state;
        s.state = createTtmRuntimeState(state, firstSibling, sceneIdx, tagId);
    }
    return s;
};
