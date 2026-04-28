/**
 * DGDS process engine — interprets ADS (Animation Director Scripts) and TTM (Tiny Templated Movies).
 *
 * Architecture:
 *  - ADS: high-level sequencer that steps through `data.scenes[]` one at a time. Each scene can
 *    spawn concurrent TTM sub-scenes via ADD_SCENE/PLAY_SCENE and gate progression with conditionals.
 *  - TTM: per-frame opcode stream for drawing sprites, playing audio, setting delays, etc.
 *  - `runScript()` advances a script one command per rAF tick, pausing when state.continue becomes
 *    false (e.g. UPDATE delay not elapsed) and resuming via state.reentry next tick.
 *
 * Limitations / known issues:
 *  - NOTE: Single active process only. All runtime state (state, scenes, scenesRes, background
 *    assets, currentScene) is module-level. Calling startProcess() replaces any running process.
 *  - NOTE: Several TTM opcodes remain stubs (FADE_IN, SAVE_REGION, GOTO full-jump,
 *    region save/restore). These are deferred to Phase 2 of the refactor. */
import { createAudioManager } from '../audio.mjs';
import { loadResourceEntry } from '../resource.mjs';
import { PALETTE } from '../../scrantic/palette.mjs';
import {
    isDebugMode,
    debugLog,
    clearContext,
    drawBackground,
    runScript,
    TTMDispatch,
    ADSDispatch,
    CommandType,
} from './script-runner.mjs';

// Re-export public API (tests and callers import from process.mjs)
export { runScript, TTMDispatch, ADSDispatch, CommandType } from './script-runner.mjs';

const fps = 1000 / 60;

let state = null;

const runScripts = () => {
    if (state.type === 'ADS') {
        let exitFrame = false;

        clearContext(state.context);

        if (state.island) {
            // Background resources are loaded by LOAD_SCREEN in the TTM prologue, which runs
            // on the first child scene. The main ADS state never runs LOAD_SCREEN directly, so
            // look for resources from the first child state that has them. Falls back to main
            // state (no-op draw) until a child state has loaded them.
            const bgState = state.scenes.find(s => s?.state?.bkgScreen)?.state ?? state;
            drawBackground(bgState, state.mainContext);
        }
        const saveBkg = state.saveBkg[0];
        if (saveBkg.canDraw) {
            state.context.drawImage(saveBkg.context.canvas, 0, 0);
        }

        const scene = state.data.scenes[state.currentScene];
        if (scene !== undefined) {
            const prevScene = state.currentScene;
            exitFrame = runScript(state, scene.script, true);
            if (state.currentScene !== prevScene) {
                debugLog(`Scene ${state.currentScene}/${state.data.scenes.length} started (tagId ${state.data.scenes[state.currentScene]?.tagId ?? 'done'})`);
            }
        } else if (state.scenes.length === 0 && state.addScenes.length === 0) {
            // All main ADS scenes played and no child scenes remain — done.
            debugLog('ADS cycle complete — calling onComplete');
            exitFrame = true;
        }

        if (!state.continue) {
            state.scenes.forEach(s => {
                // Don't re-run scripts that have already completed — they should freeze on their
                // last frame. GOTO-looping scenes stay 'running' indefinitely; only single-play
                // scenes (no GOTO) reach 'completed'.
                if (s.lifecycle !== 'completed') {
                    runScript(s.state, s.script);
                    // Update lifecycle based on execution result.
                    if (s.state.played) {
                        s.lifecycle = 'completed';
                    } else if (s.state.runs > 0) {
                        s.lifecycle = 'running';
                    }
                }
                // Always tick timers (even for completed scenes) so timer-based IF_PLAYED works.
                if (s.state.timer > 0) {
                    s.state.timer = Math.max(0, s.state.timer - state.frameDelta);
                }
            });
            state.scenes.forEach(s => {
                state.context.drawImage(s.state.context.canvas, 0, 0);
            });
        }

        // Draw fade-to-black overlay on top of composited sprites (applied whether or not
        // child scenes are running, so the overlay shows on the END-fires frame too).
        if (state.fadingOut) {
            state.context.fillStyle = `rgba(0, 0, 0, ${state.fadeOpacity})`;
            state.context.fillRect(0, 0, 640, 480);
            // Once fully black, clear after drawing so the overlay covers the END-fires frame
            // but is gone before the next gag starts — regardless of state.continue.
            if (state.fadeOpacity >= 1) {
                debugLog('FADE_OUT: complete, clearing overlay');
                state.fadingOut = false;
            }
        }

        return exitFrame;
    } else {
        if (state.island) {
            drawBackground(state, state.mainContext);
        }
        return runScript(state, state.data.scripts);
    }
};

