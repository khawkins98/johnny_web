/**
 * script-runner.mjs — ADS/TTM opcode callbacks, dispatch tables, and runScript.
 *
 * All opcode callbacks are plain functions of the form (state, ...params).
 * They are kept as plain functions (not class methods) so tests can call them directly.
 */
import { PALETTE } from '../palette.mjs';
import { getSceneState, isSelfRearmingSequence } from './scene-factory.mjs';
import { traceEvent } from './trace-event.mjs';
import { debugLog, getTimestamp, isConsoleLogging, verboseLog } from './log.mjs';
import { ExecutionStatus, executionOutcome } from './execution-outcome.mjs';
import { beginSceneFrame } from './scene-frame.mjs';
import { createFrameBoundary } from './frame-timing.mjs';
import { emitPlaySample } from './audio-operation.mjs';
import { emitFrameOperation, FrameOperationType } from './frame-operation.mjs';
import { loadScreen } from './background-resources.mjs';
import { pruneEnvironmentBackground } from './composition.mjs';
import { isTtmFinished, isTtmRunning, TtmRunMode } from './ttm-run-state.mjs';
import { moveSequenceToBack } from './ttm-sequence-order.mjs';

// ---------------------------------------------------------------------------
// Debug logging — emitters live in the canonical `log.mjs`; the host decides
// whether anything prints by pushing flags in via setLogging(). Re-exported
// here so existing opcode-layer importers keep a stable path.
// ---------------------------------------------------------------------------

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
        timer: state.timer || 0,
    });
    if (!isConsoleLogging()) return;

    let timerStr = '';
    let runStr = '';
    if (state.timer !== undefined && state.timer > 0) timerStr = `T:${Math.round(state.timer)}`;
    if (state.runs !== undefined && state.runs > 0) runStr = `R:${state.runs}`;
    const cycles = [timerStr, runStr].filter(Boolean).join(' ');

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

// ---------------------------------------------------------------------------
// TTM opcode callbacks
// ---------------------------------------------------------------------------

const SAVE_BACKGROUND = (state) => {};

const FREE_SHAPE = (state) => {
    state.res[state.slot] = undefined;
};

const PURGE = () => {};

const UPDATE = (state) => {
    if (state.frameReady) {
        state.frameReady = false;
        state.continue = true;
        return;
    }

    // UPDATE is a faithful DGDS frame boundary. The host scheduler decides how
    // the authored delay maps to browser time and later resumes this opcode.
    state.frameBoundary = createFrameBoundary(state.delay);
    state.continue = false;
};

const SET_DELAY = (state, delay) => {
    state.delay = Math.max(0, delay);
};

const SLOT_IMAGE = (state, slot) => {
    state.slot = slot;
};

const SLOT_PALETTE = (state) => {};
const TTM_UNKNOWN_0 = (state) => {};

const SET_SCENE = (state) => {};

const SET_BACKGROUND = (state, index) => {
    state.saveIndex = index;
};

const GOTO = (state, tagId) => {
    if (tagId !== state.tagId) {
        if (state.scenesRes && state.sceneIdx !== undefined) {
            const newScene = state.scenesRes[state.sceneIdx].scenes.find((s) => s.tagId === tagId);
            if (newScene) {
                state.script = newScene.script;
                state.tagId = tagId;
                state.reentry = 0;
            }
        }
    }
    state.gotoRestart = true;
    state.continue = false; // pause execution until next frame (like UPDATE)
};

const SET_COLORS = (state, fc, bc) => {
    if (fc < 16) {
        state.foregroundColor = PALETTE[fc];
    }
    if (bc < 16) {
        state.backgroundColor = PALETTE[bc];
    }
};

const SET_FRAME1 = (state) => {};

