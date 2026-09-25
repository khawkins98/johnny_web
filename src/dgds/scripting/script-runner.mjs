/**
 * script-runner.mjs — runScript(), the TTM frame interpreter, plus re-exports of
 * the opcode layer's public surface so existing importers keep a stable path.
 *
 * The opcode callbacks and dispatch table that used to live in this file were
 * split out by responsibility:
 *   - ./scripting-log.mjs      — sceneLog/sceneLabel/debugLog/verboseLog
 *   - ./ttm-opcodes.mjs        — TTM opcode callbacks
 *   - ./script-dispatch.mjs    — TTMDispatch table
 *   - ./ads-walker.mjs         — the ADS interpreter (not callback-dispatched)
 *   - ./ads-scene-changes.mjs  — the ADS node table over the child-scene list
 *
 * All opcode callbacks are plain functions of the form (state, ...params).
 * They are kept as plain functions (not class methods) so tests can call them directly.
 */
import { ExecutionStatus, executionOutcome } from './execution-outcome.mjs';
import { debugLog, verboseLog, sceneLog, sceneLabel } from './scripting-log.mjs';
import { TTMDispatch } from './script-dispatch.mjs';

export { debugLog, verboseLog, sceneLog, sceneLabel, TTMDispatch };

// ---------------------------------------------------------------------------
// Script runner
// ---------------------------------------------------------------------------

/**
 * Run a TTM prologue's setup ops (palette, screen, image slots) outside any frame.
 * UPDATE is skipped: the prologue is not a frame of any thread (see
 * addSceneNode), so it must not produce a frame boundary.
 */
export const runSetupOps = (state, ops) => {
    for (const c of ops) {
        if (c.opcode === 0x0ff0) continue;
        TTMDispatch.find((ct) => ct.opcode === c.opcode)?.callback(state, ...c.params);
    }
};

const completeScript = (state, reason) => {
    state.lastCommand = true;
    state.reentry = 0;
    state.runs++;
    state.played = true;
    if (state.type === 'TTM') {
        if (state.sceneIdx !== undefined) {
            sceneLog(state, 'TTM_DONE', sceneLabel(state.scenesRes, state.sceneIdx, state.tagId));
        }
    }
    return executionOutcome(ExecutionStatus.COMPLETED, state, { reason });
};

export const runScript = (state, script) => {
    // NOTE: state.reentry acts as a "program counter" — index into script[] where execution
    // resumes next frame. Each TTM child scene has its own state object with its own reentry.
    if (script === undefined || state.reentry === -1) {
        return executionOutcome(ExecutionStatus.COMPLETED, state, { reason: 'no-script' });
    }
    // A PURGE frame (see ttm-opcodes PURGE) whose hold has elapsed ends the
    // sequence here. Any ops after that frame (e.g. MJBATH 24 "preen timer"'s
    // frames after its first PURGE) are dead code in the original.
    if (state.endOfSequence) {
        state.endOfSequence = false;
        // The held frame's UPDATE is never resumed, so clear its pause here, as
        // resuming it would have, so a retried or re-added pass runs again.
        state.frameReady = false;
        state.continue = true;
        return completeScript(state, 'purge');
    }
    // GOTO sets gotoRestart=true to request a restart from index 0 on the NEXT call.
    // This cannot be done inside the GOTO callback itself because the for-loop below
    // overwrites state.reentry with the current index immediately after the callback returns.
    // Also restore continue=true so the fresh run isn't blocked by the paused state GOTO left.
    if (state.gotoRestart) {
        state.gotoRestart = false;
        state.reentry = 0;
        state.continue = true;
    }
    for (let i = state.reentry; i < script.length; i++) {
        const c = script[i];
        const type = TTMDispatch.find((ct) => ct.opcode === c.opcode);
        if (!type) {
            continue;
        }
        if (i === script.length - 1) {
            state.lastCommand = true;
        }
        state.reentryNow = i; // expose current index to callbacks
        type.callback(state, ...c.params);
        if (state.jumpTo !== undefined) {
            // Callback requested a forward jump.
            i = state.jumpTo - 1; // -1 because the loop will i++ before next iteration
            state.reentry = i;
            state.jumpTo = undefined;
        } else {
            state.reentry = i;
        }
        if (!state.continue) {
            break;
        }
    }
    if (state.reentry === script.length - 1 && !state.gotoRestart && state.continue) {
        state.endOfSequence = false;
        return completeScript(state, 'end-of-script');
    }
    if (state.gotoRestart) {
        state.endOfSequence = false;
        state.runs++;
        return executionOutcome(ExecutionStatus.LOOPED, state, { reason: 'goto' });
    }
    const frameBoundary = state.frameBoundary;
    state.frameBoundary = null;
    // The end-of-sequence mark only matters at a frame boundary: that frame is held for
    // its delay and then ends the sequence.
    if (!frameBoundary) state.endOfSequence = false;
    return executionOutcome(
        ExecutionStatus.YIELDED,
        state,
        frameBoundary
            ? { reason: 'frame-boundary', frameBoundary }
            : { reason: state.continue ? 'advanced' : 'blocked' },
    );
};
