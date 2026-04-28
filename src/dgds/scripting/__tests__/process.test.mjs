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
        // A single-command ADS script using PURGE (0x0110, no-op callback).
        // When runScript reaches the final command with main=true it must set
        // state.played=true and advance state.currentScene.
        const mockState = {
            reentry: 0,
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
