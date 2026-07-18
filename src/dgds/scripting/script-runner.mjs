/**
 * script-runner.mjs — ADS/TTM opcode callbacks, dispatch tables, and runScript.
 *
 * All opcode callbacks are plain functions of the form (state, ...params).
 * They are kept as plain functions (not class methods) so tests can call them directly.
 *
 * Re-exported by process.mjs for backward-compat.
 */
import { loadResourceEntry } from '../resource.mjs';
import { buildSpriteCanvas, getPaletteColor } from '../graphics.mjs';
import { PALETTE } from '../../scrantic/palette.mjs';
import { getSceneState, initialState } from './scene-factory.mjs';
import {
    clearContext,
    drawContext,
    drawBackground,
    loadBackground,
    loadRaft,
    loadOcean,
    SCREEN_TYPE,
} from './frame-renderer.mjs';

export { getSceneState, initialState } from './scene-factory.mjs';
export { clearContext, drawContext, drawBackground, loadBackground, loadRaft, loadOcean } from './frame-renderer.mjs';

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

export const isDebugMode = (() => {
    try {
        return window.location.hostname === 'localhost' ||
               window.location.hostname === '127.0.0.1' ||
               new URLSearchParams(window.location.search).has('debug');
    } catch { return false; }
})();

// Verbose mode: ?debug=verbose logs per-opcode details (DRAW_SPRITE frames, PLAY_SAMPLE, GOTO loops).
export const isVerboseMode = (() => {
    try {
        return new URLSearchParams(window.location.search).get('debug') === 'verbose';
    } catch { return false; }
})();

const getTimestamp = () => new Date().toISOString().substring(11, 23);

export const debugLog = isDebugMode ? (...args) => console.log(`[DGDS] [${getTimestamp()}]`, ...args) : () => {};

