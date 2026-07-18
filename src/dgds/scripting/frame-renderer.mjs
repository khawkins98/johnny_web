/**
 * frame-renderer.mjs — Background drawing, canvas helpers, and resource loaders.
 *
 * Contains Johnny background resource loading plus the browser background
 * renderer. Resource loading is still a transitional game-package concern;
 * Canvas drawing is consumed only by the browser frame presenter.
 */
import { loadResourceEntry } from '../resource.mjs';
import { buildSpriteCanvas } from '../graphics.mjs';
import { createBrowserCompatibility } from './compatibility.mjs';

const fallbackCompatibility = createBrowserCompatibility();
const getCompatibility = state => state.compatibility || fallbackCompatibility;

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

export const clearContext = (context) => {
    context.clearRect(0, 0, 640, 480);
};

// ---------------------------------------------------------------------------
// Background renderer
//
//
// Cloud and wave effects use the injected compatibility profile. The browser
// profile supplies wall time; deterministic hosts can supply a logical clock.
// ---------------------------------------------------------------------------

export const drawBackground = (state, context) => {
    const compatibility = getCompatibility(state);
    const now = compatibility.now();

    // Draw background / ocean / night
    if (state.bkgScreen) {
        context.clearRect(0, 0, 640, 480);
        const bgCanvas = buildSpriteCanvas(state.bkgScreen.images[0]);
        if (bgCanvas) context.drawImage(bgCanvas, 0, 0);
    }

    if (state.island) {
        const posX = (state.island === 1) ? 288 : 16;
        const cloudsOn = compatibility.setting('jc-clouds', 'off') === 'on';
        const wavesOn = compatibility.setting('jc-waves', 'off') === 'on';

        if (cloudsOn) {
            if (!state.cloudElapsed) {
                state.cloudElapsed = Math.floor(compatibility.random() * 640) + now;
            }
            if (now > state.cloudElapsed) {
                state.cloudElapsed = 0;
                state.cloudX--;
                if (state.cloudX < -200) {
                    state.cloudX = 640;
                }
            }
        }

        if (wavesOn) {
            if (!state.waveElapsed) {
                state.waveElapsed = now + 250;
                state.waveFrame = 0;
            }
            if (now > state.waveElapsed) {
                state.waveElapsed = now + 250;
                state.waveFrame++;
            }
        } else {
            state.waveFrame = 0;
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
            const wf = state.waveFrame || 0;
            blit(state.bkgRes.images[3 + (wf % 3)], posX - 13, 305);
            blit(state.bkgRes.images[6 + (wf % 4)], posX + 76, 320);
            blit(state.bkgRes.images[10 + (wf % 2)], posX + 230, 303);
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
    const compatibility = getCompatibility(state);
    if (state.bkgOcean.length === 0) {
        ['OCEAN00.SCR', 'OCEAN01.SCR', 'OCEAN02.SCR', 'NIGHT.SCR'].forEach(name => {
            const entry = state.entries.find(e => e.name === name);
            if (entry !== undefined) {
                state.bkgOcean.push(loadResourceEntry(entry));
            }
        });
    }
    
    const timeMode = compatibility.setting('jc-time', 'original');
    let isNight = false;
    if (timeMode === 'local') {
        const hour = compatibility.currentHour();
        isNight = hour < 6 || hour >= 18;
    } else {
        isNight = state.isNightMode === true;
    }
    
    const oceanIdx = isNight ? 3 : compatibility.randomInt(0, 2);
    state.bkgScreen = state.bkgOcean[oceanIdx];
};
