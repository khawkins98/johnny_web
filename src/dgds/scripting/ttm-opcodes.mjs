/**
 * ttm-opcodes.mjs — TTM opcode callbacks.
 *
 * All opcode callbacks are plain functions of the form (state, ...params).
 * They are kept as plain functions (not class methods) so tests can call them directly.
 *
 * Split out of script-runner.mjs; see script-dispatch.mjs for the TTMDispatch
 * table that wires these into opcode numbers.
 */
import { PALETTE } from '../palette.mjs';
import { sceneLabel, verboseLog } from './scripting-log.mjs';
import { beginSceneFrame } from './scene-frame.mjs';
import { createFrameBoundary } from './frame-timing.mjs';
import { emitPlaySample } from './audio-operation.mjs';
import { emitFrameOperation, FrameOperationType } from './frame-operation.mjs';
import { loadScreen } from './background-resources.mjs';
import { pruneEnvironmentBackground } from './composition.mjs';
import { traceEvent } from './trace-event.mjs';

// ---------------------------------------------------------------------------
// TTM opcode callbacks
// ---------------------------------------------------------------------------

export const SAVE_BACKGROUND = (state) => {};

export const FREE_SHAPE = (state) => {
    state.res[state.slot] = undefined;
};

export const PURGE = () => {};

export const UPDATE = (state) => {
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

export const SET_DELAY = (state, delay) => {
    state.delay = Math.max(0, delay);
};

export const SLOT_IMAGE = (state, slot) => {
    state.slot = slot;
};

export const SLOT_PALETTE = (state) => {};
export const TTM_UNKNOWN_0 = (state) => {};

export const SET_SCENE = (state) => {};

export const SET_BACKGROUND = (state, index) => {
    state.saveIndex = index;
};

export const GOTO = (state, tagId) => {
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

export const SET_COLORS = (state, fc, bc) => {
    if (fc < 16) {
        state.foregroundColor = PALETTE[fc];
    }
    if (bc < 16) {
        state.backgroundColor = PALETTE[bc];
    }
};

export const SET_FRAME1 = (state) => {};

export const SET_TIMER = (state, minimum, maximum) => {
    // The original 0x2020 handler reinitializes a scene thread and does not call
    // the shared RNG. This range-based hold is retained as browser compatibility
    // behavior until an argument-level trace establishes the remaining timing
    // semantics. It must never consume state.storyRandom.
    const low = Math.min(minimum, maximum);
    const high = Math.max(minimum, maximum);
    if (typeof state.random !== 'function') {
        throw new TypeError('TTM runtime requires an injected random source');
    }
    state.delay = low + Math.floor(state.random() * (high - low + 1));
};

export const SET_CLIP_REGION = (state, x1, y1, x2, y2) => {
    state.clip = {
        x: x1,
        y: y1,
        width: x2 - x1 + 1,
        height: y2 - y1 + 1,
    };
};

export const FADE_OUT = (state) => {};
export const FADE_IN = (state) => {};

export const STORE_AREA = (state, x, y, width, height) => {
    const rect = { x, y, width, height };
    emitFrameOperation(state, {
        type: FrameOperationType.STORE_AREA,
        slot: 0,
        rect,
    });
    traceEvent(state, 'store-area', { slot: 0, rect });
};

export const SAVE_IMAGE_REGION = (state, x, y, width, height) => {
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

export const TTM_UNKNOWN_4 = (state, x, y, width, height) => {};

export const SAVE_REGION = (state, x, y, width, height) => {};

// Wipes alter presentation timing in DOS but leave the composition unchanged.
// The browser presenter currently applies the final composition atomically.
export const WIPE_RIGHT_TO_LEFT = () => {};

// Primitive draws bump the frame serial too, so a frame whose only change is a
// primitive (no sprite / BEGIN_SCENE_FRAME) still triggers a recomposite under the
// immediate-mode content signature. (No shipped scene has a primitive-only frame,
// but this keeps the invariant free of that assumption.)
export const DRAW_LINE = (state, x1, y1, x2, y2) => {
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

export const DRAW_RECT = (state, x, y, width, height) => {
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

export const DRAW_BUBBLE = (state, x, y, width, height) => {
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

export const DRAW_SPRITE = (state, offsetX, offsetY, index, slot) => {
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

export const DRAW_SPRITE_FLIP = (state, offsetX, offsetY, index, slot) => {
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

export const DRAW_SPRITE1 = (state) => {};
export const DRAW_SPRITE3 = (state) => {};

export const DRAW_GETPUT = (state, index) => {
    beginSceneFrame(state, index);
};

export const DRAW_SCREEN = (state) => {};

export const LOAD_SAMPLE = (state) => {};
export const SELECT_SAMPLE = (state) => {};
export const DESELECT_SAMPLE = (state) => {};

export const PLAY_SAMPLE = (state, index) => {
    emitPlaySample(state, index);
    traceEvent(state, 'audio-sample', {
        action: 'requested',
        sample: index,
    });
};

export const STOP_SAMPLE = (state) => {};

export const LOAD_SCREEN = (state, name) => {
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

export const LOAD_IMAGE = (state, name) => {
    name = state.game?.resources?.aliases?.[name] ?? name;
    const resource = state.resourceProvider.resolve(name);
    if (resource !== undefined) state.res[state.slot] = resource;
};

export const LOAD_PALETTE = (state) => {};