export const sceneLog = (state, action, target = '') => {
    if (!isDebugMode) return;
    
    let gagId = '?';
    if (state.data && state.data.scenes && state.data.scenes[state.currentScene]) {
        const tId = state.data.scenes[state.currentScene].tagId;
        gagId = typeof tId === 'object' ? tId.id : (tId ?? '?');
    }

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

export const verboseLog = isVerboseMode ? (...args) => console.log(`[DGDS:V] [${getTimestamp()}]`, ...args) : () => {};

/**
 * Build a human-readable label for a TTM child scene, including the tag
 * description if available: e.g. "4:113(flip pages)" or "4:113".
 */
const sceneLabel = (scenesRes, sceneIdx, tagId) => {
    const desc = scenesRes?.[sceneIdx]?.tags?.find(t => t.id === tagId)?.description;
    return desc ? `${sceneIdx}:${tagId}(${desc})` : `${sceneIdx}:${tagId}`;
};

// ---------------------------------------------------------------------------
// TTM opcode callbacks
// ---------------------------------------------------------------------------

const SAVE_BACKGROUND = (state) => { };

const DRAW_BACKGROUND = (state) => {
    const save = state.saveBkg[0];
    if (save && save.canDraw) {
        state.context.clearRect(save.x, save.y, save.width, save.height);
    }
};

const PURGE = (state) => {
    if (state.saveBkg && state.saveBkg[0]) {
        state.saveBkg[0].canDraw = false;
    }
};

const UPDATE = (state) => {
    if (state.continue) {
        if (!state.delay) {
            return;
        }
        state.continue = false;
        state.elapsed = state.delay + Date.now();
        state.delay = 0;
    }
    if (Date.now() > state.elapsed) {
        state.elapsed = 0;
        state.continue = true;
    }
};

/**
 * DGDS/DOS Hardware Timer Constant
 *
 * In 1992 (when Johnny Castaway was released for Windows 3.1), the standard 
 * system hardware timer (PIT) ticked exactly 18.2 times per second. 
 * 1000ms / 18.2 = ~54.9ms per tick.
 * 
 * DGDS engine scripts define all of their timing delays in terms of these ticks.
 * A script delay of "1" means "wait for 1 tick" (approx 55 milliseconds).
 */
export const DOS_TICK_MS = 55;

const SET_DELAY = (state, delay) => {
    state.delay = ((delay === 0 ? 1 : delay) * DOS_TICK_MS);
};

const SLOT_IMAGE = (state, slot) => {
    state.slot = slot;
};

const SLOT_PALETTE = (state) => { };
const TTM_UNKNOWN_0 = (state) => { };

const SET_SCENE = (state) => {};

const SET_BACKGROUND = (state, index) => {
    state.saveIndex = index;
};

const GOTO = (state, tagId) => {
    if (tagId !== state.tagId) {
        if (state.scenesRes && state.sceneIdx !== undefined) {
            const newScene = state.scenesRes[state.sceneIdx].scenes.find(s => s.tagId === tagId);
            if (newScene) {
                state.script = newScene.script;
                state.tagId = tagId;
                state.reentry = 0;
            }
        }
    }
    state.gotoRestart = true;
    state.continue = false;  // pause execution until next frame (like UPDATE)
    state.runs++;             // count completed loops so PLAY_SCENE can unblock
};

const SET_COLORS = (state, fc, bc) => {
    if (fc < 16) {
        state.foregroundColor = PALETTE[fc];
    }
    if (bc < 16) {
        state.backgroundColor = PALETTE[bc];
    }
};

const SET_FRAME1 = (state) => { };

const SET_TIMER = (state, delay, timer) => {
    // Timer in milliseconds. Decremented each frame (in runScripts) by state.frameDelta.
    // IF_PLAYED checks scene.state.timer === 0 to allow scene removal once the timer expires.
    state.hasTimer = true;
    state.timer = timer * DOS_TICK_MS + ((delay === 0 ? 1 : delay) * DOS_TICK_MS);
};

const SET_CLIP_REGION = (state, x1, y1, x2, y2) => {
    state.clip = {
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
    };
};

const FADE_OUT = (state) => { };
const FADE_IN = (state) => { };

// ADS-level fade to black. First call starts the animation (blocks ADS); each subsequent
// frame the opacity increases. Once fully black, unblocks and lets END advance the scene.
// The overlay is drawn in runScripts so it remains visible for the final frame even after
// END clears the child scenes.
const ADS_FADE_OUT = (state) => {
    if (state.continue) {
        debugLog('FADE_OUT: starting');
        state.fadingOut = true;
        state.fadeOpacity = 0;
        state.continue = false;
        return;
    }
    state.fadeOpacity = Math.min(1, state.fadeOpacity + state.frameDelta / 400);
    if (state.fadeOpacity >= 1) {
        // Unblock so END can fire — fadingOut stays true so runScripts still draws the
        // full-black overlay on this frame, then clears fadingOut after drawing.
        state.continue = true;
    }
};

const DRAW_BACKGROUND_REGION = (state, x, y, width, height) => {
    const save = state.saveBkg[0];
    save.canDraw = true;
    save.x = x;
    save.y = y;
    save.width = width;
    save.height = height;
};

const SAVE_IMAGE_REGION = (state, x, y, width, height) => {
    const save = state.save[state.saveIndex];
    save.canDraw = true;
    save.x = x;
    save.y = y;
    save.width = width;
    save.height = height;

    save.context.clearRect(0, 0, 640, 480);
    save.context.drawImage(
        state.context.canvas,
        x, y, width, height,
        x, y, width, height,
    );
};

const TTM_UNKNOWN_4 = (state, x, y, width, height) => { };

const SAVE_REGION = (state, x, y, width, height) => { };

const RESTORE_REGION = (state, x, y, width, height) => {
    // DO NOT clear saveBkg[0]. 
    // Simply clear the specified region on the child scene's offscreen canvas.
    state.context.clearRect(x, y, width, height);
};

const DRAW_LINE = (state, x1, y1, x2, y2) => {
    state.context.beginPath();
    state.context.moveTo(x1, y1);
    state.context.lineTo(x2, y2);
    state.context.closePath();
    state.context.strokeStyle = 'white';
    state.context.stroke();
};

const DRAW_RECT = (state, x, y, width, height) => {
    state.context.fillStyle = getPaletteColor(state.foregroundColor);
    state.context.fillRect(x, y, width, height);
};

const DRAW_BUBBLE = (state, x, y, width, height) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width / 2;
    state.context.beginPath();
    state.context.arc(x + centerX, y + centerY, radius, 0, 2 * Math.PI, false);
    state.context.closePath();
    state.context.fillStyle = 'white';
    state.context.fill();
    state.context.strokeStyle = 'white';
    state.context.stroke();
};

