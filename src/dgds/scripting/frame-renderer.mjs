/**
 * frame-renderer.mjs — Background drawing, canvas helpers, and resource loaders.
 *
 * Contains the low-level rendering utilities used by both the TTM opcode callbacks
 * (in script-runner.mjs) and the compositing loop (runScripts in process.mjs).
 */
import { loadResourceEntry } from '../resource.mjs';
import { buildSpriteCanvas } from '../graphics.mjs';

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

export const clearContext = (context) => {
    context.clearRect(0, 0, 640, 480);
};

export const drawContext = (state, index) => {
    const save = state.save[state.saveIndex];
    if (save.canDraw) {
        save.canDraw = false;
        state.context.drawImage(save.context.canvas, 0, 0);
    }
};

// ---------------------------------------------------------------------------
// Background renderer
//
// FIXME Improve this code repetition
// NOTE: Cloud movement timing uses absolute Date.now() offsets rather than the fps-based tick
// delta used by the main loop. Cloud speed is tied to wall-clock time, not frame rate.
// ---------------------------------------------------------------------------

export const drawBackground = (state, context) => {
    // Draw background / ocean / night
    if (state.bkgScreen) {
        context.clearRect(0, 0, 640, 480);
        const bgCanvas = buildSpriteCanvas(state.bkgScreen.images[0]);
        if (bgCanvas) context.drawImage(bgCanvas, 0, 0);
    }

    if (state.island) {
        const posX = (state.island === 1) ? 288 : 16;

        if (!state.cloudElapsed) {
            state.cloudElapsed = Math.floor((Math.random() * 640)) + Date.now();
        }
        if (Date.now() > state.cloudElapsed) {
            state.cloudElapsed = 0;
            state.cloudX--;
        }

        // Draw island
        if (state.bkgRes) {
            const blit = (img, dx, dy) => {
                const c = buildSpriteCanvas(img);
                if (c) context.drawImage(c, 0, 0, img.width, img.height, dx, dy, img.width, img.height);
            };

            // Draw clouds (random and animated)
            blit(state.bkgRes.images[state.cloudIdx], state.cloudX, state.cloudY);
            // Draw raft based on state
            blit(state.bkgRaft.images[3], posX + 222, 268);
            // isle
            blit(state.bkgRes.images[0], posX, 280);
            // palm tree
            blit(state.bkgRes.images[14], posX + 108, 280);
            blit(state.bkgRes.images[13], posX + 154, 148);
            blit(state.bkgRes.images[12], posX + 77, 122);
            // Draw shore with animations
            blit(state.bkgRes.images[3], posX - 13, 305);
            blit(state.bkgRes.images[6], posX + 76, 320);
            blit(state.bkgRes.images[10], posX + 230, 303);
            // Draw low tide
        }
    }
};

// ---------------------------------------------------------------------------
// Background asset loaders (called from LOAD_SCREEN opcode callback)
// ---------------------------------------------------------------------------

export const SCREEN_TYPE = {
    'ISLETEMP.SCR': 1,
    'ISLAND2.SCR': 2,
    'SUZBEACH.SCR': 0,
    'JOFFICE.SCR': 0,
    'THEEND.SCR': 0,
    'INTRO.SCR': 0,
};

export const loadBackground = (state) => {
    if (!state.bkgRes) {
        const entry = state.entries.find(e => e.name === 'BACKGRND.BMP');
        if (entry !== undefined) {
            state.bkgRes = loadResourceEntry(entry);
        }
    }
};

export const loadRaft = (state) => {
    if (!state.bkgRaft) {
        const entry = state.entries.find(e => e.name === 'MRAFT.BMP');
        if (entry !== undefined) {
            state.bkgRaft = loadResourceEntry(entry);
        }
    }
};

export const loadOcean = (state) => {
    if (state.bkgOcean.length === 0) {
        // FIXME shorten this code later
        let entry = state.entries.find(e => e.name === 'OCEAN00.SCR');
        if (entry !== undefined) {
            state.bkgOcean.push(loadResourceEntry(entry));
        }
        entry = state.entries.find(e => e.name === 'OCEAN01.SCR');
        if (entry !== undefined) {
            state.bkgOcean.push(loadResourceEntry(entry));
        }
        entry = state.entries.find(e => e.name === 'OCEAN02.SCR');
        if (entry !== undefined) {
            state.bkgOcean.push(loadResourceEntry(entry));
        }
        entry = state.entries.find(e => e.name === 'NIGHT.SCR');
        if (entry !== undefined) {
            state.bkgOcean.push(loadResourceEntry(entry));
        }
        const isNight = state.isNightMode === true;
        const oceanIdx = isNight ? 3 : Math.floor(Math.random() * 3); // 0 to 2 for day, 3 for night
        state.bkgScreen = state.bkgOcean[oceanIdx];
    }
};
