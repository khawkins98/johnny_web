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
 *  BASE from the parent ADS state:
 *    audioManager, entries, island, and all other ADS configuration fields.
 *    Provides the runtime environment (audio, resource list, world state) to each TTM scene.
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
    const scene = ttm.scenes.find(s => s.tagId === tagId);
    const retries = retriesDelay >= 0 ? retriesDelay : 0;
    const delay = retriesDelay < 0 ? retriesDelay : state.delay;

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;

    const stateInit = { ...initialState, type: 'TTM', context: canvas.getContext('2d') };

    const s = Object.assign({ sceneIdx, delay, retries, lifecycle: 'active' }, scene);
    if (s.script === undefined) {
        console.log('add failed script', sceneIdx, tagId, scene, ttm);
        return;
    }
    if (!state.scenes.length) {
        // First TTM scene: prepend the TTM prologue (scenes[0]) so it loads resources,
        // then copy main ADS state as the base (provides audioManager, entries, island, etc.).
        s.script = [...ttm.scenes[0].script, ...s.script];
        s.state = Object.assign({}, state, stateInit);
    } else {
        // Subsequent TTM scenes: start from main ADS state, then overlay only the
        // prologue-loaded assets from the first sibling (res[], background, palette, canvases).
        // Finally apply stateInit to reset all runtime fields (reentry, played, runs, etc.)
        // so we don't inherit stale execution state from the sibling.
        const firstSibling = state.scenes[0].state;
        s.state = Object.assign(
            {},
            state,                         // base: ADS config (audioManager, entries, island…)
            {                              // prologue-loaded assets from first sibling (SHARED)
                res: firstSibling.res,
                bkgScreen: firstSibling.bkgScreen,
                bkgRes: firstSibling.bkgRes,
                bkgRaft: firstSibling.bkgRaft,
                bkgOcean: firstSibling.bkgOcean,
                saveBkg: firstSibling.saveBkg,
                save: firstSibling.save,
                tmpContext: firstSibling.tmpContext,
                foregroundColor: firstSibling.foregroundColor,
                backgroundColor: firstSibling.backgroundColor,
            },
            stateInit,                     // fresh runtime state (reentry=0, played=false…) — FRESH
        );
    }
    return s;
};
