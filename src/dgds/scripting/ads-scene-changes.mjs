/**
 * ads-scene-changes.mjs — the ADS node table, as operations on the runtime's
 * child-scene display list (`state.scenes`).
 *
 * The original keeps one preallocated node per (slot, tag) with a state word
 * (+0x2f: 0 idle, 1 run-once, 2 counted, 3 timed, 4 just-finished, 5 held) and an
 * "ever ADDed" counter (+0x2d). The port models a node as a scene object in
 * `state.scenes`: states 1-3 = isTtmRunning, state 4 = isTtmFinished carrying the
 * one-tick `playedPulse`, state 0 = finished without the pulse, absent, or
 * STOPped outside the display list with its execution position retained. The
 * +0x2d counter is the `state.adsAdded` key set. ads-walker.mjs is the only
 * caller of the node operations; the display-list resets are shared with the
 * runtime.
 */
import { getSceneState, runCountToRunMode } from './scene-factory.mjs';
import { sceneLabel, sceneLog, verboseLog } from './scripting-log.mjs';
import { emitFrameOperation, FrameOperationType } from './frame-operation.mjs';
import { pruneEnvironmentBackground } from './composition.mjs';
import { isTtmFinished, TtmRunState } from './ttm-run-state.mjs';
// runSetupOps lives in script-runner.mjs; addSceneNode calls it synchronously to
// run a freshly-added TTM environment's prologue setup.
import { runSetupOps } from './script-runner.mjs';

const keyOf = (sceneIdx, tagId) => `${sceneIdx}:${tagId}`;

/**
 * Shared core of an ADS display-list reset: drop the scene list, forget which
 * nodes were ever ADDed (the binary's FUN_1048_0b3e node reset a fresh tag start
 * applies to its nodes), prune every TTM environment's stored background (so
 * stale pixels never carry into an unrelated sequence), and disarm the
 * save-behind buffer. Used by both clearAdsSceneBatch (end of a gag) and
 * Runtime#jumpToScene (debug/programmatic scene jump).
 */
export const resetAdsDisplayList = (state) => {
    state.scenes = [];
    state.adsAdded = new Set();
    state.stoppedAdsNodes = new Map();
    for (const sceneIdx of state.ttmEnvironments?.keys?.() || []) {
        pruneEnvironmentBackground(state, sceneIdx);
    }
    if (state.saveBkg?.[0]) {
        state.saveBkg[0].canDraw = false;
    }
};

export const clearAdsSceneBatch = (state) => {
    // `playedHistory` is a diagnostic record of every (slot,tag) a gag ran; no
    // ADS condition reads it (the binary has no latched "played" state).
    state.scenes.forEach((s) => state.playedHistory?.add(keyOf(s.sceneIdx, s.tagId)));
    resetAdsDisplayList(state);
    emitFrameOperation(state, { type: FrameOperationType.CLEAR_SURFACE });
};

export const findSceneNode = (state, sceneIdx, tagId) =>
    state.scenes.find((s) => s.sceneIdx === sceneIdx && s.tagId === tagId);

const removeSceneNode = (state, sceneIdx, tagId) => {
    let index;
    let removed = false;
    while ((index = state.scenes.findIndex((sc) => sc.sceneIdx === sceneIdx && sc.tagId === tagId)) !== -1) {
        state.playedHistory?.add(keyOf(sceneIdx, tagId));
        state.scenes.splice(index, 1);
        removed = true;
    }
    return removed;
};

/**
 * ADD (0x2005 -> FUN_1048_0db6). Never de-duplicates:
 *   - a finished node (state 4/0) starts a fresh execution: its next-frame
 *     pointer was already reset by the PURGE path (dc:15021);
 *   - a STOPped node (state 0) resumes its retained frame position;
 *   - a RUNNING node keeps its frame position; only mode/count/timer are
 *     overwritten (0db6 never writes +8);
 *   - +0x2d is bumped either way (IF_NOT_PLAYED goes false the moment ADD runs).
 * `restart` is 0x2000 (FUN_1048_0e2e): frame := start first, so a running node
 * restarts too.
 */
