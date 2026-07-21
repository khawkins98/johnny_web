import { describe, expect, it } from 'vitest';
import { DGDS_TICK_MS, MAX_CATCH_UP_TICKS, createFixedStepClock } from '../timing.mjs';

describe('browser-to-DGDS timing adapter', () => {
    it('uses the recovered 20 ms host timer unit', () => {
        expect(DGDS_TICK_MS).toBe(20);
    });

    it('runs one engine tick on the first browser frame', () => {
        const clock = createFixedStepClock();
        expect(clock.consume(100)).toBe(1);
    });

    it('accumulates fractional browser frames deterministically', () => {
        const clock = createFixedStepClock();
        clock.consume(0);

        expect(clock.consume(DGDS_TICK_MS / 2)).toBe(0);
        expect(clock.consume(DGDS_TICK_MS)).toBe(1);
    });

    it('can execute multiple ticks after a late browser frame', () => {
        const clock = createFixedStepClock();
        clock.consume(0);

        expect(clock.consume(DGDS_TICK_MS * 3)).toBe(3);
    });

    it('bounds catch-up work and discards stale whole ticks', () => {
        const clock = createFixedStepClock();
        clock.consume(0);

        expect(clock.consume(DGDS_TICK_MS * 100)).toBe(MAX_CATCH_UP_TICKS);
        expect(clock.consume(DGDS_TICK_MS * 101)).toBe(1);
    });

    it('ignores invalid timestamps', () => {
        const clock = createFixedStepClock();
        expect(clock.consume(undefined)).toBe(0);
    });
});
