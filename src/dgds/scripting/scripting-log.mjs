/**
 * scripting-log.mjs — shared scene-lifecycle logging helpers for the TTM/ADS
 * opcode layers.
 *
 * Debug logging — emitters live in the canonical `log.mjs`; the host decides
 * whether anything prints by pushing flags in via setLogging(). Re-exported
 * here so existing opcode-layer importers keep a stable path.
 *
 * Split out of script-runner.mjs so the TTM/ADS opcode modules and the
 * dispatch-table module can all depend on these leaf helpers without
 * importing back through script-runner.mjs (which would create a cycle).
 */
import { traceEvent } from './trace-event.mjs';
import { debugLog, getTimestamp, isConsoleLogging, verboseLog } from './log.mjs';

export { debugLog, verboseLog };

export const sceneLog = (state, action, target = '') => {
    let gagId = state.gagId ?? '?';
    if (state.data && state.data.scenes && state.data.scenes[state.currentScene]) {
        const tId = state.data.scenes[state.currentScene].tagId;
        gagId = typeof tId === 'object' ? tId.id : (tId ?? '?');
    }
    if (typeof gagId === 'object') gagId = gagId.id ?? '?';

    traceEvent(state, 'scene-lifecycle', {
        action,
        target,
        gagId,
        runs: state.runs || 0,
    });
    if (!isConsoleLogging()) return;

    let runStr = '';
    if (state.runs !== undefined && state.runs > 0) runStr = `R:${state.runs}`;
    const cycles = [runStr].filter(Boolean).join(' ');

    const gagStr = `[Gag ${String(gagId).padEnd(2, ' ')}]`.padEnd(9, ' ');
    const actStr = action.padEnd(12, ' ');
    const tgtStr = target.padEnd(25, ' ');
    const cycStr = cycles ? `(${cycles})` : '';

    console.log(`[${getTimestamp()}] ${gagStr} | ${actStr} | ${tgtStr} | ${cycStr}`);
};

/**
 * Build a human-readable label for a TTM child scene, including the tag
 * description if available: e.g. "4:113(flip pages)" or "4:113".
 */
export const sceneLabel = (scenesRes, sceneIdx, tagId) => {
    const desc = scenesRes?.[sceneIdx]?.tags?.find((t) => t.id === tagId)?.description;
    return desc ? `${sceneIdx}:${tagId}(${desc})` : `${sceneIdx}:${tagId}`;
};
