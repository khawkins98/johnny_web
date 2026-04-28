/**
 * script-runner.mjs — ADS/TTM opcode callbacks, dispatch tables, and runScript.
 *
 * All opcode callbacks are plain functions of the form (state, ...params).
 * They are kept as plain functions (not class methods) so tests can call them directly.
 *
 * Re-exported by process.mjs for backward-compat.
 */
import { loadResourceEntry } from '../resource.mjs';
import { drawImage, getPaletteColor } from '../graphics.mjs';
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

export const debugLog = isDebugMode ? (...args) => console.log('[DGDS]', ...args) : () => {};

// ---------------------------------------------------------------------------
// TTM opcode callbacks
// ---------------------------------------------------------------------------

const SAVE_BACKGROUND = (state) => { };

const DRAW_BACKGROUND = (state) => {
    // RESTORE_REGION(state, 0, 0, 0, 0);
    drawBackground(state, state.mainContext);
};

const PURGE = (state) => {
    // state.purge = true;
};

const UPDATE = (state) => {
    if (state.continue) {
        if (!state.delay) {
            return;
        }
        state.continue = false;
        state.elapsed = state.delay + Date.now();
    }
    if (Date.now() > state.elapsed) {
        state.elapsed = 0;
        state.continue = true;
        // TODO not reaching here for some reason
        if (state.lastCommand) {
            state.lastCommand = false;
            state.played = true; // time is over since last update
        }
    }
};

const SET_DELAY = (state, delay) => {
    state.delay = ((delay === 0 ? 1 : delay) * 20);
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
    // BUG: tagId is ignored; always resets reentry to 0 (start of current script).
    // Correct behavior requires finding the script position for tagId, which is unknown.
    state.reentry = 0; // TODO check for other scenes
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
    state.timer = timer * 20 + ((delay === 0 ? 1 : delay) * 20);
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

    save.context.drawImage(
        state.context.canvas,
        x, y, width, height,
        x, y, width, height,
    );
};

const SAVE_IMAGE_REGION = (state, x, y, width, height) => {
    // NOTE: Commented out — region capture is unimplemented. state.save[] slots are initialized
    // (see startProcess) but canDraw never becomes true and no image data is written, so
    // drawContext() is effectively a no-op. This means the scorecard/overlay compositing layer
    // (SET_BACKGROUND → drawContext) does not restore captured content as intended.
    // const save = state.save[state.saveIndex];
    // save.canDraw = true;
    // ...
};

const TTM_UNKNOWN_4 = (state, x, y, width, height) => { };

const SAVE_REGION = (state, x, y, width, height) => { };

const RESTORE_REGION = (state, x, y, width, height) => {
    const save = state.saveBkg[0];
    save.canDraw = false;
    save.x = 0;
    save.y = 0;
    save.width = 0;
    save.height = 0;
    clearContext(save.context);
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
    if (state.res[slot] === undefined) {
        return;
    }
    const image = state.res[slot].images[index];
    if (image !== undefined) {
        state.context.save();
        state.context.beginPath();
        state.context.rect(state.clip.x, state.clip.y, state.clip.width, state.clip.height);
        state.context.clip();

        drawImage(image, state.tmpContext, 0, 0);
        state.context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, offsetX, offsetY, image.width, image.height);
        state.context.restore();
    }
};

const DRAW_SPRITE_FLIP = (state, offsetX, offsetY, index, slot) => {
    if (state.res[slot] === undefined) {
        return;
    }
    const image = state.res[slot].images[index];
    if (image !== undefined) {
        state.context.save();
        state.context.beginPath();
        state.context.rect(state.clip.x, state.clip.y, state.clip.width, state.clip.height);
        state.context.clip();

        drawImage(image, state.tmpContext, 0, 0);
        state.context.save();
        state.context.translate(image.width, 0);
        state.context.scale(-1, 1);
        state.context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, -offsetX, offsetY, image.width, image.height);
        state.context.restore();
        state.context.restore();
    }
};

const DRAW_SPRITE1 = (state) => { };
const DRAW_SPRITE3 = (state) => { };

