/**
 * ads-scene-changes.mjs — ADS opcode callbacks that mutate the child-scene
 * display list: staging (ADD_SCENE/STOP_SCENE/RANDOM_*), committing
 * (applySceneChanges), batch-clearing (clearAdsSceneBatch), sequence
 * reordering, and the segment-ending opcodes (END_SCENE_BRANCH/END_WHILE/END).
 *
 * Split out of script-runner.mjs; see script-dispatch.mjs for the ADSDispatch
 * table that wires these into opcode numbers.
 */
import { getSceneState, isSelfRearmingSequence } from './scene-factory.mjs';
import { sceneLabel, sceneLog, debugLog, verboseLog } from './scripting-log.mjs';
import { emitFrameOperation, FrameOperationType } from './frame-operation.mjs';
import { pruneEnvironmentBackground } from './composition.mjs';
import { TtmRunMode } from './ttm-run-state.mjs';
import { moveSequenceToBack } from './ttm-sequence-order.mjs';
// runScript lives in script-runner.mjs; applySceneChanges calls it synchronously
// to prime a freshly-added TTM environment's first frame. This is a deliberate
// circular import (script-runner.mjs re-exports applySceneChanges/clearAdsSceneBatch
// from this module) -- safe because both sides only touch the binding inside
// function bodies invoked after both modules have finished loading, never at
// module-evaluation time.
import { runScript } from './script-runner.mjs';

/**
 * Shared core of an ADS display-list reset: drop the staged/active scene
 * collections, clear the explicit-stop revive guard, prune every TTM
 * environment's stored background (so stale pixels never carry into an
 * unrelated sequence), and disarm the save-behind buffer. Used by both
 * clearAdsSceneBatch (end of an ADS segment/fade) and Runtime#jumpToScene
 * (debug/programmatic scene jump) -- the two places that need a clean
 * display list. Callers remain responsible for anything OUTSIDE the shared
 * subset: clearAdsSceneBatch also emits CLEAR_SURFACE and records played
 * history; jumpToScene also resets fade/control flags, replaces
 * ttmEnvironments wholesale, and clears the surface directly. Those differ
 * per call site and must NOT be folded in here.
 */
export const resetAdsDisplayList = (state) => {
    state.scenes = [];
    state.addScenes = [];
    state.removeScenes = [];
    state.scenesRandom = [];
    // The explicit-stop revive guard is per-gag; a new gag (or a jump to a
    // new scene) starts with a clean display list, so a (slot,tag) stopped
    // here must not gate what comes next.
    state.stoppedScenes?.clear();
    for (const sceneIdx of state.ttmEnvironments?.keys?.() || []) {
        pruneEnvironmentBackground(state, sceneIdx);
    }
    if (state.saveBkg?.[0]) {
        state.saveBkg[0].canDraw = false;
    }
};

export const clearAdsSceneBatch = (state) => {
    state.scenes.forEach((s) => state.playedHistory.add(`${s.sceneIdx}:${s.tagId}`));
    resetAdsDisplayList(state);
    emitFrameOperation(state, { type: FrameOperationType.CLEAR_SURFACE });
};

// ADS-level fade to black. First call starts the animation (blocks ADS); each subsequent
// frame the opacity increases. Once fully black, the current segment is complete.
// The overlay is drawn in runScripts so it remains visible for the final frame even after
// the child scenes are cleared.
export const ADS_FADE_OUT = (state) => {
    // Johnny's executable treated F010 as an end-of-segment marker and owned
    // the five sequence wipes itself. Other DGDS hosts retain the existing
    // interpreter-level alpha fade for compatibility.
    if (state.hostManagedTransitions) {
        if (state.lastCommand) clearAdsSceneBatch(state);
        return;
    }
    if (state.continue) {
        debugLog('FADE_OUT: starting');
        state.fadingOut = true;
        state.fadeOpacity = 0;
        state.continue = false;
        return;
    }
    state.fadeOpacity = Math.min(1, state.fadeOpacity + state.frameDelta / 400);
    if (state.fadeOpacity >= 1) {
        // F010's signed segment argument is part of the opcode. For the common
        // current-segment form (-1), FADE_OUT is itself the final command.
        if (state.lastCommand) {
            clearAdsSceneBatch(state);
        }
        // Keep fadingOut true so runScripts draws the full-black frame.
        state.continue = true;
    }
};

