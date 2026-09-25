/**
 * Unit tests for the process.mjs opcode interpreter.
 *
 * Scope: pure/synchronous aspects only — no DOM, no canvas, no rAF.
 * The TTM dispatch table and individual opcode handlers are tested by
 * exercising their callback functions directly with minimal mock state objects.
 * The ADS interpreter is covered by ads-walker.test.mjs.
 *
 * Known remaining bugs documented inline:
 *  1. GOTO no-op: the GOTO handler ignores tagId and always resets reentry to 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTMDispatch, runScript } from '../script-runner.mjs';
import { ExecutionStatus, executionOutcome } from '../execution-outcome.mjs';
import { ADSCommandType } from '../../data/scripting.mjs';

// ---------------------------------------------------------------------------
// Opcode dispatch tables
// ---------------------------------------------------------------------------
describe('opcode dispatch tables', () => {
    it('is a non-empty array', () => {
        expect(TTMDispatch.length).toBeGreaterThan(0);
    });

    it('every entry has an opcode (number) and a callback (function)', () => {
        for (const entry of TTMDispatch) {
            expect(typeof entry.opcode).toBe('number');
            expect(typeof entry.callback).toBe('function');
        }
    });

    it('TTMDispatch: opcode 0x2010 resolves to SET_FRAME1', () => {
        const entry = TTMDispatch.find((e) => e.opcode === 0x2010);
        expect(entry).toBeDefined();
        expect(entry.callback.name).toBe('SET_FRAME1');
    });

    it('TTMDispatch: opcode 0xF010 resolves to LOAD_SCREEN', () => {
        const entry = TTMDispatch.find((e) => e.opcode === 0xf010);
        expect(entry).toBeDefined();
        expect(entry.callback.name).toBe('LOAD_SCREEN');
    });

    it('GOTO entry exists at opcode 0x1200 in TTMDispatch with a valid callback', () => {
        const entry = TTMDispatch.find((e) => e.opcode === 0x1200);
        expect(entry).toBeDefined();
        expect(typeof entry.callback).toBe('function');
    });

    it('GOTO callback is named GOTO', () => {
        const entry = TTMDispatch.find((e) => e.opcode === 0x1200);
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
        const gotoEntry = TTMDispatch.find((e) => e.opcode === 0x1200);
        const mockState = { reentry: 42, gotoRestart: false, continue: true, runs: 0 };
        gotoEntry.callback(mockState, 7);
        expect(mockState.gotoRestart).toBe(true);
        // reentry is NOT changed by the callback — runScript handles the reset at call start
        expect(mockState.reentry).toBe(42);
    });

    it('sets continue=false so execution pauses until the next frame', () => {
        const gotoEntry = TTMDispatch.find((e) => e.opcode === 0x1200);
        const mockState = { reentry: 0, gotoRestart: false, continue: true, runs: 0 };
        gotoEntry.callback(mockState, 5);
        expect(mockState.continue).toBe(false);
    });

    it('leaves loop accounting to the interpreter outcome', () => {
        const gotoEntry = TTMDispatch.find((e) => e.opcode === 0x1200);
        const mockState = { reentry: 0, gotoRestart: false, continue: true, runs: 0 };
        gotoEntry.callback(mockState, 99);
        expect(mockState.runs).toBe(0);
        expect(mockState.gotoRestart).toBe(true);
    });

    it('runScript: clears gotoRestart and resets reentry to 0 at the top of the next call', () => {
        // Simulate state AFTER a GOTO fired: gotoRestart=true, reentry=last_idx, continue=false
        const mockState = {
            reentry: 2, // index GOTO was at (will be overwritten to 0)
            reentryNow: 2,
            jumpTo: undefined,
            gotoRestart: true,
            continue: false, // GOTO set this; runScript shouldn't block due to it
            lastCommand: false,
            runs: 1,
            played: false,
            type: 'TTM',
        };
        // 3-command script; after reset reentry=0 the for-loop runs cmd0 (PURGE = no-op) then
        // hits cmd1 (an unknown opcode — skipped), then cmd2 (PURGE again as last cmd → end-of-script).
        const script = [
            { opcode: 0x0110, params: [], line: 'PURGE' }, // 0 — known, runs
            { opcode: 0x9999, params: [], line: 'UNK' }, // 1 — unknown, skipped
            { opcode: 0x0110, params: [], line: 'PURGE' }, // 2 — known, runs (last → end-of-script)
        ];
        runScript(mockState, script);
        // gotoRestart was cleared; script ran from 0 to end
        expect(mockState.gotoRestart).toBe(false);
        expect(mockState.played).toBe(true); // end-of-script fires after gotoRestart is consumed
    });

    it('runScript: GOTO as last command does not trigger end-of-script on the same frame', () => {
        // Script: [PURGE, GOTO], GOTO is at index 1 (length-1).
        // GOTO fires gotoRestart=true; end-of-script must NOT fire this frame.
        let goFired = false;
        const gotoEntry = TTMDispatch.find((e) => e.opcode === 0x1200);
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
            { opcode: 0x0110, params: [], line: 'PURGE' }, // 0
            { opcode: 0x1200, params: [7], line: 'GOTO 7' }, // 1 — last cmd
        ];
        const outcome = runScript(mockState, script);
        expect(mockState.played).toBe(false); // end-of-script suppressed
        expect(mockState.gotoRestart).toBe(true); // deferred restart flagged
        expect(mockState.runs).toBe(1); // GOTO incremented runs
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

    it('does not increment currentScene on end-of-script (advancing currentScene is the runtime controller\'s job)', () => {
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
        runScript(mockState, script);
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
        runScript(mockState, script);
        expect(mockState.runs).toBe(1);
    });

    it('returns a completed outcome immediately when script is undefined', () => {
        const mockState = { reentry: 0, continue: true };
        expect(runScript(mockState, undefined)).toMatchObject({
            status: ExecutionStatus.COMPLETED,
            reason: 'no-script',
        });
    });

    it('returns a completed outcome immediately when state.reentry is -1', () => {
        const mockState = { reentry: -1, continue: true };
        const script = [{ opcode: 0x0110, params: [], line: 'PURGE' }];
        expect(runScript(mockState, script)).toMatchObject({
            status: ExecutionStatus.COMPLETED,
            reason: 'no-script',
        });
    });

    it('completed scene (played=true) does not re-run after end-of-script fires', () => {
        // After end-of-script: played=true, reentry reset to 0. If called again (simulating
        // the completed-scene bug), the script would run from scratch and runs would increment.
        // The runtime's finished run state prevents another execution pass; verify that a
        // state where played=true and reentry=0 WILL re-run if called — confirming the
        // process.mjs guard is the correct place to stop it.
        const mockState = {
            reentry: 0,
            reentryNow: 0,
            jumpTo: undefined,
            gotoRestart: false,
            continue: true,
            lastCommand: false,
            runs: 1, // already ran once
            played: true, // already completed
            type: 'TTM',
        };
        const script = [{ opcode: 0x0110, params: [], line: 'PURGE' }];
        runScript(mockState, script);
        // runs incremented again — proves re-run happened; process.mjs MUST guard against this
        expect(mockState.runs).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// UPDATE / SET_DELAY timing
// ---------------------------------------------------------------------------
describe('TTM frame timing', () => {
    const update = TTMDispatch.find((e) => e.opcode === 0x0ff0);
    const setDelay = TTMDispatch.find((e) => e.opcode === 0x1020);

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

    it('PURGE ends the sequence at its frame boundary: later ops never run', () => {
        const state = {
            type: 'TTM',
            reentry: 0,
            continue: true,
            delay: 4,
            frameReady: false,
            gotoRestart: false,
            lastCommand: false,
            runs: 0,
            played: false,
        };
        // PURGE; UPDATE; SET_DELAY 99; UPDATE (like MJBATH 24's post-PURGE frames).
        const script = [
            { opcode: 0x0110, params: [] },
            { opcode: 0x0ff0, params: [] },
            { opcode: 0x1020, params: [99] },
            { opcode: 0x0ff0, params: [] },
        ];
        expect(runScript(state, script)).toMatchObject({ status: 'yielded', frameBoundary: { delayTicks: 4 } });
        state.frameReady = true; // the host's hold elapsed
        expect(runScript(state, script)).toMatchObject({ status: 'completed', reason: 'purge' });
        expect(state).toMatchObject({ delay: 4, played: true, runs: 1, reentry: 0, continue: true, endOfSequence: false });
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

describe('PLAY_SAMPLE tracing', () => {
    const playSample = TTMDispatch.find((e) => e.opcode === 0xc050);

    it('emits a logical operation without changing script scheduling state', () => {
        const record = vi.fn();
        const audioOperations = [];
        const state = {
            tick: 824,
            sceneIdx: 5,
            tagId: 19,
            continue: true,
            delay: 120,
            trace: { record },
            audioOperations,
        };

        playSample.callback(state, 6);

        expect(audioOperations).toEqual([
            {
                type: 'play-sample',
                tick: 824,
                sceneIdx: 5,
                tagId: 19,
                sample: 6,
            },
        ]);
        expect(record).toHaveBeenCalledWith(
            'audio-sample',
            expect.objectContaining({
                action: 'requested',
                sample: 6,
            }),
        );
        expect(state).toMatchObject({ continue: true, delay: 120 });
    });

    it('treats an omitted operation collector as non-blocking', () => {
        const state = {
            tick: 10,
            sceneIdx: 5,
            tagId: 19,
            continue: true,
            delay: 7,
        };

        expect(() => playSample.callback(state, 6)).not.toThrow();
        expect(state).toMatchObject({ continue: true, delay: 7 });
    });
});

describe('named resource provider opcodes', () => {
    it('LOAD_IMAGE resolves a game alias through the injected provider', () => {
        const loadImage = TTMDispatch.find((entry) => entry.opcode === 0xf020);
        const decoded = { name: 'FIRE1.BMP', images: [] };
        const resolve = vi.fn(() => decoded);
        const state = {
            slot: 2,
            res: [],
            game: {
                resources: {
                    aliases: { 'FLAME.BMP': 'FIRE1.BMP' },
                },
            },
            resourceProvider: { resolve },
        };

        loadImage.callback(state, 'FLAME.BMP');

        expect(resolve).toHaveBeenCalledWith('FIRE1.BMP');
        expect(state.res[2]).toBe(decoded);
    });

    it('LOAD_IMAGE leaves the current slot intact when a name is unavailable', () => {
        const loadImage = TTMDispatch.find((entry) => entry.opcode === 0xf020);
        const existing = { name: 'EXISTING.BMP' };
        const state = {
            slot: 0,
            res: [existing],
            resourceProvider: { resolve: () => undefined },
        };

        loadImage.callback(state, 'MISSING.BMP');

        expect(state.res[0]).toBe(existing);
    });
});

// ---------------------------------------------------------------------------
// SET_TIMER handler (opcode 0x2020: random sleep)
// ---------------------------------------------------------------------------
describe('SET_TIMER handler', () => {
    const entry = TTMDispatch.find((e) => e.opcode === 0x2020);

    it('selects a deterministic tick count with an exclusive upper bound', () => {
        const state = { delay: 0, random: () => 0.5 };
        entry.callback(state, 3, 5);
        expect(state.delay).toBe(4);
    });

    it('accepts reversed bounds', () => {
        const state = { delay: 0, random: () => 0 };
        entry.callback(state, 5, 3);
        expect(state.delay).toBe(3);
    });

    it('maps the traced raw word with one faithful modulo draw', () => {
        const calls = [];
        const state = {
            delay: 0,
            random: () => { throw new Error('fallback random used'); },
            storyRandom: {
                modulo: (range, site) => {
                    calls.push({ range, site });
                    return 0x1f2f % range;
                },
            },
        };
        entry.callback(state, 60, 180);
        expect(state.delay).toBe(123);
        expect(calls).toEqual([{ range: 120, site: 'ttm-random-delay' }]);
    });

    it('does not draw for a zero-width defensive range', () => {
        const state = {
            delay: 0,
            random: () => { throw new Error('fallback random used'); },
            storyRandom: { modulo: () => { throw new Error('equal bounds consumed RNG'); } },
        };
        entry.callback(state, 7, 7);
        expect(state.delay).toBe(7);
    });
});
// Scenario D: runScript TTM completion sets played=true, runs=1
describe('runScript — TTM script completion', () => {
    let consoleSpy;
    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
        consoleSpy.mockRestore();
    });

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
        runScript(mockState, script);
        expect(mockState.played).toBe(true);
        expect(mockState.runs).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// ADS WHILE boundary decoding
// ---------------------------------------------------------------------------
describe('ADS WHILE boundaries', () => {
    it('decodes 0x1520 independently from the following ADD_SCENE opcode', () => {
        expect(ADSCommandType.find((entry) => entry.opcode === 0x1520)).toMatchObject({
            command: 'END_WHILE',
            paramSize: 0,
        });
        expect(ADSCommandType.find((entry) => entry.opcode === 0x2005)).toMatchObject({
            command: 'ADD_SCENE',
            paramSize: 4,
        });
        expect(ADSCommandType.find((entry) => entry.opcode === 0xf010)).toMatchObject({
            command: 'FADE_OUT',
            paramSize: 1,
        });
    });
});