export const addSceneNode = (state, sceneIdx, tagId, runCount, proportion, { restart = false } = {}) => {
    const key = keyOf(sceneIdx, tagId);
    state.adsAdded ||= new Set();
    state.adsAdded.add(key);
    const present = findSceneNode(state, sceneIdx, tagId);
    if (present !== undefined && !isTtmFinished(present) && !restart) {
        Object.assign(present, runCountToRunMode(runCount));
        return present;
    }
    if (present !== undefined) {
        // A node that finished (state 4/0) restarts as a fresh execution.
        removeSceneNode(state, sceneIdx, tagId);
    }
    const stopped = state.stoppedAdsNodes?.get(key);
    if (stopped) {
        state.stoppedAdsNodes.delete(key);
        if (!restart) {
            Object.assign(stopped, runCountToRunMode(runCount));
            stopped.proportion = proportion;
            stopped.runState = TtmRunState.STARTING;
            stopped.needsFirstFrame = true;
            state.scenes.push(stopped);
            return stopped;
        }
    }
    const scene = getSceneState(state, sceneIdx, tagId, runCount, proportion);
    if (scene === undefined) return undefined;
    if (scene.environment?.owner === scene && !scene.environment.ready) {
        // Every TTM environment initializes independently of unrelated active resources.
        // For the 40 TTMs with a separate frame-zero prologue, the original
        // frame-table build (FUN_1050_04d6) starts each node at its SET_SCENE;
        // frame 0 is not interpreted by a thread. The browser host still needs
        // its LOAD_SCREEN/palette setup to establish the visible background.
        // Run those ops without UPDATE, so no thread consumes an extra frame.
        // WOULDBE.TTM has an empty prologue: its tagged first frame performs
        // screen/palette setup and replays it when that thread loops.
        runSetupOps(scene.state, (scene.script || scene.state.script).slice(0, scene.prologueLength || 0));
        scene.state.reentry = scene.prologueLength || 0;
        scene.environment.ready = true;
    }
    // Draw this scene's first frame on the tick it is added (the original arms
    // then runs the node in the same FUN_1048_1acb call), even if that tick is
    // not a WM_TIMER present tick -- so a hand-off successor appears the same tick
    // the finished predecessor drops, with no background-only frame between.
    scene.needsFirstFrame = true;
    sceneLog(state, 'ADD_SCENE', sceneLabel(state.scenesRes, sceneIdx, tagId));
    state.scenes.push(scene);
    return scene;
};

/**
 * STOP (0x2010 -> FUN_1048_0e9b): node state := 0. Keep its execution position
 * outside the visible display list so a later ADD resumes the same frame.
 */
export const stopSceneNode = (state, sceneIdx, tagId) => {
    const scene = findSceneNode(state, sceneIdx, tagId);
    if (removeSceneNode(state, sceneIdx, tagId)) {
        state.stoppedAdsNodes ||= new Map();
        state.stoppedAdsNodes.set(keyOf(sceneIdx, tagId), scene);
        sceneLog(state, 'STOP_SCENE', sceneLabel(state.scenesRes, sceneIdx, tagId));
        return;
    }
    // Stopping a node that is already idle is a legitimate ADS pattern (a sibling
    // branch already stopped it, or it was never added this gag): a silent no-op.
    verboseLog(`STOP_SCENE ${sceneIdx}:${tagId}: already inactive (no-op)`);
};

/** 0x2020 -> FUN_1048_0ec8 -> FUN_1048_0b3e: full node reset (state 0, +0x2d = 0). */
export const resetSceneNode = (state, sceneIdx, tagId) => {
    removeSceneNode(state, sceneIdx, tagId);
    state.stoppedAdsNodes?.delete(keyOf(sceneIdx, tagId));
    state.adsAdded?.delete(keyOf(sceneIdx, tagId));
};
