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
    // Opcode 0x2020 is treated here as a random sleep measured in DGDS ticks, with
    // randomness injected through state.random so interpreter traces stay
    // deterministic. IMPORTANT (faithfulness): this random sleep is a PORT
    // INVENTION -- it does NOT consume the binary's lagged-Fibonacci stream. The
    // original's 0x2020 handler (jump-table 0x2020 -> FUN_1048_15ea ->
    // FUN_1048_0ec8, decompiled.c:14554) only looks up the scene thread
    // (FUN_1048_0bf4) and re-initialises it (FUN_1048_0b3e); it draws NO rng word.
    // So SET_TIMER must stay on state.random (the cosmetic source), NEVER the
    // faithful story stream -- routing it through the faithful RNG would inject a
    // phantom draw the binary never makes and desync every downstream RANDOM pick.
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
    // A (slot,tag) key dispatched in this ADS scene must not leak into the
    // NEXT ADS scene: dispatchedAdsKeys only means "this chunk already fired
    // off an earlier instance's finish" WITHIN the scene it fired in. Without
    // clearing here, a genuine barrier IF_PLAYED keyed to the same (slot,tag)
    // in a later scene would be wrongly softened (skip instead of wait).
    state.dispatchedAdsKeys?.clear();
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
    // A TTM scene runs on its own cloned state, but the frame presenter draws the
    // background from the runtime ROOT (falling back to it whenever no active scene
    // still carries a bkgScreen of its own). A full-screen LOAD_SCREEN performed in
    // ONE child scene -- e.g. SUZY's SUZBEACH.SCR, which is only loaded in the
    // "tanning oil" scene -- must therefore be mirrored onto the root, so the loaded
    // screen stays visible for the sibling scenes that follow it. Without this the
    // background reverts to black/stale the moment that one scene ends (the city
    // beach vanishes for the rest of the Suzy sequence).
    const root = state.root && state.root !== state ? state.root : state;
    if (root !== state) {
        root.bkgScreen = state.bkgScreen;
        root.backgroundId = state.backgroundId;
    }
    // On the original engine LOAD_SCREEN repaints the whole framebuffer, wiping any
    // save-under plate a PREVIOUS scene left standing. The retained-surface
    // compositor instead keeps those plates alive in ttmEnvironments and would
    // redraw them opaque over the freshly loaded screen (the lingering MEANWHILE
    // clock plate drawn over Suzy's beach). Prune them so the new full-screen
    // background comes up clean.
    for (const sceneIdx of root.ttmEnvironments?.keys?.() || []) {
        pruneEnvironmentBackground(root, sceneIdx);
    }
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