const DRAW_SPRITE = (state, offsetX, offsetY, index, slot) => {
    if (state.res[slot] === undefined) return;
    const image = state.res[slot].images[index];
    if (image === undefined) return;
    const spriteCanvas = buildSpriteCanvas(image);
    if (!spriteCanvas) return;
    verboseLog(`DRAW_SPRITE ${sceneLabel(state.scenesRes, state.sceneIdx, state.tagId)} frame=${index} slot=${slot} at (${offsetX},${offsetY})`);
    state.context.save();
    state.context.beginPath();
    state.context.rect(state.clip.x, state.clip.y, state.clip.width, state.clip.height);
    state.context.clip();
    state.context.drawImage(spriteCanvas, 0, 0, image.width, image.height, offsetX, offsetY, image.width, image.height);
    state.context.restore();
};

const DRAW_SPRITE_FLIP = (state, offsetX, offsetY, index, slot) => {
    if (state.res[slot] === undefined) return;
    const image = state.res[slot].images[index];
    if (image === undefined) return;
    const spriteCanvas = buildSpriteCanvas(image);
    if (!spriteCanvas) return;
    verboseLog(`DRAW_SPRITE_FLIP ${sceneLabel(state.scenesRes, state.sceneIdx, state.tagId)} frame=${index} slot=${slot} at (${offsetX},${offsetY})`);
    state.context.save();
    state.context.beginPath();
    state.context.rect(state.clip.x, state.clip.y, state.clip.width, state.clip.height);
    state.context.clip();
    state.context.save();
    state.context.translate(image.width, 0);
    state.context.scale(-1, 1);
    state.context.drawImage(spriteCanvas, 0, 0, image.width, image.height, -offsetX, offsetY, image.width, image.height);
    state.context.restore();
    state.context.restore();
};

const DRAW_SPRITE1 = (state) => { };
const DRAW_SPRITE3 = (state) => { };

const clearScreen = (state, index) => {
    const save = state.save[index];
    if (save && save.canDraw) {
        if (state.allScenes) {
            state.allScenes.forEach(s => {
                if (s.state && s.state.context) {
                    s.state.context.clearRect(save.x, save.y, save.width, save.height);
                }
            });
        } else if (state.context) {
            state.context.clearRect(save.x, save.y, save.width, save.height);
        }
    } else if (state.context) {
        state.context.clearRect(0, 0, 640, 480);
    }
};

const CLEAR_SCREEN = (state, index) => {
    clearScreen(state, index);
};

const DRAW_SCREEN = (state) => { };

const LOAD_SAMPLE = (state) => { };
const SELECT_SAMPLE = (state) => { };
const DESELECT_SAMPLE = (state) => { };

const PLAY_SAMPLE = (state, index) => {
    // Resume AudioContext if suspended (browser autoplay policy belt-and-suspenders).
    if (state.audioManager?.context?.state === 'suspended') {
        state.audioManager.context.resume();
    }
    const sampleSource = state.audioManager.getSoundFxSource();
    sampleSource.load(index, () => {
        sampleSource.play();
    });
};

const STOP_SAMPLE = (state) => { };

const LOAD_SCREEN = (state, name) => {
    state.island = SCREEN_TYPE[name];

    if (!state.bkgScreen) {
        const entry = state.entries.find(e => e.name === name);
        if (entry !== undefined) {
            state.bkgScreen = loadResourceEntry(entry);
        }
    }

    if (state.island) {
        loadBackground(state);
        loadRaft(state);
        loadOcean(state);
    }
};

