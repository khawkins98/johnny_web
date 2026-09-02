import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    createFaithfulRng,
    extractFaithfulSeed,
    faithfulRandomFromArchive,
    FAITHFUL_RNG_SEED_OFFSET,
} from '../faithful-rng.mjs';
import { TTMDispatch } from '../script-runner.mjs';

// Bit-faithful port of the original binary RNG `FUN_1018_1e86` (a 56-word
// additive lagged-Fibonacci generator whose seed is baked into SCRANTIC.SCR).
//
// GROUND TRUTH: the first 64 returned words below were captured from the actual
// 16-bit binary running under a patched DOSBox-X (the trace hook logs each
// FUN_1018_1e86 return value; see tools/faithfulness-oracle/rng-port.md). The
// full stream was validated bit-for-bit over 20000 consecutive draws, across two
// independent boots (identical — the stream has no clock seed). This test bakes a
// prefix of that ground-truth stream so CI proves the port stays faithful without
// needing the emulator.
const BINARY_FIRST_64 = [
    0xea0b, 0x2ab1, 0x91b0, 0x8105, 0xa50a, 0xdb51, 0x4d01, 0xd996,
    0xa4a4, 0xc9f0, 0xaa33, 0x06af, 0x60d0, 0x1faa, 0x298d, 0x3874,
    0x2f88, 0x82c9, 0xa79e, 0xf631, 0xff1b, 0x5026, 0xe3bb, 0x7f13,
    0x174f, 0x1dd3, 0x400c, 0xbeed, 0xb2c1, 0x87d3, 0x46c1, 0x942d,
    0x59d7, 0xd5aa, 0x36aa, 0xc5f5, 0xc8d6, 0x42c4, 0x5b35, 0xd240,
    0x7c5d, 0x935e, 0x9e84, 0x9e71, 0xa997, 0x0d81, 0xad29, 0x2fb4,
    0x5628, 0xe2a6, 0x0426, 0xf199, 0x1296, 0x0944, 0xad9e, 0x7aa1,
    0x07de, 0x6abd, 0x509d, 0x33c6, 0x2cdd, 0x2212, 0xe12e, 0x336d,
];

const here = dirname(fileURLToPath(import.meta.url));
const scrPath = resolve(here, '../../../../public/data/SCRANTIC.SCR');
const scr = readFileSync(scrPath);

describe('faithful RNG seed extraction', () => {
    it('reads the baked lag indices and table from SCRANTIC.SCR @0x19ae2', () => {
        expect(FAITHFUL_RNG_SEED_OFFSET).toBe(0x19ae2);
        const seed = extractFaithfulSeed(scr);
        // i (DAT_1068_1ce4) starts at 55, j (DAT_1068_1ce2) at 24.
        expect(seed.i).toBe(55);
        expect(seed.j).toBe(24);
        expect(seed.table).toHaveLength(56);
        // First word + the two initial lag entries (little-endian in the file).
        expect(seed.table[0]).toBe(0xdd23);
        expect(seed.table[55]).toBe(0xda2d); // table[i] for the very first draw
        expect(seed.table[24]).toBe(0x0fde); // table[j] for the very first draw
        // Seed words are all non-zero (an LFG requirement).
        expect([...seed.table].every((w) => w !== 0)).toBe(true);
    });
});

describe('faithful RNG stream (validated against the binary)', () => {
    it('reproduces the binary word stream bit-for-bit from the baked seed', () => {
        const rng = createFaithfulRng(extractFaithfulSeed(scr));
        const got = Array.from({ length: BINARY_FIRST_64.length }, () => rng.nextWord());
        expect(got).toEqual(BINARY_FIRST_64);
    });

    it('first draw is table[55] + table[24] (mod 2^16)', () => {
        const rng = createFaithfulRng(extractFaithfulSeed(scr));
        expect(rng.nextWord()).toBe((0xda2d + 0x0fde) & 0xffff); // 0xea0b
    });

    it('every returned word is an unsigned 16-bit value', () => {
        const rng = createFaithfulRng(extractFaithfulSeed(scr));
        for (let n = 0; n < 4096; n++) {
            const w = rng.nextWord();
            expect(Number.isInteger(w)).toBe(true);
            expect(w).toBeGreaterThanOrEqual(0);
            expect(w).toBeLessThanOrEqual(0xffff);
        }
    });

    it('random() is a Math.random-compatible float in [0, 1)', () => {
        const rng = createFaithfulRng(extractFaithfulSeed(scr));
        for (let n = 0; n < 1000; n++) {
            const r = rng.random();
            expect(r).toBeGreaterThanOrEqual(0);
            expect(r).toBeLessThan(1);
        }
    });

    it('pick(total) reproduces the binary weighted draw abs((int16)word % total)+1', () => {
        // FUN_1048_0cda: iVar3 = abs((int16)(rng() % total)) + 1, then walk weights.
        const seed = extractFaithfulSeed(scr);
        const rngA = createFaithfulRng(seed);
        const rngB = createFaithfulRng(seed);
        const total = 15;
        for (let n = 0; n < 256; n++) {
            const raw = rngB.nextWord();
            const signed = (raw << 16) >> 16;
            const expected = Math.abs(signed % total) + 1;
            const picked = rngA.pick(total);
            expect(picked).toBe(expected);
            expect(picked).toBeGreaterThanOrEqual(1);
            expect(picked).toBeLessThanOrEqual(total);
        }
    });

    it('pick() consumes exactly one word (draw accounting preserved)', () => {
        const seed = extractFaithfulSeed(scr);
        const rngA = createFaithfulRng(seed);
        const rngB = createFaithfulRng(seed);
        rngA.pick(10);
        rngB.nextWord();
        // Both advanced one draw; next raw words must agree.
        expect(rngA.nextWord()).toBe(rngB.nextWord());
    });
});

describe('faithful RNG wiring', () => {
    it('faithfulRandomFromArchive builds the same stream as the raw path', () => {
        const a = faithfulRandomFromArchive(scr);
        const b = createFaithfulRng(extractFaithfulSeed(scr));
        for (let n = 0; n < 32; n++) expect(a.nextWord()).toBe(b.nextWord());
    });

    it('drives a real engine draw site (SET_TIMER) deterministically from the stream', () => {
        // Prove the faithful stream is actually consumed by the interpreter: when
        // injected as state.random, the TTM SET_TIMER opcode (0x2020) draws from it.
        const SET_TIMER = TTMDispatch.find((d) => d.opcode === 0x2020).callback;
        const source = faithfulRandomFromArchive(scr);
        const state = { random: source.random };

        // Mirror the draw with a parallel faithful stream to predict each timer.
        const predictor = createFaithfulRng(extractFaithfulSeed(scr));
        const low = 10;
        const high = 30;
        const range = high - low + 1;
        for (let n = 0; n < 16; n++) {
            SET_TIMER(state, low, high);
            const expected = low + Math.floor((predictor.nextWord() / 0x10000) * range);
            expect(state.timer).toBe(expected);
            expect(state.timer).toBeGreaterThanOrEqual(low);
            expect(state.timer).toBeLessThanOrEqual(high);
        }
    });
});