export const startProcess = (initialState) => {
    // NOTE: The ...initialState spread at the end silently overrides all defaults above it.
    // Callers should only pass the expected keys (context, mainContext, entries, data, type,
    // audioManager, onComplete) to avoid accidentally clobbering runtime state.
    // FIXME this state needs a deep clean up
    state = {
        currentScene: 0,
        scenesRes: [],
        scenes: [],
        scenesRandom: [],
        addScenes: [],
        removeScenes: [],
        bkgScreen: null,
        bkgRes: null,
        bkgOcean: [],
        bkgRaft: null,
        cloudIdx: Math.floor((Math.random() * 3) + 15),
        cloudX: Math.floor((Math.random() * 640)),
        cloudY: Math.floor((Math.random() * 80)),
        cloudElapsed: 0,
        tick: null,
        prevTick: Date.now(),
        data: null,
        context: null,
        tmpContext: null,
        mainContext: null,
        save: [],
        saveIndex: 0,
        saveBkg: [],
        audioManager: null,
        slot: 0,
        res: [],
        // this should be for multiple running scripts
        reentry: 0,
        elapsed: 0,
        elapsedTimer: 0,
        delay: 0,
        timer: 0,
        continue: true,
        frameId: null,
        island: 1,
        foregroundColor: PALETTE[0],
        backgroundColor: PALETTE[0],
        clip: { x: 0, y: 0, width: 640, height: 480 },
        type: null,
        skip: false,
        randomize: false,
        purge: false,
        played: false,
        runs: 0,
        lastCommand: false,
        playedHistory: new Set(),
        frameDelta: 0,
        reentryNow: 0,
        jumpTo: undefined,
        fadingOut: false,
        fadeOpacity: 0,
        ...initialState,
    };

    // temp canvas
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = 640;
    tmpCanvas.height = 480;
    state.tmpContext = tmpCanvas.getContext('2d');

    for (let s = 0; s < 3; s += 1) {
        const c = document.createElement("canvas");
        c.width = 640;
        c.height = 480;
        state.save.push({
            context: c.getContext('2d'),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            canDraw: false,
        });
    }

    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 480;
    state.saveBkg.push({
        context: c.getContext('2d'),
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        canDraw: false,
    });

    // Use the audioManager passed in (created during user interaction for autoplay
    // policy compliance). Fall back to creating one if not provided.
    state.audioManager = initialState.audioManager || createAudioManager({ soundFxVolume: 0.50 });

    if (state.type === 'ADS') {
        debugLog(`ADS cycle starting: ${state.data.scenes.length} scenes in "${state.data?.name ?? '?'}"`);
        state.data.resources.forEach(r => {
            const entry = state.entries.find(e => e.name === r.name);
            if (entry !== undefined) {
                // Index by the resource's own ID (which can be non-sequential, e.g. 1,2,4,5).
                // ADD_SCENE uses these IDs directly, so we must preserve the mapping.
                state.scenesRes[r.id] = loadResourceEntry(entry);
            }
        });
        debugLog('scenesRes:', state.scenesRes.map((r, i) => r ? `[${i}]=${r.name}` : null).filter(Boolean).join(', '));
    }
    mainloop();

    return state;
};

export const stopProcess = () => {
    if (state?.frameId) {
        cancelAnimationFrame(state.frameId);
    }
    state = null;
};

window.requestAnimationFrame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame
    || window.msRequestAnimationFrame
    || ((f) => setTimeout(f, fps));

const mainloop = () => {
    state.frameId = requestAnimationFrame(mainloop);

    state.tick = Date.now();
    const elapsed = state.tick - state.prevTick;
    state.frameDelta = elapsed;

    if (elapsed > fps) {
        state.prevTick = state.tick - (elapsed % fps);
    }

    if (runScripts()) {
        cancelAnimationFrame(state.frameId);
        if (typeof state.onComplete === 'function') {
            state.onComplete();
        }
    }
}
/* eslint-enable */
