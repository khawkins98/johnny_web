/**
 * ads-opcodes.mjs — ADS conditional/control opcode callbacks (WHILE_RUNNING,
 * the IF_* family, AND/OR) plus their shared IF-condition helpers.
 *
 * Split out of script-runner.mjs; see ads-scene-changes.mjs for the opcodes
 * that mutate the child-scene display list, and script-dispatch.mjs for the
 * ADSDispatch table that wires these into opcode numbers.
 */
import { isSelfRearmingSequence } from './scene-factory.mjs';
import { isTtmFinished, isTtmRunning } from './ttm-run-state.mjs';
import { applySceneChanges, hasPendingSceneChange } from './ads-scene-changes.mjs';

export const WHILE_RUNNING = (state, sceneIdx, tagId) => {
    const scene = state.scenes.find((s) => s.sceneIdx === sceneIdx && s.tagId === tagId);
    state.continue = !isTtmRunning(scene);
};

/**
 * Find the matching END_IF (0xfff0) for an IF opcode at `ifIndex`.
 * Scans forward tracking nesting depth: IF opcodes increment depth,
 * END_IF decrements; returns the index where depth reaches 0.
 * Returns -1 if no matching END_IF is found.
 */
const IF_OPCODES = new Set([0x1330, 0x1350, 0x1360, 0x1370]);
const findMatchingEndIf = (script, ifIndex, stopAtOr = false) => {
    let depth = 1;
    for (let i = ifIndex + 1; i < script.length; i++) {
        if (IF_OPCODES.has(script[i].opcode)) {
            const prevOp = script[i - 1]?.opcode;
            if (prevOp !== 0x1420 && prevOp !== 0x1430) depth++;
        } else if (script[i].opcode === 0xfff0) {
            if (--depth === 0) return i;
        } else if (stopAtOr && script[i].opcode === 0x1430 && depth === 1) {
            return i - 1; // Return the index BEFORE the OR, so jumpTo = i (the OR opcode)
        }
    }
    return -1;
};

/**
 * Does the IF body starting after `ifIndex` contain a RANDOM block
 * (RANDOM_START 0x3010)? A RANDOM block is the only NON-idempotent ADS chunk
 * body: RANDOM_END picks ONE of several staged ADD_SCENEs, so re-running it
 * picks a different scene. IF_PLAYED uses this to decide whether re-running a
 * body the finish-dispatch already fired is safe (idempotent -> leave it) or
 * harmful (RANDOM -> skip). Scans only this IF's own body, stopping at its
 * matching END_IF so a RANDOM block in a LATER sibling branch does not count.
 */
const chunkBodyHasRandom = (script, ifIndex) => {
    if (!script) return false;
    const end = findMatchingEndIf(script, ifIndex);
    const limit = end === -1 ? script.length : end;
    for (let i = ifIndex + 1; i < limit; i++) {
        if (script[i].opcode === 0x3010) return true;
    }
    return false;
};

const handleIfCondition = (state, conditionPassed) => {
    const wasOrMode = state.orMode;
    state.orMode = false;

    if (!wasOrMode) {
        state.orChainPassed = false;
    }

    if (state.orChainPassed) {
        conditionPassed = true;
    } else if (conditionPassed && wasOrMode) {
        state.orChainPassed = true;
    }

    // Read the script `state.reentryNow` actually indexes: `state.activeAdsScript`
    // (#adsScripts[currentScene] in the linear path; the resolved chunk script
    // during finish-dispatch, set by runtime.mjs #dispatchAdsFinishChunks). NOT
    // the raw `state.data.scenes[currentScene].script`: during the
    // concluding-children hold `state.currentScene === state.adsSceneEnd` sits
    // PAST the last scene, so `state.data.scenes[currentScene]` is undefined and
    // `.script` throws -- a crash a chunk body's nested/OR-chained IF opcode hits
    // when the finish-dispatch fires it during that hold. Fall back to the raw
    // script (guarded) for callers that drive an IF without activeAdsScript set.
    const script = state.activeAdsScript ?? state.data.scenes[state.currentScene]?.script;
    if (!script) {
        // No resolvable script (no active script and currentScene out of range):
        // cannot evaluate AND/OR follow-up or find a matching END_IF, so treat as
        // a terminal pass -- never index into `undefined`.
        state.orChainPassed = false;
        state.continue = true;
        return;
    }
    const nextOpcode = script[state.reentryNow + 1]?.opcode;

    if (nextOpcode === 0x1430) {
        // OR
        if (conditionPassed) {
            state.orChainPassed = true;
        }
        state.continue = true;
        return;
    }

    if (nextOpcode === 0x1420) {
        // AND
        if (!conditionPassed) {
            // Short-circuit: fail the entire AND chain immediately.
            const endIfIdx = findMatchingEndIf(script, state.reentryNow, true);
            if (endIfIdx !== -1) {
                state.jumpTo = endIfIdx + 1;
            }
            state.orChainPassed = false;
        }
        state.continue = true;
        return;
    }

    // Terminal condition (no AND/OR follows)
    if (!conditionPassed) {
        const endIfIdx = findMatchingEndIf(script, state.reentryNow);
        if (endIfIdx !== -1) {
            state.jumpTo = endIfIdx + 1;
        }
    }

    state.orChainPassed = false;
    state.continue = true;
};