export const ADD_SCENE = (state, sceneIdx, tagId, runCount, proportion) => {
    // A finished scene may be stopped and restarted in the same authored ADS
    // branch. Collection changes are staged, so treat a matching pending
    // removal as absent and queue the replacement for remove-before-add commit.
    const pendingRemoval = hasPendingSceneChange(state.removeScenes, sceneIdx, tagId);
    const rearmed = pendingRemoval && runCount === 0 && isSelfRearmingSequence(state, sceneIdx, tagId);
    const inScenes =
        !pendingRemoval && state.scenes.some((s) => s.sceneIdx === sceneIdx && s.tagId === tagId);
    const inAddScenes = state.addScenes.some((s) => s.sceneIdx === sceneIdx && s.tagId === tagId);
    if (inScenes || inAddScenes) return;

    if (state.randomize) {
        state.scenesRandom.push({
            sceneIdx,
            tagId,
            runCount,
            proportion,
            ...(rearmed ? { runMode: TtmRunMode.KEEP_GOING } : {}),
        });
        return;
    }

    state.addScenes.push({
        sceneIdx,
        tagId,
        runCount,
        proportion,
        ...(rearmed ? { runMode: TtmRunMode.KEEP_GOING } : {}),
    });
};

// Shared with ads-opcodes.mjs (IF_PLAYED/IF_NOT_RUNNING need to see staged
// collection changes before they are committed).
export const hasPendingSceneChange = (changes, sceneIdx, tagId) =>
    (changes || []).some((scene) => scene.sceneIdx === sceneIdx && scene.tagId === tagId);

export const applySceneChanges = (state) => {
    // Keys removed in THIS batch may be re-added in the SAME batch (a STOP+ADD
    // restart / self-rearm chunk); only a re-add in a LATER tick of an EXPLICITLY
    // stopped scene is a revive to block. See STOP_SCENE + the add phase below.
    const removedThisBatch = new Set();
    state.stoppedScenes ||= new Set();
    state.removeScenes.forEach((s) => {
        const key = `${s.sceneIdx}:${s.tagId}`;
        removedThisBatch.add(key);
        if (s.stop) state.stoppedScenes.add(key);
        let index;
        let removed = false;
        while ((index = state.scenes.findIndex((sc) => sc.sceneIdx === s.sceneIdx && sc.tagId === s.tagId)) !== -1) {
            state.playedHistory.add(`${s.sceneIdx}:${s.tagId}`);
            sceneLog(state, 'STOP_SCENE', sceneLabel(state.scenesRes, s.sceneIdx, s.tagId));
            state.scenes.splice(index, 1);
            removed = true;
        }
        if (!removed) {
            // Stopping a scene that is already inactive is a legitimate ADS pattern: a
            // sibling branch already stopped it, or it was never added this cycle. The
            // original engine removes by content-addressed display-list node, so an
            // absent node is a silent no-op -- not an error. Keep it as a gated
            // diagnostic for scene-lifecycle debugging rather than console noise.
            verboseLog(`STOP_SCENE ${s.sceneIdx}:${s.tagId}: already inactive (no-op)`);
        }
    });
    state.removeScenes = [];

    state.addScenes.forEach((s) => {
        const key = `${s.sceneIdx}:${s.tagId}`;
        // Block a re-poll from resurrecting a scene explicitly stopped on an
        // earlier tick (its predecessor's IF_PLAYED guard is permanently true).
        // A same-batch STOP+ADD restart is exempt (removedThisBatch), and any
        // legitimate fresh add clears the stopped mark.
        if (state.stoppedScenes?.has(key) && !removedThisBatch.has(key)) return;
        state.stoppedScenes?.delete(key);
        const scene = getSceneState(state, s.sceneIdx, s.tagId, s.runCount, s.proportion);
        if (scene !== undefined) {
            if (s.runMode) scene.runMode = s.runMode;
            // The fresh execution supersedes the completed instance recorded
            // during the removal phase above.
            state.playedHistory.delete(`${s.sceneIdx}:${s.tagId}`);
            if (scene.environment?.owner === scene && !scene.environment.ready) {
                // Every TTM environment initializes independently of unrelated active resources.
                scene.execution = runScript(scene.state, scene.script || scene.state.script);
                if (scene.state.reentry >= (scene.prologueLength || 0)) scene.environment.ready = true;
            }
            // Draw this scene's first frame on the tick it is added (the original
            // arms then draws within one tick), even if that tick is not a WM_TIMER
            // present tick -- so a hand-off successor appears the same tick the
            // finished predecessor drops, with no background-only frame between.
            scene.needsFirstFrame = true;
            sceneLog(state, 'ADD_SCENE', sceneLabel(state.scenesRes, s.sceneIdx, s.tagId));
            state.scenes.push(scene);
        }
    });
    state.addScenes = [];
};

/**
 * ADS 0x1510 is the end of a conditional branch. Scene mutations become
 * visible here, but unrelated active sequences do not block ADS execution.
 * Dependency opcodes such as IF_PLAYED provide the authored synchronization.
 */
export const END_SCENE_BRANCH = (state) => {
    applySceneChanges(state);
    state.continue = true;
};

export const END_WHILE = (state) => {
    END_SCENE_BRANCH(state);
};

