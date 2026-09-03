/**
 * script-runner.mjs — runScript(), plus re-exports of the ADS/TTM opcode
 * layer's public surface so existing importers keep a stable path.
 *
 * The opcode callbacks and dispatch tables that used to live in this file
 * were split out by responsibility:
 *   - ./scripting-log.mjs      — sceneLog/sceneLabel/debugLog/verboseLog
 *   - ./ttm-opcodes.mjs        — TTM opcode callbacks
 *   - ./ads-opcodes.mjs        — ADS conditional opcode callbacks (IF_*, WHILE_RUNNING, AND/OR)
 *   - ./ads-scene-changes.mjs  — ADS display-list mutation opcodes (ADD/STOP/RANDOM/END*)
 *                                 and applySceneChanges/clearAdsSceneBatch
 *   - ./script-dispatch.mjs    — TTMDispatch / ADSDispatch tables
 *
 * All opcode callbacks are plain functions of the form (state, ...params).
 * They are kept as plain functions (not class methods) so tests can call them directly.
 */
import { ExecutionStatus, executionOutcome } from './execution-outcome.mjs';
import { debugLog, verboseLog, sceneLog, sceneLabel } from './scripting-log.mjs';
import { applySceneChanges, clearAdsSceneBatch } from './ads-scene-changes.mjs';
import { TTMDispatch, ADSDispatch } from './script-dispatch.mjs';

export { debugLog, verboseLog, sceneLog, sceneLabel, applySceneChanges, clearAdsSceneBatch, TTMDispatch, ADSDispatch };

// ---------------------------------------------------------------------------
// Script runner
// ---------------------------------------------------------------------------

export const runScript = (state, script, main = false) => {
    // NOTE: state.reentry acts as a "program counter" — index into script[] where execution
    // resumes next frame. Shared at the top level because only one ADS scene runs at a time.
    // TTM child scenes use their own state objects (each has its own reentry).
    if (script === undefined || state.reentry === -1) {
        return executionOutcome(ExecutionStatus.COMPLETED, state, { reason: 'no-script' });
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
    const dispatchTable = state.type === 'ADS' ? ADSDispatch : TTMDispatch;
    for (let i = state.reentry; i < script.length; i++) {
        const c = script[i];
        const type = dispatchTable.find((ct) => ct.opcode === c.opcode);
        if (!type) {
            continue;
        }
        if (i === script.length - 1) {
            state.lastCommand = true;
        }
        state.reentryNow = i; // expose current index to callbacks (e.g. IF_NOT_PLAYED jump)
        type.callback(state, ...c.params);
        if (state.jumpTo !== undefined) {
            // Callback requested a forward jump (e.g. IF_NOT_PLAYED skipping a block).
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
        state.lastCommand = true;
        state.reentry = 0;
        state.runs++;
        state.played = true;
        if (main) {
            state.currentScene++;
            // Reset lastCommand so the next ADS scene's intermediate END doesn't
            // inherit the stale "final command" flag and prematurely clear child scenes.
            state.lastCommand = false;
            // Reset OR-chain state so it doesn't bleed into the next ADS scene.
            state.orMode = false;
            state.orChainPassed = false;
        }
        if (state.type === 'TTM') {
            if (state.sceneIdx !== undefined) {
                sceneLog(state, 'TTM_DONE', sceneLabel(state.scenesRes, state.sceneIdx, state.tagId));
            }
        }
        return executionOutcome(ExecutionStatus.COMPLETED, state, { reason: 'end-of-script' });
    }
    if (state.gotoRestart) {
        state.runs++;
        return executionOutcome(ExecutionStatus.LOOPED, state, { reason: 'goto' });
    }
    const frameBoundary = state.frameBoundary;
    state.frameBoundary = null;
    return executionOutcome(
        ExecutionStatus.YIELDED,
        state,
        frameBoundary
            ? { reason: 'frame-boundary', frameBoundary }
            : { reason: state.continue ? 'advanced' : 'blocked' },
    );
};