/**
 * IF_PLAYED's "present + finished" branch (the guard's scene is still in the
 * display list but has finished playing). The binary keeps the finished node
 * present until STOP/gag-clear, and the handoff to the successor fires
 * EDGE-TRIGGERED -- ONCE per COMPLETION of the guard scene -- NOT every tick
 * while it lingers played (jc_reborn names 0x1350 IF_LASTPLAYED for this
 * reason). Under the per-slot re-poll we reproduce that edge for EVERY body:
 * fire once per finished instance and guard position (scene.handoffFiredAt),
 * then evaluate false until the trigger re-arms (a re-armed scene is a NEW
 * object with no flag, so its next completion is a new edge).
 *
 * Why the edge must be explicit rather than "plain-ADD bodies are idempotent
 * under presence-dedup": ADD_SCENE inside an edge-fired body RESTARTS a target
 * whose previous instance has finished (see ADD_SCENE). That is what lets an
 * authored cycle such as BUILDING.ADS tag 2's
 *   IF_PLAYED 1:79 -> ADD 1:74;  IF_PLAYED 1:74 -> ADD 1:77;  IF_PLAYED 1:77 -> ADD 1:79
 * keep cycling until the gag's fade, as the original does (reference lifespans
 * for 1:74/1:77/1:70/1:75/1:72/1:76/1:73/1:78 are 185-306 ticks, i.e. 13-19
 * repetitions of a 13-17 tick animation; the pre-edge port played each once).
 * A level-triggered re-poll with restart-on-ADD would instead re-add the
 * target every tick it sits finished (the FISHING action-loop pile-up:
 * IF_PLAYED[1:10] OR [21]OR[22]OR[23]OR[38] -> RANDOM{...}), so the edge is
 * the load-bearing half.
 *
 * A genuine SELF-rearming chunk (IF_PLAYED[s,t] -> ADD s:t, the campfire flame
 * 3:44) still removes the finished instance up front so ADD_SCENE's `rearmed`
 * (KEEP_GOING) path sees the pending removal -- that is how the flame keeps
 * burning. STOP_SCENE's explicit-stop guard still keeps a stopped flame dead.
 */
const handleIfPlayedFinishedBranch = (state, script, scene, sceneIdx, tagId) => {
    scene.handoffFiredAt ||= new Set();
    if (scene.handoffFiredAt.has(state.reentryNow)) {
        state.continue = true;
        handleIfCondition(state, false); // already fired for this instance -> skip the body
        return;
    }
    scene.handoffFiredAt.add(state.reentryNow);
    const bodyHasRandom = chunkBodyHasRandom(script, state.reentryNow);
    if (!bodyHasRandom && isSelfRearmingSequence(state, sceneIdx, tagId)) {
        state.removeScenes.push({ sceneIdx, tagId });
    }
    // The rest of this pass is an edge-fired handoff body: a PLAIN body's
    // ADD_SCENE may restart a finished-present target (the authored chains).
    // A RANDOM body keeps the presence-dedup for its re-pick: the reference data
    // for ACTIVITY:7 (reading loop plays once, 0x1070 local override) and
    // FISHING:2 (serial action loop) only pins the plain-chain behaviour, so the
    // RANDOM re-add is left as is until it is grounded. Cleared at the start of
    // every slot pass.
    state.handoffEdge = !bodyHasRandom;
    state.continue = true;
    handleIfCondition(state, true);
};