export const STOP_SCENE = (state, sceneIdx, tagId, retries) => {
    // `stop: true` marks this as an EXPLICIT stop (0x2010), distinct from the
    // IF_PLAYED cleanup-removal of a lingering finished instance. Under the
    // per-slot re-poll driver a predecessor chunk's guard (e.g. slot 9's
    // IF_PLAYED[3,53]) stays permanently true and would RE-ADD an explicitly
    // stopped scene (3:143) every tick -- reviving it on top of its successor
    // (the 3:140 walk), the double-Johnny/overlap. applySceneChanges records the
    // explicit stop so a later re-poll cannot resurrect it (binary: a stopped
    // display-list node stays present-as-finished, so its ADD is deduped).
    state.removeScenes.push({
        sceneIdx,
        tagId,
        retries,
        stop: true,
    });
};

export const RANDOM_START = (state) => {
    state.randomize = true;
    state.scenesRandom = [];
};

export const RANDOM_UNKNOWN_0 = (state) => {};

export const RANDOM_END = (state) => {
    state.randomize = false;
    if (typeof state.random !== 'function') {
        throw new TypeError('ADS runtime requires an injected random source');
    }
    const staged = state.scenesRandom;
    if (staged.length === 0) return;

    // Binary FUN_1048_0cda: RANDOM picks a staged ADD_SCENE WEIGHTED by its 4th arg
    // (`proportion`, extracted by FUN_1048_0c8d) -- sum the weights, draw rng in
    // [0,total), walk the cumulative weight. jc_reborn does the same (rand()%total).
    // The port previously picked UNIFORMLY (Math.floor(random()*len)), ignoring the
    // per-branch weight the parser already stashes (crosscheck B2). e.g. FISHING tag 2
    // stages {1:38 w=5, 1:21 w=3, 1:22 w=3, 1:23 w=3, 1:15 w=1}: uniform breaks the
    // ambient via 1:15 at 1/5, weighted at the faithful 1/15. Exactly one rng draw is
    // consumed either way, preserving draw accounting.
    const weightOf = (s) => (Number.isFinite(s.proportion) ? s.proportion : 0);
    const total = staged.reduce((sum, s) => sum + weightOf(s), 0);

    // Binary parity (FUN_1048_0cda): total weight 0 -> add NOTHING and consume no rng
    // draw (it early-returns before the pick). No shipped RANDOM block has total 0, so
    // this is unreachable on real data, but matching the binary keeps it faithful if
    // data ever changes -- and avoids a phantom draw/scene the original would not make.
    if (total <= 0) return;

    // This is the engine's ONLY validated consumer of the binary's baked
    // lagged-Fibonacci stream. The RANDOM opcode (jump-table 0x3010 ->
    // FUN_1048_1629 -> FUN_1048_0cda, decompiled.c:14458) draws EXACTLY ONE raw
    // 16-bit word and maps it to an index in 1..total via
    //   iVar3 = abs((int16)(word % total)) + 1;
    // then walks the staged branches subtracting each weight until the running
    // value drops below 1 -- selecting the first branch whose cumulative weight
    // reaches iVar3. `state.faithfulPick` (bound to the faithful RNG's pick(),
    // src/dgds/scripting/faithful-rng.mjs) reproduces that word->index mapping
    // bit-for-bit; when it is the injected default the story's RANDOM choices are
    // driven by the original's exact stream. When absent (unit/golden harnesses
    // that inject only a Math.random-shaped source) we fall back to the
    // stream-faithful-but-mapping-approximate floor(random()*total): both consume
    // one draw and honor the same per-branch weighting, preserving draw accounting.
    let scene;
    if (typeof state.faithfulPick === 'function') {
        let roll = state.faithfulPick(total); // 1..total (binary abs((int16)word%total)+1)
        for (const candidate of staged) {
            roll -= weightOf(candidate);
            if (roll < 1) {
                scene = candidate;
                break;
            }
        }
    } else {
        let roll = Math.floor(state.random() * total);
        for (const candidate of staged) {
            roll -= weightOf(candidate);
            if (roll < 0) {
                scene = candidate;
                break;
            }
        }
    }
    if (scene === undefined) scene = staged[staged.length - 1];

    ADD_SCENE(state, scene.sceneIdx, scene.tagId, scene.runCount, scene.proportion);
};

export const MOVE_SEQUENCE_TO_BACK = (state, sceneIdx, tagId) => {
    moveSequenceToBack(state.ttmSequenceOrder, sceneIdx, tagId);
};
export const RUN_SCRIPT = (state) => {};

export const END = (state) => {
    // NOTE: END toggles state.continue. The authoritative end-of-script signal is detected in
    // runScript() when reentry reaches script.length-1, which sets state.played = true and
    // advances currentScene. This toggle is a secondary signal used by the scene cleanup path.
    if (!state.continue) {
        state.continue = true;
    } else if (state.continue) {
        state.continue = false;
    }
    if (state.lastCommand) {
        // A host-selected ADS segment may start its concluding child immediately
        // before END. The runtime keeps that batch alive until its finite children
        // complete, then clears any unbounded ambient loops with it.
        if (!state.singleAdsScene) clearAdsSceneBatch(state);
        state.continue = true;
    }
};

// CUSTOM COMMAND
export const END_IF = (state) => {};