const SET_TIMER = (state, minimum, maximum) => {
    // Opcode 0x2020 is a random sleep measured in DGDS ticks. Randomness is
    // injected through state.random so interpreter traces can be deterministic.
    const low = Math.min(minimum, maximum);
    const high = Math.max(minimum, maximum);
    if (typeof state.random !== 'function') {
        throw new TypeError('TTM runtime requires an injected random source');
    }
    state.timer = low + Math.floor(state.random() * (high - low + 1));
};

const SET_CLIP_REGION = (state, x1, y1, x2, y2) => {
    state.clip = {
        x: x1,
        y: y1,
        width: x2 - x1 + 1,
        height: y2 - y1 + 1,
    };
};

const FADE_OUT = (state) => {};
const FADE_IN = (state) => {};

export const clearAdsSceneBatch = (state) => {
    state.scenes.forEach((s) => state.playedHistory.add(`${s.sceneIdx}:${s.tagId}`));
    state.scenes = [];
    state.addScenes = [];
    state.removeScenes = [];
    state.scenesRandom = [];
    emitFrameOperation(state, { type: FrameOperationType.CLEAR_SURFACE });
    if (state.saveBkg?.[0]) {
        state.saveBkg[0].canDraw = false;
    }
    // The raster was just cleared. Prune every environment's stored background so
    // stale pixels never carry into an unrelated sequence; after the clear, a
    // scene redraws its own content by executing its script, so no explicit
    // background re-bake is needed at this boundary.
    for (const sceneIdx of state.ttmEnvironments?.keys?.() || []) {
        pruneEnvironmentBackground(state, sceneIdx);
    }
};

