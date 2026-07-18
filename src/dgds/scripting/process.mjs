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
import { createFixedStepClock, DGDS_TICK_MS } from './timing.mjs';
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
export { runScript, TTMDispatch, ADSDispatch, CommandType, isVerboseMode, verboseLog } from './script-runner.mjs';

let state = null;

const renderPipeline = () => {
    // Layer 0: Background
    state.mainContext.clearRect(0, 0, 640, 480);
    const bgState = state.scenes.find(s => s?.state?.bkgScreen)?.state ?? state;
    drawBackground(bgState, state.mainContext);



    // Layer 2: Fade Mask
    // Draw fade-to-black overlay ON TOP of background but BEHIND sprites
    // so hidden cleanup animations (like "Walk out of water") remain visible.
    if (state.fadingOut || state.fadingIn) {
        state.context.fillStyle = `rgba(0, 0, 0, ${state.fadeOpacity})`;
        state.context.fillRect(0, 0, 640, 480);
        
        if (state.fadingOut) {
            if (state.fadeOpacity >= 1) {
                state.fadingOut = false;
            }
        } else if (state.fadingIn) {
            state.fadeOpacity -= state.frameDelta / 400;
            if (state.fadeOpacity <= 0) {
                state.fadingIn = false;
                state.fadeOpacity = 0;
            }
        }
    }

    // Layer 3: Child Scenes (Sprites)
    // Draw the unified sprite canvas ON TOP of fade overlay
    if (state.spriteContext) {
        state.context.drawImage(state.spriteContext.canvas, 0, 0);
    }
};

const runAdsController = () => {
    let exitFrame = false;
    const scene = state.data.scenes[state.currentScene];
    
    if (scene !== undefined) {
        const prevScene = state.currentScene;
        exitFrame = runScript(state, scene.script, true);
        if (state.currentScene !== prevScene) {
            const tagInfo = state.data.scenes[state.currentScene]?.tagId;
            const tagDesc = !tagInfo ? 'done'
                : typeof tagInfo === 'object' ? `${tagInfo.id}:${tagInfo.description}`
                : tagInfo;
            debugLog(`Scene ${state.currentScene}/${state.data.scenes.length} started (${tagDesc})`);
            
            // Instead of instantly popping the curtain, smoothly fade it in over the next few frames
            if (state.fadeOpacity >= 1) {
                state.fadingOut = false;
                state.fadingIn = true;
                state.fadeOpacity = 1;
            } else {
                state.fadingOut = false;
                state.fadeOpacity = 0;
            }
        }
    } else if (state.scenes.length === 0 && state.addScenes.length === 0) {
        // All main ADS scenes played and no child scenes remain — done.
        debugLog('ADS cycle complete — calling onComplete');
        exitFrame = true;
    }
    
    return exitFrame;
};

const runTtmController = () => {
    state.scenes.forEach(s => {
        // Don't re-run scripts that have already completed — they should freeze on their
        // final frame. GOTO scenes will loop indefinitely as 'running'. Only non-looping
        // scenes (no GOTO) reach 'completed'.
        if (s.lifecycle !== 'completed') {
            s.lifecycle = 'running';
            runScript(s.state, s.state.script || s.script);
            if (s.state.played) {
                if (s.retries > 0) {
                    s.retries--;
                    s.state.played = false;
                    s.state.reentry = 0; // Rewind script to start
                    s.state.delay = 0;
                    s.state.waitTicks = 0;
                    s.state.timer = 0;
                } else {
                    s.lifecycle = 'completed';
                }
            }
        }
        // Always tick timers (even for completed scenes) so timer-based IF_PLAYED works.
        if (s.state.timer > 0) {
            s.state.timer--;
        }
    });
};

const runScripts = () => {
    if (state.type === 'ADS') {
        clearContext(state.context);
        
        const exitFrame = runAdsController();
        
        const scene = state.data.scenes[state.currentScene];
        if (!state.continue || scene === undefined) {
            runTtmController();
            renderPipeline();
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
        clock: createFixedStepClock(),
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
        elapsedTimer: 0,
        delay: 0,
        waitTicks: 0,
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
        orMode: false,
        orChainPassed: false,
        frameDelta: 0,
        random: Math.random,
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

    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = 640;
    spriteCanvas.height = 480;
    state.spriteContext = spriteCanvas.getContext('2d');

    return state;
};

export const stopProcess = () => {
    if (state?.frameId) {
        cancelAnimationFrame(state.frameId);
    }
    state = null;
};

// Expose state manipulators for the debug UI
export const __DEBUG__ = {
    jumpToScene: (tagId) => {
        if (!state || state.type !== 'ADS') return;
        const sceneIndex = state.data.scenes.findIndex(s => s.tagId && s.tagId.id === tagId);
        if (sceneIndex !== -1) {
            state.currentScene = sceneIndex;
            state.scenes = []; // Clear active child scenes
            state.addScenes = [];
            state.removeScenes = [];
            state.playedHistory.clear();
            state.continue = true;
            state.reentry = 0;
            state.jumpTo = undefined;
            state.lastCommand = false;
            state.orMode = false;
            state.orChainPassed = false;
            if (state.context) clearContext(state.context);
            if (state.tmpContext) clearContext(state.tmpContext);
            debugLog(`DEBUG: jumped to scene ${tagId} (index ${sceneIndex})`);
        }
    },
    setNightMode: (isNight) => {
        if (!state || state.type !== 'ADS') return;
        state.isNightMode = isNight;
        const oceanIdx = isNight ? 3 : Math.floor(Math.random() * 3);
        
        // Update root state
        if (state.bkgOcean && state.bkgOcean.length > 0) {
            state.bkgScreen = state.bkgOcean[oceanIdx];
        }
        // Update all child scenes that have ocean loaded
        state.scenes.forEach(s => {
            if (s.state && s.state.bkgOcean && s.state.bkgOcean.length > 0) {
                s.state.bkgScreen = s.state.bkgOcean[oceanIdx];
            }
        });
        
        if (state.mainContext) {
            const bgState = state.scenes.find(s => s?.state?.bkgScreen)?.state ?? state;
            drawBackground(bgState, state.mainContext);
        }
    },
    getState: () => state
};

window.requestAnimationFrame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame
    || window.msRequestAnimationFrame
    || ((f) => setTimeout(() => f(performance.now()), DGDS_TICK_MS));

const mainloop = (timestamp) => {
    state.frameId = requestAnimationFrame(mainloop);

    const ticks = state.clock.consume(timestamp);
    for (let tick = 0; tick < ticks; tick++) {
        // Compatibility effects still consume milliseconds, but the value is
        // derived from a logical tick rather than arbitrary browser frame time.
        state.frameDelta = DGDS_TICK_MS;

        if (runScripts()) {
            cancelAnimationFrame(state.frameId);
            if (typeof state.onComplete === 'function') {
                state.onComplete();
            }
            break;
        }
    }
}
/* eslint-enable */