const clearScreen = (state, index) => {
    clearContext(state.context);
    clearContext(state.tmpContext);
    drawContext(state);
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

const IF_NOT_PLAYED = (state, sceneIdx, tagId) => {
    // Block the current script if the scene has NOT yet played this ADS run
    // (i.e., should execute the block). Skip the block if it HAS played.
    if (!state.playedHistory.has(`${sceneIdx}:${tagId}`)) {
        // Not played yet → execute the block (continue = true, no jump needed)
        return;
    }
    // Already played → skip to after the matching END_IF
    const script = state.data.scenes[state.currentScene].script;
    const endIfIdx = script.findIndex((c, idx) => idx > state.reentryNow && c.opcode === 0xfff0);
    if (endIfIdx !== -1) {
        // jumpTo is read by runScript after the callback to advance past END_IF
        state.jumpTo = endIfIdx + 1;
    }
};

const IF_PLAYED = (state, sceneIdx, tagId) => {
    if (state.continue) {
        state.continue = false;
    }
    let scene = state.scenes.find(s =>
        s.sceneIdx === sceneIdx && s.tagId === tagId
        && s.state.played);
    if (scene !== undefined) {
        if (scene.state.timer === 0) {
            state.removeScenes.push({
                sceneIdx,
                tagId,
            });
        }
        state.continue = true;
        return;
    }

    scene = state.scenes.find(s =>
        s.sceneIdx === sceneIdx && s.tagId === tagId);
    if (scene === undefined) {
        state.continue = true;
    }
};

const IF_NOT_RUNNING = (state, sceneIdx, tagId) => {
    // Block if the scene IS currently active (skip block if already running).
    // "Running" = in state.scenes with lifecycle 'active' or 'running'.
    const scene = state.scenes.find(s => s.sceneIdx === sceneIdx && s.tagId === tagId);
    const isRunning = scene && (scene.lifecycle === 'active' || scene.lifecycle === 'running');
    if (isRunning) {
        // Scene is running → skip this block (find END_IF and jump past it)
        const script = state.data.scenes[state.currentScene].script;
        const endIfIdx = script.findIndex((c, idx) => idx > state.reentryNow && c.opcode === 0xfff0);
        if (endIfIdx !== -1) {
            state.jumpTo = endIfIdx + 1;
        }
    }
    // else: not running → execute the block (continue = true, no jump)
};

const IF_RUNNING = (state, sceneIdx, tagId) => {
    // Block if the scene is NOT currently active (skip block if NOT running).
    const scene = state.scenes.find(s => s.sceneIdx === sceneIdx && s.tagId === tagId);
    const isRunning = scene && (scene.lifecycle === 'active' || scene.lifecycle === 'running');
    if (!isRunning) {
        const script = state.data.scenes[state.currentScene].script;
        const endIfIdx = script.findIndex((c, idx) => idx > state.reentryNow && c.opcode === 0xfff0);
        if (endIfIdx !== -1) {
            state.jumpTo = endIfIdx + 1;
        }
    }
};

const AND = (state) => { };
const OR = (state) => { };

// ---------------------------------------------------------------------------
// More ADS callbacks that depend on getSceneState
// ---------------------------------------------------------------------------

const ADD_SCENE = (state, sceneIdx, tagId, retriesDelay, unk) => {
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

        if (state.removeScenes.length > 0) {
            state.removeScenes.forEach(s => {
                const index = state.scenes.findIndex(sc => sc.sceneIdx === s.sceneIdx && sc.tagId === s.tagId);
                if (index !== -1) {
                    // Record in history before removing so IF_NOT_PLAYED works correctly.
                    state.playedHistory.add(`${s.sceneIdx}:${s.tagId}`);
                    state.scenes.splice(index, 1);
                }
            });
            state.removeScenes = [];
        }
        if (state.addScenes.length > 0) {
            state.addScenes.forEach(s => {
                const scene = getSceneState(state, s.sceneIdx, s.tagId, s.retriesDelay, s.unk);
                if (scene !== undefined) {
                    state.scenes.push(scene);
                }
            });
            state.addScenes = [];
        }
    }

    // Block until all newly-added ('active') scenes have completed their first loop.
    // Scenes already 'running' or 'completed' do not block advancement.
    const waiting = state.scenes.filter(s => s.lifecycle === 'active');
    state.continue = waiting.length === 0;
    if (isDebugMode && waiting.length > 0) {
        debugLog(`PLAY_SCENE: blocking — waiting for ${waiting.length} active scene(s): ${waiting.map(s => `${s.sceneIdx}:${s.tagId}`).join(', ')}`);
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
    const scene = state.scenes.find(s => s.state.played);
    if (state.lastCommand && scene !== undefined) {
        // Batch-clear all child scenes; record each in history so IF_NOT_PLAYED sees them.
        state.scenes.forEach(s => state.playedHistory.add(`${s.sceneIdx}:${s.tagId}`));
        state.scenes = [];
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
    if (state.reentry === (script.length - 1)) {
        state.lastCommand = true;
        state.reentry = 0;
        state.runs++;
        if (!state.continue) {
            state.continue = true;
        }
        state.played = true;
        if (main) {
            state.currentScene++;
            // Reset lastCommand so the next ADS scene's intermediate END doesn't
            // inherit the stale "final command" flag and prematurely clear child scenes.
            state.lastCommand = false;
        }
        if (state.type === 'TTM') {
            return true;
        }
    }
    return false;
};
