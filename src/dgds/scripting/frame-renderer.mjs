/**
 * frame-renderer.mjs — Background drawing, canvas helpers, and resource loaders.
 *
 * Contains the low-level rendering utilities used by both the TTM opcode callbacks
 * (in script-runner.mjs) and the compositing loop (runScripts in process.mjs).
 */
import { loadResourceEntry } from '../resource.mjs';
import { drawImage, drawScreen } from '../graphics.mjs';

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
        drawScreen(state.bkgScreen, context);
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
            // Draw clouds (random and animated)
            let image = state.bkgRes.images[state.cloudIdx];
            drawImage(image, state.tmpContext, 0, 0);
            context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, state.cloudX, state.cloudY, image.width, image.height);

            // Draw raft based on state
            image = state.bkgRaft.images[3];
            drawImage(image, state.tmpContext, 0, 0);
            context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, posX + 222, 268, image.width, image.height);

            // isle
            image = state.bkgRes.images[0];
            drawImage(image, state.tmpContext, 0, 0);
            context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, posX, 280, image.width, image.height);

            // palm tree
            image = state.bkgRes.images[14];
            drawImage(image, state.tmpContext, 0, 0);
            context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, posX + 108, 280, image.width, image.height);
            image = state.bkgRes.images[13];
            drawImage(image, state.tmpContext, 0, 0);
            context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, posX + 154, 148, image.width, image.height);
            image = state.bkgRes.images[12];
            drawImage(image, state.tmpContext, 0, 0);
            context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, posX + 77, 122, image.width, image.height);

            // Draw shore with animations
            image = state.bkgRes.images[3];
            drawImage(image, state.tmpContext, 0, 0);
            context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, posX - 13, 305, image.width, image.height);

            image = state.bkgRes.images[6];
            drawImage(image, state.tmpContext, 0, 0);
            context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, posX + 76, 320, image.width, image.height);

            image = state.bkgRes.images[10];
            drawImage(image, state.tmpContext, 0, 0);
            context.drawImage(state.tmpContext.canvas, 0, 0, image.width, image.height, posX + 230, 303, image.width, image.height);

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
        const isNight = false; // TODO: kept for future adaptation — implement day/night cycle
        let oceanIdx = Math.floor((Math.random() * 4)); // 0 to 3 (index 4 reserved for night)
        if (isNight) {
            oceanIdx = 4; // night ocean background
        }
        state.bkgScreen = state.bkgOcean[oceanIdx];
    }
};