// ADS 0x1070 is IF_LASTPLAYED_LOCAL -- the ONLY occurrence in the shipped game is
// ACTIVITY.ADS tag 7 (the "MUNDANE JOHN READ" gag), where it pairs with 0x1520. Both
// jc_reborn and the original binary treat it as a ONE-SHOT LOCAL completion override
// for (sceneIdx,tagId): the next time that scene finishes, its LOCAL handler pre-empts
// the GLOBAL `IF_PLAYED (slot,tag)` handoff exactly once, then is consumed. In tag 7
// the final bath 4:5 is armed here so its finish routes to 4:22 -> 4:23 -> END instead
// of re-entering the global 4:5 -> 4:7 reading cycle. Without this the port replays the
// whole 4:7/4:8/4:9/4:10 reading loop a SECOND time (crosscheck B1 / phase11 §2). The
// suppression itself lives in runtime's #dispatchAdsFinishChunks; here we only arm it.
const WHILE_RUNNING = (state, sceneIdx, tagId) => {
    (state.localOverrides ||= new Set()).add(`${sceneIdx}:${tagId}`);
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

    const key = `${sceneIdx}:${tagId}`;

    // The finish-dispatch (runtime.mjs #dispatchAdsFinishChunks) OWNS firing
    // this (slot,tag)'s handoff chunk on the scene's FINISH event, and it runs
    // BEFORE this linear runner every tick. `dispatched` = the dispatch has
    // already fired this key's chunk this ADS scene. Two distinct things follow
    // from that, both TERMINAL-only (softening a non-terminal IF_PLAYED would
    // flow an AND/OR chain forward with a false "already handled" signal instead
    // of BLOCKING, changing the combined trigger's semantics):
    //
    // Read the EXPANDED script that `state.reentryNow` actually indexes
    // (`state.activeAdsScript` = #adsScripts[currentScene], post-0xf200
    // inlining), NOT the raw `state.data.scenes[...].script`. The two diverge
    // once a scene inlines a RUN_SCRIPT (0xf200) before an IF_PLAYED, which
    // would make `chunkBodyHasRandom`/`nextOpcode` scan the wrong region (a
    // false-negative that re-enables the double-pick). No shipping scene has an
    // IF_PLAYED after a 0xf200 today, but the range scan makes the fragility
    // load-bearing, so bind to the correct script. Fall back to the raw script
    // for callers that drive IF_PLAYED without activeAdsScript set.
    const script = state.activeAdsScript ?? state.data.scenes[state.currentScene]?.script;
    const nextOpcode = script?.[state.reentryNow + 1]?.opcode;
    const terminal = !state.orMode && nextOpcode !== 0x1420 && nextOpcode !== 0x1430;
    const dispatched = state.dispatchedAdsKeys?.has(key) && terminal;

    const scene = state.scenes.find((s) => s.sceneIdx === sceneIdx && s.tagId === tagId);
    const done = scene !== undefined && isSceneDone(scene);

    // (1) STILL-PLAYING dispatched instance: a NEW instance now occupies the
    // slot (e.g. a self-rearming ambient sequence) that the dispatch owns going
    // forward. Do NOT park the linear PC on it -- that is the gag-7 failure mode
    // (scene 4:24 loops running<->waiting forever, blocking the ADS from ever
    // reaching its own end). Skip the barrier. Applies to ANY body: this is
    // about not blocking, independent of idempotency.
    if (dispatched && scene !== undefined && !done) {
        state.continue = true;
        handleIfCondition(state, false);
        return;
    }

    // (2) FINISHED/PLAYED dispatched instance whose body is a 0x3010 RANDOM
    // block: the dispatch already ran this NON-idempotent body (RANDOM_END picks
    // ONE of several staged ADD_SCENEs). Re-running it here picks a DIFFERENT
    // scene, spawning a concurrent duplicate -- the telescope "multiple
    // Johnnies" (STAND.ADS #15 chains RANDOM scan blocks with no STOP_SCENE).
    // Skip re-running it. An idempotent body (plain ADD_SCENE, deduped by
    // ADD_SCENE's inScenes guard) is harmless to re-run, so it is left exactly
    // as before -- notably the campfire's rearm chain, which relies on it.
    if (dispatched && (done || state.playedHistory.has(key)) && chunkBodyHasRandom(script, state.reentryNow)) {
        if (done) state.removeScenes.push({ sceneIdx, tagId }); // clean up the lingering finished instance
        state.continue = true;
        handleIfCondition(state, false);
        return;
    }

    if (state.playedHistory.has(key)) {
        state.continue = true;
        handleIfCondition(state, true);
        return;
    }

    if (scene !== undefined) {
        if (done) {
            state.removeScenes.push({ sceneIdx, tagId });
            state.continue = true;
            handleIfCondition(state, true);
        } else {
            // Still playing and not dispatch-owned -> BLOCK (keep state.continue = false)
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
        // Gather the OR-group: consecutive IF_PLAYED clauses joined by OR (0x1430).
        // An OR-group `IF_PLAYED a OR IF_PLAYED b ... OR IF_PLAYED z  <body>` fires
        // <body> when ANY clause is satisfied, and <body> is the single opcode after
        // the LAST clause. Map EVERY clause key to that one shared body-start; each
        // earlier clause's own i+1 is just the next OR/IF_PLAYED, not the body. (Only
        // merge across OR: an AND (0x1420) chain needs ALL clauses, so a single-tag
        // finish can't satisfy it -- leave an AND-joined clause mapping its own i+1.)
        // Assumes an OR joins IF_PLAYED clauses only (the `0x1350` check below): the
        // shipped data has no mixed OR chain (e.g. IF_PLAYED a OR IF_NOT_PLAYED b), so
        // a non-IF_PLAYED next-clause ends the group and each clause keeps its own body
        // -- matching pre-index behavior. Revisit this if such a chain is ever authored.
        const clauses = [];
        let j = i;
        for (;;) {
            clauses.push(script[j].params);
            if (script[j + 1]?.opcode === 0x1430 && script[j + 2]?.opcode === 0x1350) {
                j += 2;
            } else {
                break;
            }
        }
        const body = j + 1;
        for (const [slot, tag] of clauses) {
            const key = `${slot}:${tag}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(body);
        }
        i = j; // don't re-scan the inner clauses as fresh group starts
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
 *
 * ISOLATION CAVEATS (authored chunk bodies should not hit these today, but
 * they are not structurally prevented):
 *  - IF_NOT_RUNNING inside a chunk body calls `applySceneChanges` itself
 *    (to un-stage a pending add/remove before checking), which mutates
 *    `state.scenes` mid-iteration of the finish-dispatch loop's `for..of`
 *    in runtime.mjs. A chunk body that also relies on the dispatch loop's
 *    own later iterations seeing the pre-mutation `state.scenes` could
 *    observe an inconsistent view.
 *  - `handleIfCondition` (used for a nested AND/OR inside a chunk body)
 *    reads the RAW `state.data.scenes[state.currentScene].script` indexed
 *    by `state.reentryNow`, but `state.reentryNow` here is an index into
 *    the EXPANDED `#adsScripts[idx]` (post `0xf200` inlining) passed in as
 *    `script`. If inlining ever shifts indices between the raw and
 *    expanded scripts, a nested conditional inside a chunk body could jump
 *    to the wrong offset. Low likelihood in practice -- it requires a
 *    chunk body with its own nested IF/AND/OR -- but not guarded against.
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