const LOAD_IMAGE = (state, name) => {
    if (name === 'FLAME.BMP' || name === 'FLURRY.BMP') {
        name = 'FIRE1.BMP';
    }
    const entry = state.entries.find(e => e.name === name);
    if (entry !== undefined) {
        state.res[state.slot] = loadResourceEntry(entry);
    }
};

const LOAD_PALETTE = (state) => { };

// ---------------------------------------------------------------------------
// ADS opcode callbacks
// ---------------------------------------------------------------------------

const ADS_UNKNOWN_0 = (state) => { };

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
    
    if (nextOpcode === 0x1430) { // OR
        if (conditionPassed) {
            state.orChainPassed = true;
        }
        state.continue = true;
        return;
    }
    
    if (nextOpcode === 0x1420) { // AND
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

const isSceneDone = (s) => s.state.hasTimer ? s.state.timer === 0 : s.state.played;

const IF_NOT_PLAYED = (state, sceneIdx, tagId) => {
    if (state.orMode && state.orChainPassed) {
        handleIfCondition(state, true);
        return;
    }

    const played = state.playedHistory.has(`${sceneIdx}:${tagId}`) ||
        state.scenes.some(s => s.sceneIdx === sceneIdx && s.tagId === tagId && isSceneDone(s));
    
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

    const scene = state.scenes.find(s => s.sceneIdx === sceneIdx && s.tagId === tagId);

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
    const scene = state.scenes.find(s => s.sceneIdx === sceneIdx && s.tagId === tagId);
    const isRunning = scene && (scene.lifecycle === 'active' || scene.lifecycle === 'running');
    handleIfCondition(state, !isRunning);
};

const IF_RUNNING = (state, sceneIdx, tagId) => {
    if (state.orMode && state.orChainPassed) {
        handleIfCondition(state, true);
        return;
    }
    const scene = state.scenes.find(s => s.sceneIdx === sceneIdx && s.tagId === tagId);
    const isRunning = scene && (scene.lifecycle === 'active' || scene.lifecycle === 'running');
    handleIfCondition(state, isRunning);
};

const AND = (state) => { };
const OR = (state) => { state.orMode = true; };

// ---------------------------------------------------------------------------
// More ADS callbacks that depend on getSceneState
// ---------------------------------------------------------------------------

const ADD_SCENE = (state, sceneIdx, tagId, retriesDelay, unk) => {
    // Only add if not already running or pending addition
    const inScenes = state.scenes.some(s => s.sceneIdx === sceneIdx && s.tagId === tagId);
    const inAddScenes = state.addScenes.some(s => s.sceneIdx === sceneIdx && s.tagId === tagId);
    if (inScenes || inAddScenes) return;

    if (state.randomize) {
        state.scenesRandom.push({
            sceneIdx,
            tagId,
            retriesDelay,
            unk,
        });
        return;
    }

    state.addScenes.push({
        sceneIdx,
        tagId,
        retriesDelay,
        unk,
    });
};

const PLAY_SCENE = (state) => {
    if (state.continue) {
        state.continue = false;
        state._lastPlaySceneLabel = undefined;  // reset so the first-block is always logged

        if (state.removeScenes.length > 0) {
            state.removeScenes.forEach(s => {
                let index;
                let removed = false;
                while ((index = state.scenes.findIndex(sc => sc.sceneIdx === s.sceneIdx && sc.tagId === s.tagId)) !== -1) {
                    // Record in history before removing so IF_NOT_PLAYED works correctly.
                    state.playedHistory.add(`${s.sceneIdx}:${s.tagId}`);
                    sceneLog(state, 'STOP_SCENE', sceneLabel(state.scenesRes, s.sceneIdx, s.tagId));
                    state.scenes.splice(index, 1);
                    removed = true;
                }
                if (!removed) {
                    console.error(`FAILED TO REMOVE SCENE ${s.sceneIdx}:${s.tagId}! Not found in state.scenes!`);
                }
            });
            state.removeScenes = [];
        }
        if (state.addScenes.length > 0) {
            state.addScenes.forEach(s => {
                const scene = getSceneState(state, s.sceneIdx, s.tagId, s.retriesDelay, s.unk);
                if (scene !== undefined) {
                    if (state.scenes.length === 0) {
                        // Synchronously run the prologue so siblings can clone its loaded assets
                        runScript(scene.state, scene.script || scene.state.script);
                    }
                    sceneLog(state, 'ADD_SCENE', sceneLabel(state.scenesRes, s.sceneIdx, s.tagId));
                    state.scenes.push(scene);
                }
            });
            state.addScenes = [];
        }
    }

    // Block until all newly-added scenes have completed their first loop.
    // We check `!s.state.played` instead of `s.lifecycle === 'active'` because 
    // a scene becomes 'running' on the very first frame, but we need to wait
    // for its first loop to actually finish.
    const waiting = state.scenes.filter(s => !s.state.played && s.lifecycle !== 'completed');
    state.continue = waiting.length === 0;
    
    if (isDebugMode && waiting.length > 0) {
        // Sort labels so the comparison is stable regardless of iteration order.
        const label = waiting.map(s => sceneLabel(state.scenesRes, s.sceneIdx, s.tagId)).sort().join(', ');
        if (label !== state._lastPlaySceneLabel) {
            state._lastPlaySceneLabel = label;
            sceneLog(state, 'PLAY_BLOCK', label);
        }
    }
};

// PLAY_SCENE_2 is an ADD_SCENE + PLAY_SCENE combined. The first param is the
// embedded ADD_SCENE opcode (0x2005), followed by the normal ADD_SCENE args.
const PLAY_SCENE_2 = (state, _opcode, sceneIdx, tagId, retriesDelay, unk) => {
    ADD_SCENE(state, sceneIdx, tagId, retriesDelay, unk);
    PLAY_SCENE(state);
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

const RANDOM_UNKNOWN_0 = (state) => { };

const RANDOM_END = (state) => {
    state.randomize = false;
    const index = Math.floor((Math.random() * state.scenesRandom.length));
    const scene = state.scenesRandom[index];
    if (scene !== undefined) {
        ADD_SCENE(state, scene.sceneIdx, scene.tagId, scene.retriesDelay, scene.unk);
    }
};

const ADS_UNKNOWN_6 = (state) => { };
const RUN_SCRIPT = (state) => { };

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
        // Batch-clear all child scenes unconditionally — including GOTO-looping scenes that
        // never reach played=true. Without this, a looping scene (e.g. "frenzied dance")
        // would persist into the next ADS gag and ghost over it.
        state.scenes.forEach(s => state.playedHistory.add(`${s.sceneIdx}:${s.tagId}`));
        state.scenes = [];
        state.addScenes = [];
        state.removeScenes = [];
        state.scenesRandom = [];
        if (state.saveBkg && state.saveBkg[0]) {
            state.saveBkg[0].canDraw = false;
        }
        state.continue = true;
    }
};

