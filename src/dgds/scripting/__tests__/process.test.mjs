/**
 * Unit tests for the process.mjs opcode interpreter.
 *
 * Scope: pure/synchronous aspects only — no DOM, no canvas, no rAF.
 * The CommandType dispatch tables and individual opcode handlers are tested by
 * exercising their callback functions directly with minimal mock state objects.
 *
 * Known remaining bugs documented inline:
 *  1. GOTO no-op: the GOTO handler ignores tagId and always resets reentry to 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandType, TTMDispatch, ADSDispatch, runScript } from '../process.mjs';

// ---------------------------------------------------------------------------
// CommandType dispatch table
// ---------------------------------------------------------------------------
describe('CommandType dispatch table', () => {
    it('is a non-empty array', () => {
        expect(Array.isArray(CommandType)).toBe(true);
        expect(CommandType.length).toBeGreaterThan(0);
    });

    it('every entry has an opcode (number) and a callback (function)', () => {
        for (const entry of CommandType) {
            expect(typeof entry.opcode).toBe('number');
            expect(typeof entry.callback).toBe('function');
        }
    });

    it('TTMDispatch: opcode 0x2010 resolves to SET_FRAME1', () => {
        const entry = TTMDispatch.find(e => e.opcode === 0x2010);
        expect(entry).toBeDefined();
        expect(entry.callback.name).toBe('SET_FRAME1');
    });

    it('ADSDispatch: opcode 0x2010 resolves to STOP_SCENE (correctly separated from TTM)', () => {
        const entry = ADSDispatch.find(e => e.opcode === 0x2010);
        expect(entry).toBeDefined();
        expect(entry.callback.name).toBe('STOP_SCENE');
    });

    it('TTMDispatch: opcode 0xF010 resolves to LOAD_SCREEN', () => {
        const entry = TTMDispatch.find(e => e.opcode === 0xF010);
        expect(entry).toBeDefined();
        expect(entry.callback.name).toBe('LOAD_SCREEN');
    });

    it('ADSDispatch: opcode 0xf010 resolves to ADS_FADE_OUT (correctly separated from TTM)', () => {
        const entry = ADSDispatch.find(e => e.opcode === 0xf010);
        expect(entry).toBeDefined();
        expect(entry.callback.name).toBe('ADS_FADE_OUT');
    });

    it('GOTO entry exists at opcode 0x1200 in TTMDispatch with a valid callback', () => {
        const entry = TTMDispatch.find(e => e.opcode === 0x1200);
        expect(entry).toBeDefined();
        expect(typeof entry.callback).toBe('function');
    });

    it('GOTO callback is named GOTO', () => {
        const entry = CommandType.find(e => e.opcode === 0x1200);
        expect(entry.callback.name).toBe('GOTO');
    });
});

// ---------------------------------------------------------------------------
// Opcode parameter decoding (TTM encoding rule)
//
// Raw opcodes in TTM files are 16-bit values where:
//   - bits [3:0]  (lower nibble) = number of 16-bit parameters that follow
//   - bits [15:4] (upper 12 bits, masked with 0xfff0) = canonical opcode
// This rule is implemented in the TTM/ADS parsers (ttm.mjs, ads.mjs).
// These tests document the encoding invariant at the architectural level.
// ---------------------------------------------------------------------------
describe('opcode parameter decoding (TTM 16-bit encoding rule)', () => {
    it('lower 4 bits encode the parameter count', () => {
        const rawOpcode = 0x1021; // SET_DELAY with 1 param
        expect(rawOpcode & 0x000f).toBe(1);
    });

    it('upper 12 bits (& 0xfff0) encode the canonical opcode', () => {
        const rawOpcode = 0x1021; // SET_DELAY raw value → canonical opcode 0x1020
        expect(rawOpcode & 0xfff0).toBe(0x1020);
    });

    it('zero-param opcode: UPDATE (0x0ff0) has paramCount 0', () => {
        const rawOpcode = 0x0ff0;
        expect(rawOpcode & 0x000f).toBe(0);
        expect(rawOpcode & 0xfff0).toBe(0x0ff0);
    });

    it('four-param opcode: SET_CLIP_REGION raw 0x4004 → opcode 0x4000, paramCount 4', () => {
        const rawOpcode = 0x4004;
        expect(rawOpcode & 0x000f).toBe(4);
        expect(rawOpcode & 0xfff0).toBe(0x4000);
    });

    it('string-param sentinel: size === 15 (0xf) signals a null-terminated string follows', () => {
        // e.g. LOAD_SCREEN raw 0xf01f → opcode 0xf010, size 0xf = 15 (string param)
        const rawOpcode = 0xf01f;
        expect(rawOpcode & 0x000f).toBe(15);
        expect(rawOpcode & 0xfff0).toBe(0xf010);
    });
});

// ---------------------------------------------------------------------------
// GOTO handler
// ---------------------------------------------------------------------------
describe('GOTO handler', () => {
    // BUG: tagId is ignored — GOTO always resets reentry to 0 (start of script).
    // Correct implementation would need to seek to the position of the labelled tag
    // in the current script, which is currently unimplemented.
    it('BUG: resets state.reentry to 0 regardless of tagId argument', () => {
        const gotoEntry = CommandType.find(e => e.opcode === 0x1200);
        const mockState = { reentry: 42 };
        gotoEntry.callback(mockState, 7); // tagId = 7 — should seek to tag 7, but does not
        expect(mockState.reentry).toBe(0); // not 7
    });

    it('BUG: resets to 0 even when tagId is non-zero and reentry is already 0', () => {
        const gotoEntry = CommandType.find(e => e.opcode === 0x1200);
        const mockState = { reentry: 0 };
        gotoEntry.callback(mockState, 5); // tagId = 5, still ignored
        expect(mockState.reentry).toBe(0);
    });

    it('only mutates state.reentry — no other state properties are touched', () => {
        const gotoEntry = CommandType.find(e => e.opcode === 0x1200);
        const mockState = { reentry: 10, continue: true, plays: 3 };
        gotoEntry.callback(mockState, 99);
        expect(mockState.reentry).toBe(0);
        expect(mockState.continue).toBe(true);
        expect(mockState.plays).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// runScript — scene transition logic
// ---------------------------------------------------------------------------
describe('runScript scene transition', () => {
    let consoleSpy;

    beforeEach(() => {
        // Suppress the console.log calls inside runScript (c.line debug output).
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it('increments currentScene after the last command completes when main=true', () => {
        // A single-command ADS script using PURGE (0x0110, not in ADSDispatch so skipped).
        // When runScript exhausts script[0] as last entry, reentry===0===length-1 triggers
        // end-of-script: played=true and currentScene advances.
        const mockState = {
            reentry: 0,
            reentryNow: 0,
            jumpTo: undefined,
            continue: true,
            lastCommand: false,
            runs: 0,
            played: false,
            type: 'ADS',
            currentScene: 0,
        };
        const script = [{ opcode: 0x0110, params: [], line: 'PURGE' }];
        runScript(mockState, script, /* main= */ true);
        expect(mockState.currentScene).toBe(1);
        expect(mockState.played).toBe(true);
    });

    it('does NOT increment currentScene when main=false (TTM child scene)', () => {
        const mockState = {
            reentry: 0,
            reentryNow: 0,
            jumpTo: undefined,
            continue: true,
            lastCommand: false,
            runs: 0,
            played: false,
            type: 'TTM',
            currentScene: 0,
        };
        const script = [{ opcode: 0x0110, params: [], line: 'PURGE' }];
        runScript(mockState, script, /* main= */ false);
        expect(mockState.currentScene).toBe(0);
        expect(mockState.played).toBe(true);
    });

    it('increments state.runs on each completed script pass', () => {
        const mockState = {
            reentry: 0,
            reentryNow: 0,
            jumpTo: undefined,
            continue: true,
            lastCommand: false,
            runs: 0,
            played: false,
            type: 'ADS',
            currentScene: 0,
        };
        const script = [{ opcode: 0x0110, params: [], line: 'PURGE' }];
        runScript(mockState, script, true);
        expect(mockState.runs).toBe(1);
    });

    it('returns true immediately when script is undefined', () => {
        const mockState = { reentry: 0, continue: true };
        expect(runScript(mockState, undefined, false)).toBe(true);
    });

    it('returns true immediately when state.reentry is -1', () => {
        const mockState = { reentry: -1, continue: true };
        const script = [{ opcode: 0x0110, params: [], line: 'PURGE' }];
        expect(runScript(mockState, script, false)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// SET_TIMER handler
// ---------------------------------------------------------------------------
describe('SET_TIMER handler', () => {
    const entry = CommandType.find(e => e.opcode === 0x2020);

    it('sets timer to timer*20 + delay*20', () => {
        const mockState = { timer: 0 };
        entry.callback(mockState, 3, 5); // delay=3, timer=5
        expect(mockState.timer).toBe(5 * 20 + 3 * 20); // 160
    });

    it('uses delay=1 when delay argument is 0', () => {
        const mockState = { timer: 0 };
        entry.callback(mockState, 0, 5); // delay=0 → treated as 1
        expect(mockState.timer).toBe(5 * 20 + 1 * 20); // 120
    });
});

// ---------------------------------------------------------------------------
// IF_NOT_PLAYED handler
// ---------------------------------------------------------------------------
describe('IF_NOT_PLAYED handler', () => {
    const entry = ADSDispatch.find(e => e.opcode === 0x1330);

    const makeState = (played, script) => ({
        playedHistory: new Set(played),
        data: { scenes: [{ script }] },
        currentScene: 0,
        reentryNow: 0,
        jumpTo: undefined,
    });

    it('does not set jumpTo when scene is NOT in playedHistory (execute block)', () => {
        const script = [
            { opcode: 0x1330, params: [1, 7] },
            { opcode: 0x1430, params: [] },
            { opcode: 0xfff0, params: [] },
        ];
        const state = makeState([], script);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBeUndefined();
    });

    it('sets jumpTo to endIfIdx+1 when scene IS in playedHistory (skip block)', () => {
        const script = [
            { opcode: 0x1330, params: [1, 7] },  // index 0: IF_NOT_PLAYED
            { opcode: 0x1430, params: [] },       // index 1: inside block
            { opcode: 0xfff0, params: [] },       // index 2: END_IF
            { opcode: 0x1430, params: [] },       // index 3: after block
        ];
        const state = makeState(['1:7'], script);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBe(3);
    });

    it('leaves jumpTo undefined when no END_IF found (graceful no-op)', () => {
        const script = [
            { opcode: 0x1330, params: [1, 7] },
            { opcode: 0x1430, params: [] },
        ];
        const state = makeState(['1:7'], script);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBeUndefined();
    });

    it('correctly uses composite "sceneIdx:tagId" key — different tagId does not match', () => {
        const script = [
            { opcode: 0x1330, params: [1, 7] },
            { opcode: 0xfff0, params: [] },
        ];
        // '1:8' in history but checking '1:7' — should NOT trigger a jump
        const state = makeState(['1:8'], script);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// IF_NOT_RUNNING handler
// ---------------------------------------------------------------------------
describe('IF_NOT_RUNNING handler', () => {
    const entry = ADSDispatch.find(e => e.opcode === 0x1360);

    const makeState = (scenes) => ({
        scenes,
        data: { scenes: [{ script: [
            { opcode: 0x1360, params: [1, 7] },  // index 0
            { opcode: 0x1430, params: [] },       // index 1: inside block
            { opcode: 0xfff0, params: [] },       // index 2: END_IF
            { opcode: 0x1430, params: [] },       // index 3: after block
        ]}] },
        currentScene: 0,
        reentryNow: 0,
        jumpTo: undefined,
    });

    it('sets jumpTo to skip block when scene lifecycle is "active"', () => {
        const state = makeState([{ sceneIdx: 1, tagId: 7, lifecycle: 'active' }]);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBe(3);
    });

    it('sets jumpTo to skip block when scene lifecycle is "running"', () => {
        const state = makeState([{ sceneIdx: 1, tagId: 7, lifecycle: 'running' }]);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBe(3);
    });

    it('does not set jumpTo when scene lifecycle is "completed"', () => {
        const state = makeState([{ sceneIdx: 1, tagId: 7, lifecycle: 'completed' }]);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBeUndefined();
    });

    it('does not set jumpTo when scene is absent from scenes[]', () => {
        const state = makeState([]);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// IF_RUNNING handler
// ---------------------------------------------------------------------------
describe('IF_RUNNING handler', () => {
    const entry = ADSDispatch.find(e => e.opcode === 0x1370);

    const makeState = (scenes) => ({
        scenes,
        data: { scenes: [{ script: [
            { opcode: 0x1370, params: [1, 7] },  // index 0
            { opcode: 0x1430, params: [] },       // index 1: inside block
            { opcode: 0xfff0, params: [] },       // index 2: END_IF
            { opcode: 0x1430, params: [] },       // index 3: after block
        ]}] },
        currentScene: 0,
        reentryNow: 0,
        jumpTo: undefined,
    });

    it('does not set jumpTo when scene lifecycle is "active" (execute block)', () => {
        const state = makeState([{ sceneIdx: 1, tagId: 7, lifecycle: 'active' }]);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBeUndefined();
    });

    it('does not set jumpTo when scene lifecycle is "running" (execute block)', () => {
        const state = makeState([{ sceneIdx: 1, tagId: 7, lifecycle: 'running' }]);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBeUndefined();
    });

    it('sets jumpTo when scene is absent (not running → skip block)', () => {
        const state = makeState([]);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBe(3);
    });

    it('sets jumpTo when scene lifecycle is "completed" (no longer running → skip block)', () => {
        const state = makeState([{ sceneIdx: 1, tagId: 7, lifecycle: 'completed' }]);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// runScript — jumpTo / reentryNow mechanism
// ---------------------------------------------------------------------------
describe('runScript jumpTo mechanism', () => {
    let origAndCallback;

    beforeEach(() => {
        origAndCallback = ADSDispatch.find(e => e.opcode === 0x1420).callback;
    });

    afterEach(() => {
        ADSDispatch.find(e => e.opcode === 0x1420).callback = origAndCallback;
    });

    it('skips the block when IF_NOT_PLAYED fires (scene already in playedHistory)', () => {
        // Script: IF_NOT_PLAYED | OR (inside block) | END_IF | OR (after block)
        // IF_NOT_PLAYED sees '1:7' in history → sets jumpTo=3, skipping indices 1-2.
        // Execution resumes at index 3. Index 3 is the last command, so played=true.
        const script = [
            { opcode: 0x1330, params: [1, 7] },  // 0: IF_NOT_PLAYED
            { opcode: 0x1430, params: [] },       // 1: OR — inside block (skipped)
            { opcode: 0xfff0, params: [] },       // 2: END_IF
            { opcode: 0x1430, params: [] },       // 3: OR — after block (runs)
        ];
        const mockState = {
            reentry: 0,
            reentryNow: 0,
            jumpTo: undefined,
            continue: true,
            lastCommand: false,
            runs: 0,
            played: false,
            type: 'ADS',
            currentScene: 0,
            playedHistory: new Set(['1:7']),
            data: { scenes: [{ script }] },
            scenes: [],
        };
        runScript(mockState, script, true);
        expect(mockState.played).toBe(true);
        expect(mockState.currentScene).toBe(1);
    });

    it('does not skip the block when IF_NOT_PLAYED fires (scene NOT in playedHistory)', () => {
        const script = [
            { opcode: 0x1330, params: [1, 7] },  // 0: IF_NOT_PLAYED — NOT in history → no jump
            { opcode: 0x1430, params: [] },       // 1: OR — executes normally
            { opcode: 0xfff0, params: [] },       // 2: END_IF — executes normally
            { opcode: 0x1430, params: [] },       // 3: OR — executes normally
        ];
        const mockState = {
            reentry: 0,
            reentryNow: 0,
            jumpTo: undefined,
            continue: true,
            lastCommand: false,
            runs: 0,
            played: false,
            type: 'ADS',
            currentScene: 0,
            playedHistory: new Set(),
            data: { scenes: [{ script }] },
            scenes: [],
        };
        runScript(mockState, script, true);
        // All 4 commands ran; last one (index 3) sets reentry=3 → end-of-script
        expect(mockState.played).toBe(true);
        expect(mockState.currentScene).toBe(1);
    });

    it('sets state.reentryNow to the index of each command before invoking its callback', () => {
        let capturedIdx = -1;
        const andEntry = ADSDispatch.find(e => e.opcode === 0x1420);
        andEntry.callback = (state, ...params) => {
            capturedIdx = state.reentryNow;
            origAndCallback(state, ...params);
        };
        const script = [
            { opcode: 0x1430, params: [] },  // 0: OR (no spy)
            { opcode: 0x1420, params: [] },  // 1: AND (spy captures reentryNow)
        ];
        const mockState = {
            reentry: 0,
            reentryNow: 0,
            jumpTo: undefined,
            continue: true,
            lastCommand: false,
            runs: 0,
            played: false,
            type: 'ADS',
            currentScene: 0,
            playedHistory: new Set(),
            data: { scenes: [{ script }] },
            scenes: [],
        };
        runScript(mockState, script, true);
        expect(capturedIdx).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// PLAY_SCENE — playedHistory tracking
// ---------------------------------------------------------------------------
describe('PLAY_SCENE playedHistory tracking', () => {
    const entry = ADSDispatch.find(e => e.opcode === 0x1510);

    it('adds removed scenes to playedHistory before splicing them out', () => {
        const mockState = {
            continue: true,
            playedHistory: new Set(),
            scenes: [{ sceneIdx: 1, tagId: 7, state: { played: true, timer: 0 } }],
            removeScenes: [{ sceneIdx: 1, tagId: 7 }],
            addScenes: [],
            scenesRes: {},
        };
        entry.callback(mockState);
        expect(mockState.playedHistory.has('1:7')).toBe(true);
        expect(mockState.scenes).toHaveLength(0);
    });

    it('does not mark playedHistory if the scene is not found in scenes[]', () => {
        const mockState = {
            continue: true,
            playedHistory: new Set(),
            scenes: [],
            removeScenes: [{ sceneIdx: 1, tagId: 7 }],
            addScenes: [],
            scenesRes: {},
        };
        entry.callback(mockState);
        expect(mockState.playedHistory.has('1:7')).toBe(false);
    });

    it('is a no-op when continue is false', () => {
        const mockState = {
            continue: false,
            playedHistory: new Set(),
            scenes: [{ sceneIdx: 1, tagId: 7, state: {} }],
            removeScenes: [{ sceneIdx: 1, tagId: 7 }],
            addScenes: [],
        };
        entry.callback(mockState);
        expect(mockState.playedHistory.size).toBe(0);
        expect(mockState.scenes).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// PLAY_SCENE — canContinue (lifecycle-based blocking)
// ---------------------------------------------------------------------------
describe('PLAY_SCENE canContinue logic', () => {
    const entry = ADSDispatch.find(e => e.opcode === 0x1510);

    it('unblocks immediately when scenes list is empty', () => {
        const state = { continue: false, scenes: [], removeScenes: [], addScenes: [], playedHistory: new Set(), scenesRes: {} };
        entry.callback(state);
        expect(state.continue).toBe(true);
    });

    it('unblocks when all scenes are "running" (no "active" scenes waiting)', () => {
        const state = {
            continue: false,
            scenes: [
                { sceneIdx: 1, tagId: 1, lifecycle: 'running', state: {} },
                { sceneIdx: 1, tagId: 2, lifecycle: 'running', state: {} },
            ],
            removeScenes: [], addScenes: [], playedHistory: new Set(), scenesRes: {},
        };
        entry.callback(state);
        expect(state.continue).toBe(true);
    });

    it('stays blocked when any scene is "active" (newly added, not yet looped)', () => {
        const state = {
            continue: false,
            scenes: [
                { sceneIdx: 1, tagId: 1, lifecycle: 'running', state: { runs: 3 } },
                { sceneIdx: 1, tagId: 2, lifecycle: 'active',  state: { runs: 0 } },
            ],
            removeScenes: [], addScenes: [], playedHistory: new Set(), scenesRes: {},
        };
        entry.callback(state);
        expect(state.continue).toBe(false);
    });

    it('does NOT unblock prematurely when old "running" scenes coexist with new "active" scene', () => {
        // Regression: previous canContinue logic used bitwise-OR sticky ratchet that
        // returned true as soon as any scene had runs > 0, even if a newly-added scene
        // (lifecycle:'active', runs:0) had not yet run.
        const state = {
            continue: false,
            scenes: [
                { sceneIdx: 5, tagId: 42, lifecycle: 'running', state: { runs: 5 } },
                { sceneIdx: 5, tagId: 12, lifecycle: 'active',  state: { runs: 0 } },
            ],
            removeScenes: [], addScenes: [], playedHistory: new Set(), scenesRes: {},
        };
        entry.callback(state);
        expect(state.continue).toBe(false);
    });

    it('unblocks when all scenes are "completed"', () => {
        const state = {
            continue: false,
            scenes: [{ sceneIdx: 1, tagId: 1, lifecycle: 'completed', state: {} }],
            removeScenes: [], addScenes: [], playedHistory: new Set(), scenesRes: {},
        };
        entry.callback(state);
        expect(state.continue).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// ADS_FADE_OUT — fade-to-black animation
// ---------------------------------------------------------------------------
describe('ADS_FADE_OUT handler', () => {
    const entry = ADSDispatch.find(e => e.opcode === 0xf010);

    it('starts the fade on first call (continue=true): sets fadingOut, opacity=0, blocks', () => {
        const state = { continue: true, fadingOut: false, fadeOpacity: 0, frameDelta: 16 };
        entry.callback(state);
        expect(state.fadingOut).toBe(true);
        expect(state.fadeOpacity).toBe(0);
        expect(state.continue).toBe(false);
    });

    it('increments opacity each frame while fading (continue=false)', () => {
        const state = { continue: false, fadingOut: true, fadeOpacity: 0.5, frameDelta: 100 };
        entry.callback(state);
        expect(state.fadeOpacity).toBeCloseTo(0.75); // 0.5 + 100/400
        expect(state.continue).toBe(false);
    });

    it('clamps opacity at 1 and unblocks when fade is complete', () => {
        const state = { continue: false, fadingOut: true, fadeOpacity: 0.95, frameDelta: 100 };
        entry.callback(state);
        expect(state.fadeOpacity).toBe(1);
        expect(state.fadingOut).toBe(true);  // still true so runScripts draws the black frame
        expect(state.continue).toBe(true);   // unblocks so END can fire
    });

    it('is named ADS_FADE_OUT in the dispatch table', () => {
        expect(entry).toBeDefined();
        expect(entry.callback.name).toBe('ADS_FADE_OUT');
    });
});
