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
 * EDGE-TRIGGERED -- ONCE when the scene finishes -- NOT every tick while it
 * lingers played. Under the per-slot re-poll we must reproduce that edge for a
 * NON-IDEMPOTENT body:
 *
 * A body containing a 0x3010 RANDOM block picks a DIFFERENT scene each time it
 * runs (RANDOM_END commits one of several staged ADDs). If the re-poll re-ran
 * it every tick while the trigger sits present-as-finished, it would spawn a
 * fresh pick per tick -- the FISHING action-loop pile-up (IF_PLAYED[1:10] OR
 * [21]OR[22]OR[23]OR[38] -> RANDOM{...}: once one action is played the
 * OR-guard is permanently true, so a naive re-poll fires a new random action
 * every tick). Fire it ONCE per finished instance (scene.handoffFired), then
 * skip until the trigger re-arms (a re-armed scene is a NEW object with no
 * flag).
 *
 * A plain-ADD body is IDEMPOTENT (ADD_SCENE's presence-dedup makes a re-poll a
 * no-op while the target is present), so re-running it every tick is safe. A
 * genuine SELF-rearming plain-ADD chunk (IF_PLAYED[s,t] -> ADD s:t, the
 * campfire flame 3:44) MUST remove the finished instance so its ADD restarts
 * it -- that is how the flame keeps burning. STOP_SCENE's explicit-stop guard
 * still keeps a stopped flame dead.
 */
const handleIfPlayedFinishedBranch = (state, script, scene, sceneIdx, tagId) => {
    if (chunkBodyHasRandom(script, state.reentryNow)) {
        if (scene.handoffFired) {
            state.continue = true;
            handleIfCondition(state, false); // already fired this instance -> skip the RANDOM body
            return;
        }
        scene.handoffFired = true;
        state.continue = true;
        handleIfCondition(state, true); // fire the RANDOM pick exactly once
        return;
    }
    if (isSelfRearmingSequence(state, sceneIdx, tagId)) {
        state.removeScenes.push({ sceneIdx, tagId });
    }
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