// CUSTOM COMMAND
const END_IF = (state) => { };

// ---------------------------------------------------------------------------
// Dispatch tables
// ---------------------------------------------------------------------------

export const TTMDispatch = [
    { opcode: 0x0020, callback: SAVE_BACKGROUND },
    { opcode: 0x0080, callback: DRAW_BACKGROUND },
    { opcode: 0x0110, callback: PURGE },
    { opcode: 0x0FF0, callback: UPDATE },
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
    { opcode: 0x4200, callback: DRAW_BACKGROUND_REGION },
    { opcode: 0x4210, callback: SAVE_IMAGE_REGION },
    { opcode: 0xA000, callback: TTM_UNKNOWN_4 },
    { opcode: 0xA050, callback: SAVE_REGION },
    { opcode: 0xA060, callback: RESTORE_REGION },
    { opcode: 0xA0A0, callback: DRAW_LINE },
    { opcode: 0xA100, callback: DRAW_RECT },
    { opcode: 0xA400, callback: DRAW_BUBBLE },
    { opcode: 0xA500, callback: DRAW_SPRITE },
    { opcode: 0xA510, callback: DRAW_SPRITE1 },
    { opcode: 0xA520, callback: DRAW_SPRITE_FLIP },
    { opcode: 0xA530, callback: DRAW_SPRITE3 },
    { opcode: 0xA600, callback: CLEAR_SCREEN },
    { opcode: 0xB600, callback: DRAW_SCREEN },
    { opcode: 0xC020, callback: LOAD_SAMPLE },
    { opcode: 0xC030, callback: SELECT_SAMPLE },
    { opcode: 0xC040, callback: DESELECT_SAMPLE },
    { opcode: 0xC050, callback: PLAY_SAMPLE },
    { opcode: 0xC060, callback: STOP_SAMPLE },
    { opcode: 0xF010, callback: LOAD_SCREEN },
    { opcode: 0xF020, callback: LOAD_IMAGE },
    { opcode: 0xF050, callback: LOAD_PALETTE },
];