const isSceneDone = (scene) => isTtmFinished(scene);

const isSceneRunning = (state, sceneIdx, tagId) => {
    // ADS mutates a sequence's run flag immediately. We stage collection
    // changes until the branch boundary, so conditions later in the same
    // branch must still observe those pending starts and stops.
    if (hasPendingSceneChange(state.removeScenes, sceneIdx, tagId)) return false;
    if (hasPendingSceneChange(state.addScenes, sceneIdx, tagId)) return true;
    const scene = state.scenes.find((candidate) => candidate.sceneIdx === sceneIdx && candidate.tagId === tagId);
    return isTtmRunning(scene);
};

export const IF_NOT_PLAYED = (state, sceneIdx, tagId) => {
    if (state.orMode && state.orChainPassed) {
        handleIfCondition(state, true);
        return;
    }

    const played =
        state.playedHistory.has(`${sceneIdx}:${tagId}`) ||
        state.scenes.some((s) => s.sceneIdx === sceneIdx && s.tagId === tagId && isSceneDone(s));

    handleIfCondition(state, !played);
};

export const IF_PLAYED = (state, sceneIdx, tagId) => {
    if (state.continue) {
        state.continue = false;
    }

    if (state.orMode && state.orChainPassed) {
        state.continue = true;
        handleIfCondition(state, true);
        return;
    }

    const key = `${sceneIdx}:${tagId}`;

    // Bind to the EXPANDED script that `state.reentryNow` actually indexes
    // (`state.activeAdsScript` = #adsScripts[currentScene], post-0xf200 inlining),
    // NOT the raw `state.data.scenes[...].script` -- the finished-instance
    // self-rearm exception below scans this region via chunkBodyHasRandom, so it
    // must be the region reentryNow points at. Fall back to the raw script for
    // callers that drive IF_PLAYED without activeAdsScript set.
    const script = state.activeAdsScript ?? state.data.scenes[state.currentScene]?.script;

    const scene = state.scenes.find((s) => s.sceneIdx === sceneIdx && s.tagId === tagId);
    const done = scene !== undefined && isSceneDone(scene);

    if (state.playedHistory.has(key)) {
        state.continue = true;
        handleIfCondition(state, true);
        return;
    }

    if (scene !== undefined) {
        if (done) {
            // Present + finished: the guard is satisfied -- see
            // handleIfPlayedFinishedBranch for the RANDOM-vs-plain-ADD /
            // edge-vs-every-tick distinction this depends on.
            handleIfPlayedFinishedBranch(state, script, scene, sceneIdx, tagId);
        } else {
            // Still playing and not dispatch-owned -> BLOCK (keep state.continue = false)
        }
        return;
    }

    // Never added this cycle -> evaluate false
    state.continue = true;
    handleIfCondition(state, false);
};

export const IF_NOT_RUNNING = (state, sceneIdx, tagId) => {
    if (state.orMode && state.orChainPassed) {
        handleIfCondition(state, true);
        return;
    }

    if (
        hasPendingSceneChange(state.addScenes, sceneIdx, tagId) ||
        hasPendingSceneChange(state.removeScenes, sceneIdx, tagId)
    ) {
        // The original run flag changes at ADD/STOP. Materialize our staged
        // collection change before waiting so the TTM can advance meanwhile.
        applySceneChanges(state);
    }

    // Skip-if-running (binary 0x1360, evaluated LIVE each tick): if the watched
    // child is running the guard is FALSE and the body is skipped THIS tick; the
    // per-slot re-poll driver re-arms the chunk and re-evaluates next tick. There
    // is NO wait-barrier (the port's old `state.continue=false` park that resumed
    // the SAME pass) -- that barrier re-fired the smoke branch a second time under
    // resume, spawning the double-Johnny, and stood in for the missing re-poll.
    const scene = state.scenes.find((candidate) => candidate.sceneIdx === sceneIdx && candidate.tagId === tagId);
    handleIfCondition(state, !isTtmRunning(scene));
};

export const IF_RUNNING = (state, sceneIdx, tagId) => {
    if (state.orMode && state.orChainPassed) {
        handleIfCondition(state, true);
        return;
    }
    handleIfCondition(state, isSceneRunning(state, sceneIdx, tagId));
};

export const AND = (state) => {};
export const OR = (state) => {
    state.orMode = true;
};