// ADS-level fade to black. First call starts the animation (blocks ADS); each subsequent
// frame the opacity increases. Once fully black, the current segment is complete.
// The overlay is drawn in runScripts so it remains visible for the final frame even after
// the child scenes are cleared.
const ADS_FADE_OUT = (state) => {
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

const STORE_AREA = (state, x, y, width, height) => {
    const rect = { x, y, width, height };
    emitFrameOperation(state, {
        type: FrameOperationType.STORE_AREA,
        slot: 0,
        rect,
    });
    traceEvent(state, 'store-area', { slot: 0, rect });
};

const SAVE_IMAGE_REGION = (state, x, y, width, height) => {
    const rect = { x, y, width, height };
    emitFrameOperation(state, {
        type: FrameOperationType.SAVE_IMAGE_REGION,
        slot: state.saveIndex,
        rect,
    });
    traceEvent(state, 'getput-save', {
        slot: state.saveIndex,
        rect,
    });
};

const TTM_UNKNOWN_4 = (state, x, y, width, height) => {};

const SAVE_REGION = (state, x, y, width, height) => {};

// Wipes alter presentation timing in DOS but leave the composition unchanged.
// The browser presenter currently applies the final composition atomically.
const WIPE_RIGHT_TO_LEFT = () => {};

// Primitive draws bump the frame serial too, so a frame whose only change is a
// primitive (no sprite / BEGIN_SCENE_FRAME) still triggers a recomposite under the
// immediate-mode content signature. (No shipped scene has a primitive-only frame,
// but this keeps the invariant free of that assumption.)
const DRAW_LINE = (state, x1, y1, x2, y2) => {
    state.layerRevision = (state.layerRevision || 0) + 1;
    emitFrameOperation(state, {
        type: FrameOperationType.DRAW_LINE,
        x1,
        y1,
        x2,
        y2,
        color: 'white',
    });
};

const DRAW_RECT = (state, x, y, width, height) => {
    state.layerRevision = (state.layerRevision || 0) + 1;
    emitFrameOperation(state, {
        type: FrameOperationType.FILL_RECT,
        x,
        y,
        width,
        height,
        color: state.foregroundColor,
    });
};

const DRAW_BUBBLE = (state, x, y, width, height) => {
    state.layerRevision = (state.layerRevision || 0) + 1;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width / 2;
    emitFrameOperation(state, {
        type: FrameOperationType.FILL_CIRCLE,
        x: x + centerX,
        y: y + centerY,
        radius,
        color: 'white',
    });
};

const DRAW_SPRITE = (state, offsetX, offsetY, index, slot) => {
    if (state.res[slot] === undefined) return;
    const image = state.res[slot].images[index];
    if (image === undefined) return;
    verboseLog(
        `DRAW_SPRITE ${sceneLabel(state.scenesRes, state.sceneIdx, state.tagId)} frame=${index} slot=${slot} at (${offsetX},${offsetY})`,
    );
    emitFrameOperation(state, {
        type: FrameOperationType.DRAW_SPRITE,
        frame: index,
        slot,
        x: offsetX,
        y: offsetY,
        clip: { ...state.clip },
        flipX: false,
    });
    state.layerRevision = (state.layerRevision || 0) + 1;
    traceEvent(state, 'draw-sprite', {
        frame: index,
        slot,
        x: offsetX,
        y: offsetY,
        width: image.width,
        height: image.height,
        flipX: false,
        revision: state.layerRevision,
    });
};

const DRAW_SPRITE_FLIP = (state, offsetX, offsetY, index, slot) => {
    if (state.res[slot] === undefined) return;
    const image = state.res[slot].images[index];
    if (image === undefined) return;
    verboseLog(
        `DRAW_SPRITE_FLIP ${sceneLabel(state.scenesRes, state.sceneIdx, state.tagId)} frame=${index} slot=${slot} at (${offsetX},${offsetY})`,
    );
    emitFrameOperation(state, {
        type: FrameOperationType.DRAW_SPRITE,
        frame: index,
        slot,
        x: offsetX,
        y: offsetY,
        clip: { ...state.clip },
        flipX: true,
    });
    state.layerRevision = (state.layerRevision || 0) + 1;
    traceEvent(state, 'draw-sprite', {
        frame: index,
        slot,
        x: offsetX,
        y: offsetY,
        width: image.width,
        height: image.height,
        flipX: true,
        revision: state.layerRevision,
    });
};

const DRAW_SPRITE1 = (state) => {};
const DRAW_SPRITE3 = (state) => {};

const DRAW_GETPUT = (state, index) => {
    beginSceneFrame(state, index);
};

const DRAW_SCREEN = (state) => {};

const LOAD_SAMPLE = (state) => {};
const SELECT_SAMPLE = (state) => {};
const DESELECT_SAMPLE = (state) => {};

const PLAY_SAMPLE = (state, index) => {
    emitPlaySample(state, index);
    traceEvent(state, 'audio-sample', {
        action: 'requested',
        sample: index,
    });
};

const STOP_SAMPLE = (state) => {};

const LOAD_SCREEN = (state, name) => {
    loadScreen(state, name);
};

const LOAD_IMAGE = (state, name) => {
    name = state.game?.resources?.aliases?.[name] ?? name;
    const resource = state.resourceProvider.resolve(name);
    if (resource !== undefined) state.res[state.slot] = resource;
};

const LOAD_PALETTE = (state) => {};

// ---------------------------------------------------------------------------
// ADS opcode callbacks
// ---------------------------------------------------------------------------

const WHILE_RUNNING = (state, sceneIdx, tagId) => {
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

    const script = state.data.scenes[state.currentScene].script;
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

const isSceneDone = (scene) => isTtmFinished(scene);
const hasPendingSceneChange = (changes, sceneIdx, tagId) =>
    (changes || []).some((scene) => scene.sceneIdx === sceneIdx && scene.tagId === tagId);

const isSceneRunning = (state, sceneIdx, tagId) => {
    // ADS mutates a sequence's run flag immediately. We stage collection
    // changes until the branch boundary, so conditions later in the same
    // branch must still observe those pending starts and stops.
    if (hasPendingSceneChange(state.removeScenes, sceneIdx, tagId)) return false;
    if (hasPendingSceneChange(state.addScenes, sceneIdx, tagId)) return true;
    const scene = state.scenes.find((candidate) => candidate.sceneIdx === sceneIdx && candidate.tagId === tagId);
    return isTtmRunning(scene);
};

const IF_NOT_PLAYED = (state, sceneIdx, tagId) => {
    if (state.orMode && state.orChainPassed) {
        handleIfCondition(state, true);
        return;
    }

    const played =
        state.playedHistory.has(`${sceneIdx}:${tagId}`) ||
        state.scenes.some((s) => s.sceneIdx === sceneIdx && s.tagId === tagId && isSceneDone(s));

    handleIfCondition(state, !played);
};

const IF_PLAYED = (state, sceneIdx, tagId) => {
    if (state.continue) {
        state.continue = false;
    }

    if (state.orMode && state.orChainPassed) {
        state.continue = true;
        handleIfCondition(state, true);
        return;
    }

    if (state.playedHistory.has(`${sceneIdx}:${tagId}`)) {
        state.continue = true;
        handleIfCondition(state, true);
        return;
    }

    const scene = state.scenes.find((s) => s.sceneIdx === sceneIdx && s.tagId === tagId);

    if (scene !== undefined) {
        if (isSceneDone(scene)) {
            state.removeScenes.push({ sceneIdx, tagId });
            state.continue = true;
            handleIfCondition(state, true);
        } else {
            // Still playing -> BLOCK (keep state.continue = false)
        }
        return;
    }

    // Never added this cycle -> evaluate false
    state.continue = true;
    handleIfCondition(state, false);
};

const IF_NOT_RUNNING = (state, sceneIdx, tagId) => {
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

    const scene = state.scenes.find((candidate) => candidate.sceneIdx === sceneIdx && candidate.tagId === tagId);
    if (!isTtmRunning(scene)) {
        handleIfCondition(state, true);
        return;
    }

    const unboundedLoop =
        scene.execution?.status === ExecutionStatus.LOOPED &&
        scene.retries === 0 &&
        !Number.isFinite(scene.timeLimitTicks);
    if (unboundedLoop) {
        handleIfCondition(state, false);
        return;
    }

    // A finite child is a dependency barrier. Stay on this opcode while the
    // TTM controller advances it, then enter the branch once it has stopped.
    state.continue = false;
};

const IF_RUNNING = (state, sceneIdx, tagId) => {
    if (state.orMode && state.orChainPassed) {
        handleIfCondition(state, true);
        return;
    }
    handleIfCondition(state, isSceneRunning(state, sceneIdx, tagId));
};

const AND = (state) => {};
const OR = (state) => {
    state.orMode = true;
};

// ---------------------------------------------------------------------------
// More ADS callbacks that depend on getSceneState
// ---------------------------------------------------------------------------

const ADD_SCENE = (state, sceneIdx, tagId, runCount, proportion) => {
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

const applySceneChanges = (state) => {
    state.removeScenes.forEach((s) => {
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
const END_SCENE_BRANCH = (state) => {
    applySceneChanges(state);
    state.continue = true;
};
export { applySceneChanges };

const END_WHILE = (state) => {
    END_SCENE_BRANCH(state);
};

const STOP_SCENE = (state, sceneIdx, tagId, retries) => {
    state.removeScenes.push({
        sceneIdx,
        tagId,
        retries,
    });
};

const RANDOM_START = (state) => {
    state.randomize = true;
    state.scenesRandom = [];
};

const RANDOM_UNKNOWN_0 = (state) => {};

const RANDOM_END = (state) => {
    state.randomize = false;
    if (typeof state.random !== 'function') {
        throw new TypeError('ADS runtime requires an injected random source');
    }
    const index = Math.floor(state.random() * state.scenesRandom.length);
    const scene = state.scenesRandom[index];
    if (scene !== undefined) {
        ADD_SCENE(state, scene.sceneIdx, scene.tagId, scene.runCount, scene.proportion);
    }
};

const MOVE_SEQUENCE_TO_BACK = (state, sceneIdx, tagId) => {
    moveSequenceToBack(state.ttmSequenceOrder, sceneIdx, tagId);
};
const RUN_SCRIPT = (state) => {};

const END = (state) => {
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
const END_IF = (state) => {};

// ---------------------------------------------------------------------------
// Dispatch tables
// ---------------------------------------------------------------------------

export const TTMDispatch = [
    { opcode: 0x0020, callback: SAVE_BACKGROUND },
    { opcode: 0x0080, callback: FREE_SHAPE },
    { opcode: 0x0110, callback: PURGE },
    { opcode: 0x0ff0, callback: UPDATE },
    { opcode: 0x1020, callback: SET_DELAY },
    { opcode: 0x1050, callback: SLOT_IMAGE },
    { opcode: 0x1060, callback: SLOT_PALETTE },
    { opcode: 0x1100, callback: TTM_UNKNOWN_0 },
    { opcode: 0x1110, callback: SET_SCENE },
    { opcode: 0x1120, callback: SET_BACKGROUND },
    { opcode: 0x1200, callback: GOTO },
    { opcode: 0x2000, callback: SET_COLORS },
    { opcode: 0x2010, callback: SET_FRAME1 },
    { opcode: 0x2020, callback: SET_TIMER },
    { opcode: 0x4000, callback: SET_CLIP_REGION },
    { opcode: 0x4110, callback: FADE_OUT },
    { opcode: 0x4120, callback: FADE_IN },
    { opcode: 0x4200, callback: STORE_AREA },
    { opcode: 0x4210, callback: SAVE_IMAGE_REGION },
    { opcode: 0xa000, callback: TTM_UNKNOWN_4 },
    { opcode: 0xa050, callback: SAVE_REGION },
    { opcode: 0xa060, callback: WIPE_RIGHT_TO_LEFT },
    { opcode: 0xa0a0, callback: DRAW_LINE },
    { opcode: 0xa100, callback: DRAW_RECT },
    { opcode: 0xa400, callback: DRAW_BUBBLE },
    { opcode: 0xa500, callback: DRAW_SPRITE },
    { opcode: 0xa510, callback: DRAW_SPRITE1 },
    { opcode: 0xa520, callback: DRAW_SPRITE_FLIP },
    { opcode: 0xa530, callback: DRAW_SPRITE3 },
    { opcode: 0xa600, callback: DRAW_GETPUT },
    { opcode: 0xb600, callback: DRAW_SCREEN },
    { opcode: 0xc020, callback: LOAD_SAMPLE },
    { opcode: 0xc030, callback: SELECT_SAMPLE },
    { opcode: 0xc040, callback: DESELECT_SAMPLE },
    { opcode: 0xc050, callback: PLAY_SAMPLE },
    { opcode: 0xc060, callback: STOP_SAMPLE },
    { opcode: 0xf010, callback: LOAD_SCREEN },
    { opcode: 0xf020, callback: LOAD_IMAGE },
    { opcode: 0xf050, callback: LOAD_PALETTE },
];

// ADS-only opcodes. Kept separate from TTMDispatch so that opcodes sharing hex values
// with TTM entries (0x2010 STOP_SCENE, 0x4000 MOVE_SEQUENCE_TO_BACK, 0xf010 ADS_FADE_OUT) are
// reachable. runScript() selects the correct table based on state.type.
export const ADSDispatch = [
    { opcode: 0x1070, callback: WHILE_RUNNING },
    { opcode: 0x1330, callback: IF_NOT_PLAYED },
    { opcode: 0x1350, callback: IF_PLAYED },
    { opcode: 0x1360, callback: IF_NOT_RUNNING },
    { opcode: 0x1370, callback: IF_RUNNING },
    { opcode: 0x1420, callback: AND },
    { opcode: 0x1430, callback: OR },
    { opcode: 0x1510, callback: END_SCENE_BRANCH },
    { opcode: 0x1520, callback: END_WHILE },
    { opcode: 0x2005, callback: ADD_SCENE },
    { opcode: 0x2010, callback: STOP_SCENE },
    { opcode: 0x3010, callback: RANDOM_START },
    { opcode: 0x3020, callback: RANDOM_UNKNOWN_0 },
    { opcode: 0x30ff, callback: RANDOM_END },
    { opcode: 0x4000, callback: MOVE_SEQUENCE_TO_BACK },
    { opcode: 0xf010, callback: ADS_FADE_OUT },
    { opcode: 0xf200, callback: RUN_SCRIPT },
    { opcode: 0xffff, callback: END },
    // CUSTOM: Added for text script
    { opcode: 0xfff0, callback: END_IF },
];

// ---------------------------------------------------------------------------
// Content-addressed ADS handoff dispatch
//
// The linear `runScript` PC is a single-threaded scanner: once it parks on an
// unsatisfied IF_PLAYED, it cannot evaluate a LATER, already-satisfied
// IF_PLAYED in the same script this tick (the file-order handoff bug). The
// index below lets the runtime fire a scene's IF_PLAYED chunk the instant
// that scene reaches FINISHED, independent of the linear PC's position.
// ---------------------------------------------------------------------------

/**
 * Index every IF_PLAYED (0x1350) trigger in an ADS scene's (already-expanded)
 * script by the `(slot,tag)` it watches, mapping to the index of the opcode
 * immediately AFTER the IF_PLAYED itself (the start of its body). A single
 * (slot,tag) may have multiple triggering chunks, so each key maps to an
 * array of body-start indices, in file order.
 */
export const indexAdsChunks = (script) => {
    const map = new Map();
    for (let i = 0; i < script.length; i++) {
        if (script[i].opcode !== 0x1350) continue;
        const [slot, tag] = script[i].params;
        const key = `${slot}:${tag}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(i + 1);
    }
    return map;
};

/**
 * Execute one ADS IF_PLAYED chunk body in isolation, starting at `bodyStart`
 * (the index returned by `indexAdsChunks`) and running through opcodes until
 * the chunk's own END_SCENE_BRANCH (0x1510) is reached. This is a MINI
 * executor with a purely LOCAL index: it never reads or writes
 * `state.reentry`/`state.reentryNow`/`state.jumpTo` outside of the scratch
 * values it needs to drive individual callbacks (e.g. handleIfCondition for a
 * nested AND/OR inside the chunk), which are restored before returning. This
 * keeps the linear top-level program counter uncorrupted.
 *
 * Deliberately does NOT invoke the real END_SCENE_BRANCH callback for the
 * terminating 0x1510 -- that callback unconditionally commits AND clears
 * `state.addScenes`/`state.removeScenes` (applySceneChanges), which would
 * make a single fired chunk's staged changes invisible to any OTHER chunk
 * fired the same tick, and would collapse the "stage now, commit once" batch
 * semantics the caller relies on. The caller (the finish-dispatch loop in
 * runtime.mjs) commits once, after firing every matching chunk for the tick,
 * by calling the exported `applySceneChanges` itself.
 */
export const runAdsChunkBody = (state, script, bodyStart) => {
    const savedReentry = state.reentry;
    const savedReentryNow = state.reentryNow;
    const savedJumpTo = state.jumpTo;
    state.jumpTo = undefined;

    for (let j = bodyStart; j < script.length; j++) {
        const c = script[j];
        if (c.opcode === 0x1510) break; // chunk terminator; caller commits via applySceneChanges

        const dispatch = ADSDispatch.find((entry) => entry.opcode === c.opcode);
        if (dispatch) {
            state.reentryNow = j;
            dispatch.callback(state, ...c.params);
        }
        if (state.jumpTo !== undefined) {
            j = state.jumpTo - 1; // -1 because the loop will j++ before next iteration
            state.jumpTo = undefined;
        }
    }

    state.reentry = savedReentry;
    state.reentryNow = savedReentryNow;
    state.jumpTo = savedJumpTo;
};

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