// ADS-only opcodes. Kept separate from TTMDispatch so that opcodes sharing hex values
// with TTM entries (0x2010 STOP_SCENE, 0x4000 ADS_UNKNOWN_6, 0xf010 ADS_FADE_OUT) are
// reachable. runScript() selects the correct table based on state.type.
export const ADSDispatch = [
    { opcode: 0x1070, callback: ADS_UNKNOWN_0 },
    { opcode: 0x1330, callback: IF_NOT_PLAYED },
    { opcode: 0x1350, callback: IF_PLAYED },
    { opcode: 0x1360, callback: IF_NOT_RUNNING },
    { opcode: 0x1370, callback: IF_RUNNING },
    { opcode: 0x1420, callback: AND },
    { opcode: 0x1430, callback: OR },
    { opcode: 0x1510, callback: PLAY_SCENE },
    { opcode: 0x1520, callback: PLAY_SCENE_2 },
    { opcode: 0x2005, callback: ADD_SCENE },
    { opcode: 0x2010, callback: STOP_SCENE },
    { opcode: 0x3010, callback: RANDOM_START },
    { opcode: 0x3020, callback: RANDOM_UNKNOWN_0 },
    { opcode: 0x30ff, callback: RANDOM_END },
    { opcode: 0x4000, callback: ADS_UNKNOWN_6 },
    { opcode: 0xf010, callback: ADS_FADE_OUT },
    { opcode: 0xf200, callback: RUN_SCRIPT },
    { opcode: 0xffff, callback: END },
    // CUSTOM: Added for text script
    { opcode: 0xfff0, callback: END_IF },
];

// Combined table kept for introspection/backward compatibility. Use TTMDispatch or
// ADSDispatch for actual dispatch — do not call .find() on this directly.
export const CommandType = [...TTMDispatch, ...ADSDispatch];

// ---------------------------------------------------------------------------
// Script runner
// ---------------------------------------------------------------------------

export const runScript = (state, script, main = false) => {
    // NOTE: state.reentry acts as a "program counter" — index into script[] where execution
    // resumes next frame. Shared at the top level because only one ADS scene runs at a time.
    // TTM child scenes use their own state objects (each has its own reentry).
    if (script === undefined || state.reentry === -1) {
        return true;
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
        const type = dispatchTable.find(ct => ct.opcode === c.opcode);
        if (!type) {
            continue;
        }
        if (i === (script.length - 1)) {
            state.lastCommand = true;
        }
        state.reentryNow = i;  // expose current index to callbacks (e.g. IF_NOT_PLAYED jump)
        type.callback(state, ...c.params);
        if (state.jumpTo !== undefined) {
            // Callback requested a forward jump (e.g. IF_NOT_PLAYED skipping a block).
            i = state.jumpTo - 1;  // -1 because the loop will i++ before next iteration
            state.reentry = i;
            state.jumpTo = undefined;
        } else {
            state.reentry = i;
        }
        if (!state.continue) {
            break;
        }
    }
    if (state.reentry === (script.length - 1) && !state.gotoRestart && state.continue) {
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
            return true;
        }
    }
    return false;
};
