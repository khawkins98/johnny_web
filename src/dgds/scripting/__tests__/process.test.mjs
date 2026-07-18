/**
 * Unit tests for the process.mjs opcode interpreter.
 *
 * Scope: pure/synchronous aspects only — no DOM, no canvas, no rAF.
 * The ADS/TTM dispatch tables and individual opcode handlers are tested by
 * exercising their callback functions directly with minimal mock state objects.
 *
 * Known remaining bugs documented inline:
 *  1. GOTO no-op: the GOTO handler ignores tagId and always resets reentry to 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTMDispatch, ADSDispatch, runScript } from '../script-runner.mjs';
import { ExecutionStatus, executionOutcome } from '../execution-outcome.mjs';

// ---------------------------------------------------------------------------
// Opcode dispatch tables
// ---------------------------------------------------------------------------
describe('opcode dispatch tables', () => {
    it('is a non-empty array', () => {
        expect(TTMDispatch.length).toBeGreaterThan(0);
        expect(ADSDispatch.length).toBeGreaterThan(0);
    });

    it('every entry has an opcode (number) and a callback (function)', () => {
        for (const entry of [...TTMDispatch, ...ADSDispatch]) {
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
        const entry = TTMDispatch.find(e => e.opcode === 0x1200);
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
    it('sets gotoRestart=true so runScript restarts from 0 on the next call', () => {
        const gotoEntry = TTMDispatch.find(e => e.opcode === 0x1200);
        const mockState = { reentry: 42, gotoRestart: false, continue: true, runs: 0 };
        gotoEntry.callback(mockState, 7);
        expect(mockState.gotoRestart).toBe(true);
        // reentry is NOT changed by the callback — runScript handles the reset at call start
        expect(mockState.reentry).toBe(42);
    });

    it('sets continue=false so execution pauses until the next frame', () => {
        const gotoEntry = TTMDispatch.find(e => e.opcode === 0x1200);
        const mockState = { reentry: 0, gotoRestart: false, continue: true, runs: 0 };
        gotoEntry.callback(mockState, 5);
        expect(mockState.continue).toBe(false);
    });

    it('leaves loop accounting to the interpreter outcome', () => {
        const gotoEntry = TTMDispatch.find(e => e.opcode === 0x1200);
        const mockState = { reentry: 0, gotoRestart: false, continue: true, runs: 0 };
        gotoEntry.callback(mockState, 99);
        expect(mockState.runs).toBe(0);
        expect(mockState.gotoRestart).toBe(true);
    });

    it('runScript: clears gotoRestart and resets reentry to 0 at the top of the next call', () => {
        // Simulate state AFTER a GOTO fired: gotoRestart=true, reentry=last_idx, continue=false
        const mockState = {
            reentry: 2,       // index GOTO was at (will be overwritten to 0)
            reentryNow: 2,
            jumpTo: undefined,
            gotoRestart: true,
            continue: false,  // GOTO set this; runScript shouldn't block due to it
            lastCommand: false,
            runs: 1,
            played: false,
            type: 'TTM',
        };
        // 3-command script; after reset reentry=0 the for-loop runs cmd0 (PURGE = no-op) then
        // hits cmd1 (an unknown opcode — skipped), then cmd2 (PURGE again as last cmd → end-of-script).
        const script = [
            { opcode: 0x0110, params: [], line: 'PURGE' },   // 0 — known, runs
            { opcode: 0x9999, params: [], line: 'UNK' },     // 1 — unknown, skipped
            { opcode: 0x0110, params: [], line: 'PURGE' },   // 2 — known, runs (last → end-of-script)
        ];
        runScript(mockState, script, false);
        // gotoRestart was cleared; script ran from 0 to end
        expect(mockState.gotoRestart).toBe(false);
        expect(mockState.played).toBe(true);  // end-of-script fires after gotoRestart is consumed
    });

    it('runScript: GOTO as last command does not trigger end-of-script on the same frame', () => {
        // Script: [PURGE, GOTO], GOTO is at index 1 (length-1).
        // GOTO fires gotoRestart=true; end-of-script must NOT fire this frame.
        let goFired = false;
        const gotoEntry = TTMDispatch.find(e => e.opcode === 0x1200);
        const mockState = {
            reentry: 0,
            reentryNow: 0,
            jumpTo: undefined,
            gotoRestart: false,
            continue: true,
            lastCommand: false,
            runs: 0,
            played: false,
            type: 'TTM',
        };
        // We'll use a real script with the actual GOTO opcode so the dispatch runs it.
        const script = [
            { opcode: 0x0110, params: [], line: 'PURGE' },    // 0
            { opcode: 0x1200, params: [7], line: 'GOTO 7' },  // 1 — last cmd
        ];
        const outcome = runScript(mockState, script, false);
        expect(mockState.played).toBe(false);   // end-of-script suppressed
        expect(mockState.gotoRestart).toBe(true);  // deferred restart flagged
        expect(mockState.runs).toBe(1);         // GOTO incremented runs
        expect(outcome.status).toBe(ExecutionStatus.LOOPED);
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

    it('returns a completed outcome immediately when script is undefined', () => {
        const mockState = { reentry: 0, continue: true };
        expect(runScript(mockState, undefined, false)).toMatchObject({
            status: ExecutionStatus.COMPLETED,
            reason: 'no-script',
        });
    });

    it('returns a completed outcome immediately when state.reentry is -1', () => {
        const mockState = { reentry: -1, continue: true };
        const script = [{ opcode: 0x0110, params: [], line: 'PURGE' }];
        expect(runScript(mockState, script, false)).toMatchObject({
            status: ExecutionStatus.COMPLETED,
            reason: 'no-script',
        });
    });

    it('completed scene (played=true) does not re-run after end-of-script fires', () => {
        // After end-of-script: played=true, reentry reset to 0. If called again (simulating
        // the completed-scene bug), the script would run from scratch and runs would increment.
        // The fix lives in process.mjs (skip lifecycle=completed), but we verify that a
        // state where played=true and reentry=0 WILL re-run if called — confirming the
        // process.mjs guard is the correct place to stop it.
        const mockState = {
            reentry: 0,
            reentryNow: 0,
            jumpTo: undefined,
            gotoRestart: false,
            continue: true,
            lastCommand: false,
            runs: 1,     // already ran once
            played: true, // already completed
            type: 'TTM',
        };
        const script = [{ opcode: 0x0110, params: [], line: 'PURGE' }];
        runScript(mockState, script, false);
        // runs incremented again — proves re-run happened; process.mjs MUST guard against this
        expect(mockState.runs).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// UPDATE / SET_DELAY timing
// ---------------------------------------------------------------------------
describe('TTM frame timing', () => {
    const update = TTMDispatch.find(e => e.opcode === 0x0ff0);
    const setDelay = TTMDispatch.find(e => e.opcode === 0x1020);

    it('keeps SET_DELAY in logical DGDS ticks', () => {
        const state = { delay: 0 };
        setDelay.callback(state, 7);
        expect(state.delay).toBe(7);
    });

    it('emits the persistent authored delay at each UPDATE boundary', () => {
        const state = { continue: true, delay: 3, frameReady: false };

        update.callback(state);
        expect(state.continue).toBe(false);
        expect(state.frameBoundary).toMatchObject({
            type: 'dgds-frame-boundary',
            delayTicks: 3,
        });

        state.frameReady = true;
        update.callback(state);
        expect(state).toMatchObject({ continue: true, delay: 3, frameReady: false });

        update.callback(state);
        expect(state.frameBoundary.delayTicks).toBe(3);
    });

    it('keeps zero-delay UPDATE faithful and leaves the browser floor to compatibility', () => {
        const state = { continue: true, delay: 0, frameReady: false };
        update.callback(state);
        expect(state.continue).toBe(false);
        expect(state.frameBoundary.delayTicks).toBe(0);

        state.frameReady = true;
        update.callback(state);
        expect(state).toMatchObject({ continue: true, frameReady: false });
    });

    it('returns the authored frame boundary as a structured execution outcome', () => {
        const state = {
            type: 'TTM',
            sceneIdx: 5,
            tagId: 3,
            reentry: 0,
            continue: true,
            delay: 9,
            frameReady: false,
            gotoRestart: false,
            lastCommand: false,
            runs: 0,
            played: false,
        };
        const script = [{ opcode: 0x0ff0, params: [] }];

        expect(runScript(state, script)).toMatchObject({
            status: 'yielded',
            reason: 'frame-boundary',
            frameBoundary: {
                type: 'dgds-frame-boundary',
                delayTicks: 9,
            },
        });

        state.frameReady = true;
        expect(runScript(state, script)).toMatchObject({ status: 'completed' });
    });

    it('does not consult the browser wall clock', () => {
        const dateSpy = vi.spyOn(Date, 'now');
        const state = { continue: true, delay: 1, frameReady: false };
        update.callback(state);
        update.callback(state);
        expect(dateSpy).not.toHaveBeenCalled();
        dateSpy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// SET_TIMER handler (opcode 0x2020: random sleep)
// ---------------------------------------------------------------------------
describe('SET_TIMER handler', () => {
    const entry = TTMDispatch.find(e => e.opcode === 0x2020);

    it('selects an inclusive deterministic tick count from the supplied range', () => {
        const state = { timer: 0, random: () => 0.5 };
        entry.callback(state, 3, 5);
        expect(state.timer).toBe(4);
        expect(state.hasTimer).toBe(true);
    });

    it('accepts reversed bounds', () => {
        const state = { timer: 0, random: () => 0 };
        entry.callback(state, 5, 3);
        expect(state.timer).toBe(3);
    });
});

describe('RANDOM_END handler', () => {
    const entry = ADSDispatch.find(e => e.opcode === 0x30ff);

    it('uses injected randomness when selecting an ADS scene', () => {
        const state = {
            randomize: true,
            random: () => 0.99,
            scenes: [],
            addScenes: [],
            scenesRandom: [
                { sceneIdx: 1, tagId: 10, retriesDelay: 0, unk: 1 },
                { sceneIdx: 2, tagId: 20, retriesDelay: 3, unk: 4 },
            ],
        };

        entry.callback(state);

        expect(state.randomize).toBe(false);
        expect(state.addScenes).toEqual([
            { sceneIdx: 2, tagId: 20, retriesDelay: 3, unk: 4 },
        ]);
    });
});

// ---------------------------------------------------------------------------
// IF_NOT_PLAYED handler
// ---------------------------------------------------------------------------
describe('IF_NOT_PLAYED handler', () => {
    const entry = ADSDispatch.find(e => e.opcode === 0x1330);

    const makeState = (played, script) => ({
        playedHistory: new Set(played),
        scenes: [],
        data: { scenes: [{ script }] },
        currentScene: 0,
        reentryNow: 0,
        jumpTo: undefined,
    });

    it('does not set jumpTo when scene is NOT in playedHistory (execute block)', () => {
        const script = [
            { opcode: 0x1330, params: [1, 7] },
            { opcode: 0x2005, params: [] },
            { opcode: 0xfff0, params: [] },
        ];
        const state = makeState([], script);
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBeUndefined();
    });

    it('sets jumpTo to endIfIdx+1 when scene IS in playedHistory (skip block)', () => {
        const script = [
            { opcode: 0x1330, params: [1, 7] },  // index 0: IF_NOT_PLAYED
            { opcode: 0x2005, params: [] },       // index 1: inside block
            { opcode: 0xfff0, params: [] },       // index 2: END_IF
            { opcode: 0x2005, params: [] },       // index 3: after block
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
            { opcode: 0x2005, params: [] },       // index 1: inside block
            { opcode: 0xfff0, params: [] },       // index 2: END_IF
            { opcode: 0x2005, params: [] },       // index 3: after block
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
            { opcode: 0x2005, params: [] },       // index 1: inside block
            { opcode: 0xfff0, params: [] },       // index 2: END_IF
            { opcode: 0x2005, params: [] },       // index 3: after block
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
// IF_PLAYED handler
// ---------------------------------------------------------------------------
describe('IF_PLAYED handler', () => {
    const entry = ADSDispatch.find(e => e.opcode === 0x1350);
    const orEntry = ADSDispatch.find(e => e.opcode === 0x1430);

    // Minimal script with IF_PLAYED at index 0, body at 1, END_IF at 2, after at 3.
    const flatScript = [
        { opcode: 0x1350, params: [1, 7] },  // 0: IF_PLAYED
        { opcode: 0x2005, params: [] },       // 1: ADD_SCENE (body)
        { opcode: 0xfff0, params: [] },       // 2: END_IF
        { opcode: 0x1510, params: [] },       // 3: PLAY_SCENE (after)
    ];

    const makeState = (scenes = [], history = [], script = flatScript) => ({
        continue: true,
        scenes,
        playedHistory: new Set(history),
        removeScenes: [],
        orMode: false,
        orChainPassed: false,
        data: { scenes: [{ script }] },
        currentScene: 0,
        reentryNow: 0,
        jumpTo: undefined,
    });

    it('blocks (continue=false) when scene is in scenes[] but not yet played', () => {
        const state = makeState([{ sceneIdx: 1, tagId: 7, lifecycle: 'active', state: { played: false, timer: 0 } }]);
        entry.callback(state, 1, 7);
        expect(state.continue).toBe(false);
        expect(state.jumpTo).toBeUndefined();
    });

    it('passes (continue=true) when scene is in scenes[] and played=true', () => {
        const state = makeState([{ sceneIdx: 1, tagId: 7, lifecycle: 'completed', state: { played: true, timer: 0 } }]);
        entry.callback(state, 1, 7);
        expect(state.continue).toBe(true);
        expect(state.removeScenes).toEqual([{ sceneIdx: 1, tagId: 7 }]);
    });

    it('passes via playedHistory when scene was cleared by END (cross-scene check)', () => {
        const state = makeState([], ['1:7']); // scenes[] empty, but history has it
        entry.callback(state, 1, 7);
        expect(state.continue).toBe(true);
        expect(state.jumpTo).toBeUndefined(); // no skip needed — body should run
    });

    it('skips block when scene was never added (not in scenes or history)', () => {
        const state = makeState([], []);
        entry.callback(state, 1, 7);
        expect(state.continue).toBe(true);
        expect(state.jumpTo).toBe(3); // jump past END_IF at index 2 → index 3
    });

    it('does NOT skip when never-added but OR follows (chain continues)', () => {
        // Script: IF_PLAYED(1:7) OR IF_PLAYED(1:8) body END_IF
        const script = [
            { opcode: 0x1350, params: [1, 7] },  // 0: IF_PLAYED 1:7 (never added)
            { opcode: 0x1430, params: [] },       // 1: OR ← nextOpcode, don't skip yet
            { opcode: 0x1350, params: [1, 8] },  // 2: IF_PLAYED 1:8
            { opcode: 0x2005, params: [] },       // 3: body
            { opcode: 0xfff0, params: [] },       // 4: END_IF
        ];
        const state = makeState([], [], script);
        entry.callback(state, 1, 7);
        expect(state.continue).toBe(true);
        expect(state.jumpTo).toBeUndefined(); // chain must continue
    });

    it('OR chain: once one condition passes, subsequent IF_PLAYEDs pass through', () => {
        // Scenario: 1:8 played → OR fires → IF_PLAYED 1:7 (never added) should pass through.
        const script = [
            { opcode: 0x1350, params: [1, 8] },  // 0: IF_PLAYED 1:8 (played) → orChainPassed=true
            { opcode: 0x1430, params: [] },       // 1: OR
            { opcode: 0x1350, params: [1, 7] },  // 2: IF_PLAYED 1:7 (never added)
        ];
        const state = makeState(
            [{ sceneIdx: 1, tagId: 8, lifecycle: 'completed', state: { played: true, timer: 0 } }],
            [],
            script,
        );
        // Fire IF_PLAYED 1:8 → passes, orChainPassed=true
        state.reentryNow = 0;
        entry.callback(state, 1, 8);
        expect(state.orChainPassed).toBe(true);
        expect(state.continue).toBe(true);

        // Fire OR → sets orMode=true
        orEntry.callback(state);
        expect(state.orMode).toBe(true);

        // Fire IF_PLAYED 1:7 (never added) — should pass through because orChainPassed=true
        state.reentryNow = 2;
        entry.callback(state, 1, 7);
        expect(state.continue).toBe(true);
        expect(state.jumpTo).toBeUndefined();
    });

    it('OR chain: all conditions fail → terminal IF_PLAYED skips block', () => {
        const script = [
            { opcode: 0x1350, params: [1, 7] },  // 0: IF_PLAYED 1:7 (never added, OR follows)
            { opcode: 0x1430, params: [] },       // 1: OR
            { opcode: 0x1350, params: [1, 8] },  // 2: IF_PLAYED 1:8 (never added, nothing follows)
            { opcode: 0x2005, params: [] },       // 3: body
            { opcode: 0xfff0, params: [] },       // 4: END_IF
        ];
        const state = makeState([], [], script);

        // First: IF_PLAYED 1:7 — never added, OR at pos 1 follows → don't skip
        state.reentryNow = 0;
        entry.callback(state, 1, 7);
        expect(state.continue).toBe(true);
        expect(state.jumpTo).toBeUndefined();

        // OR fires
        orEntry.callback(state);

        // IF_PLAYED 1:8 — never added, pos 3 = ADD_SCENE (not OR) → skip to END_IF
        state.reentryNow = 2;
        entry.callback(state, 1, 8);
        expect(state.continue).toBe(true);
        expect(state.jumpTo).toBe(5); // past END_IF at 4 → index 5
    });

    it('findMatchingEndIf skips nested END_IFs correctly', () => {
        // Script: IF_PLAYED(outer) IF_PLAYED(inner) body END_IF(inner) END_IF(outer) after
        const script = [
            { opcode: 0x1350, params: [1, 7] },  // 0: outer IF_PLAYED
            { opcode: 0x1350, params: [1, 8] },  // 1: inner IF_PLAYED (inside body)
            { opcode: 0x2005, params: [] },       // 2: body
            { opcode: 0xfff0, params: [] },       // 3: END_IF (inner)
            { opcode: 0xfff0, params: [] },       // 4: END_IF (outer) ← target
            { opcode: 0x1510, params: [] },       // 5: after
        ];
        const state = makeState([], [], script);
        // Outer IF_PLAYED never added, no OR follows → skip to matching END_IF
        state.reentryNow = 0;
        entry.callback(state, 1, 7);
        expect(state.jumpTo).toBe(5); // past END_IF at 4 → index 5
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

    it('stays blocked when scenes are "running" but not yet played', () => {
        const state = {
            continue: false,
            scenes: [
                { sceneIdx: 1, tagId: 1, lifecycle: 'running', state: { played: false } },
                { sceneIdx: 1, tagId: 2, lifecycle: 'running', state: { played: false } },
            ],
            removeScenes: [], addScenes: [], playedHistory: new Set(), scenesRes: {},
        };
        entry.callback(state);
        expect(state.continue).toBe(false);
    });

    it('unblocks when all scenes have completed outcomes', () => {
        const state = {
            continue: false,
            scenes: [
                { sceneIdx: 1, tagId: 1, lifecycle: 'completed', state: { played: true } },
                { sceneIdx: 1, tagId: 2, lifecycle: 'completed', state: { played: true } },
            ],
            removeScenes: [], addScenes: [], playedHistory: new Set(), scenesRes: {},
        };
        entry.callback(state);
        expect(state.continue).toBe(true);
    });

    it('unblocks a GOTO ambient after its first loop without completing it', () => {
        const state = {
            continue: false,
            scenes: [{
                sceneIdx: 5,
                tagId: 30,
                lifecycle: 'running',
                state: { played: false, runs: 1 },
                execution: executionOutcome(ExecutionStatus.LOOPED, { sceneIdx: 5, tagId: 30 }),
            }],
            removeScenes: [], addScenes: [], playedHistory: new Set(), scenesRes: {},
        };

        entry.callback(state);

        expect(state.continue).toBe(true);
        expect(state.scenes[0].lifecycle).toBe('running');
    });

    it('still blocks an unfinished finite scene with requested retries', () => {
        const state = {
            continue: false,
            scenes: [{
                sceneIdx: 5,
                tagId: 3,
                lifecycle: 'running',
                retries: 2,
                state: { played: false, runs: 1 },
                execution: executionOutcome(ExecutionStatus.YIELDED, { sceneIdx: 5, tagId: 3 }),
            }],
            removeScenes: [], addScenes: [], playedHistory: new Set(), scenesRes: {},
        };

        entry.callback(state);

        expect(state.continue).toBe(false);
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

// ---------------------------------------------------------------------------
// Characterization tests — lock down critical cross-cutting behaviors
// ---------------------------------------------------------------------------

// Scenario A: PLAY_SCENE remove-before-add ordering
describe('PLAY_SCENE — remove-before-add ordering', () => {
    let consoleSpy;
    beforeEach(() => { consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { consoleSpy.mockRestore(); });

    it('records removed scenes in playedHistory before processing addScenes', () => {
        const entry = ADSDispatch.find(e => e.opcode === 0x1510);
        const mockState = {
            continue: true,
            playedHistory: new Set(),
            scenes: [{ sceneIdx: 1, tagId: 5, lifecycle: 'running', state: { played: true } }],
            removeScenes: [{ sceneIdx: 1, tagId: 5 }],
            // addScenes references sceneIdx=1 which is absent from scenesRes
            // → getSceneState early-returns before document.createElement
            addScenes: [{ sceneIdx: 1, tagId: 7, retriesDelay: 0 }],
            scenesRes: {},
        };
        entry.callback(mockState);
        // Remove phase ran first: scene 1:5 recorded and spliced out
        expect(mockState.playedHistory.has('1:5')).toBe(true);
        expect(mockState.removeScenes).toHaveLength(0);
        expect(mockState.scenes.find(s => s.sceneIdx === 1 && s.tagId === 5)).toBeUndefined();
        // addScenes phase ran but found no TTM data, so nothing added
        expect(mockState.addScenes).toHaveLength(0);
    });
});

// Scenario B & C: END batch-clear semantics
describe('END — batch-clear semantics', () => {
    it('clears all scenes and records each in playedHistory when lastCommand=true', () => {
        const entry = ADSDispatch.find(e => e.opcode === 0xffff);
        const mockState = {
            continue: true,
            lastCommand: true,
            scenes: [{ sceneIdx: 1, tagId: 5, state: { played: true } }],
            playedHistory: new Set(),
        };
        entry.callback(mockState);
        expect(mockState.scenes).toHaveLength(0);
        expect(mockState.playedHistory.has('1:5')).toBe(true);
        expect(mockState.continue).toBe(true);
    });

    it('clears GOTO-looping scenes (played=false) when lastCommand=true', () => {
        // Regression: GOTO-looping scenes never set played=true, so the old
        // `scene !== undefined` guard skipped the batch-clear, leaving them in
        // state.scenes to ghost over the next ADS gag.
        const entry = ADSDispatch.find(e => e.opcode === 0xffff);
        const mockState = {
            continue: true,
            lastCommand: true,
            scenes: [{ sceneIdx: 6, tagId: 28, state: { played: false } }],  // frenzied dance (GOTO loop)
            playedHistory: new Set(),
        };
        entry.callback(mockState);
        expect(mockState.scenes).toHaveLength(0);
        expect(mockState.playedHistory.has('6:28')).toBe(true);
        expect(mockState.continue).toBe(true);
    });

    it('does NOT clear scenes when lastCommand=false', () => {
        const entry = ADSDispatch.find(e => e.opcode === 0xffff);
        const mockState = {
            continue: true,
            lastCommand: false,
            scenes: [{ sceneIdx: 1, tagId: 5, state: { played: true } }],
            playedHistory: new Set(),
        };
        entry.callback(mockState);
        expect(mockState.scenes).toHaveLength(1);
        expect(mockState.playedHistory.size).toBe(0);
    });
});

// Scenario D: runScript TTM completion sets played=true, runs=1
describe('runScript — TTM script completion', () => {
    let consoleSpy;
    beforeEach(() => { consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { consoleSpy.mockRestore(); });

    it('sets played=true and runs=1 after completing a single-command TTM script', () => {
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
        runScript(mockState, script, false);
        expect(mockState.played).toBe(true);
        expect(mockState.runs).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// PLAY_SCENE_2: combined ADD_SCENE + PLAY_SCENE
// ---------------------------------------------------------------------------
describe('PLAY_SCENE_2', () => {
    let consoleSpy;
    beforeEach(() => { consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { consoleSpy.mockRestore(); });

    it('enqueues the scene and blocks on active scenes (combines ADD_SCENE + PLAY_SCENE)', () => {
        const entry = ADSDispatch.find(e => e.opcode === 0x1520);
        expect(entry).toBeDefined();

        const state = {
            continue: true,
            randomize: false,
            addScenes: [],
            removeScenes: [],
            scenes: [],
            scenesRes: {},          // no TTM data → getSceneState returns undefined
            playedHistory: new Set(),
        };

        // Params mirror binary: embedded ADD_SCENE opcode (0x2005 = 8197), sceneIdx, tagId, retriesDelay, unk
        entry.callback(state, 0x2005, 4, 22, 0, 1);

        // addScenes was flushed (PLAY_SCENE ran), no active scenes → unblocked
        expect(state.addScenes).toHaveLength(0);
        // removeScenes also flushed
        expect(state.removeScenes).toHaveLength(0);
        // Since scenesRes has no TTM data, getSceneState returned undefined → scenes still empty
        expect(state.scenes).toHaveLength(0);
        // continue is true: no active (lifecycle='active') scenes to block on
        expect(state.continue).toBe(true);
    });
});
