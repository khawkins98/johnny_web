import { describe, expect, it } from 'vitest';
import { DgdsRuntime } from '../runtime.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { DGDS_TICK_MS, WM_TIMER_MS } from '../timing.mjs';
import { getSceneState } from '../scene-factory.mjs';

// Frame holds against the binary's rule (FUN_1048_196e, FUN_1048_1acb):
//
//   - `now` is the 16 ms game clock (DAT_1068_2e72), read at each ~55 ms present.
//   - When a frame's hold elapses at a present, the next frame starts and its
//     deadline is `now + delay`. The hold elapses at the first later present
//     with `now >= deadline`.
//   - A SET_DELAY that changes the thread's delay sets the deadline at the
//     present the frame is first drawn, so that frame is held one present longer.
//   - Delay 0 advances at every present.
//
// Measured holds in the original (METHODOLOGY "Trace sample cadence"): delay 7
// lasts 2 to 3 samples (mean 124 ms), 8 lasts 3, 12 lasts 4, 16 lasts 5.

const script = (delay, frames, extra = []) => [
    { opcode: 0x1020, params: [delay] },
    ...Array.from({ length: frames }, () => ({ opcode: 0x0ff0, params: [] })),
    ...extra,
];

// Runs one TTM thread and returns, per frame, the number of presents and fine
// ticks it was held (the gap to the next frame's UPDATE).
const measureHolds = (ttmScript, { wmTimerMs, maxTicks = 4000 } = {}) => {
    const ttm = { tags: [{ id: 1, description: 'hold' }], scenes: [{ tagId: 0, script: [] }, { tagId: 1, script: ttmScript }] };
    const runtime = new DgdsRuntime({
        type: 'ADS',
        data: { name: 'test', resources: [{ id: 1, name: 'HOLD.TTM' }], scenes: [{ tagId: { id: 1, description: 'x' }, script: [] }] },
        backgroundId: 0,
        random: () => 0,
        timingCompatibility: createTimingCompatibility(),
        surfaceFactory: () => ({ clear() {} }),
        resourceProvider: { resolve: () => ttm },
        ...(wmTimerMs ? { wmTimerMs } : {}),
    });
    const frames = [];
    runtime.state.trace = {
        record(type, data) {
            if (type !== 'frame-timing-map') return;
            frames.push({ tick: data.tick, present: runtime.state.presentIndex, delay: data.authoredDelayTicks });
        },
    };
    const child = getSceneState(runtime.state, 1, 1, 0, 1);
    runtime.state.scenes.push(child);
    for (let tick = 0; tick < maxTicks && child.runState !== 'finished'; tick++) runtime.tick(DGDS_TICK_MS);
    return frames.slice(0, -1).map((frame, i) => ({
        delay: frame.delay,
        presents: frames[i + 1].present - frame.present,
        ticks: frames[i + 1].tick - frame.tick,
    }));
};

const steady = (holds) => holds.slice(1);
const histogram = (values) => values.reduce((h, v) => ({ ...h, [v]: (h[v] || 0) + 1 }), {});
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

describe('frame holds on the original 16 ms game clock sampled per ~55 ms present', () => {
    it.each([
        [5, 2],
        [8, 3],
        [12, 4],
        [16, 5],
        [30, 9],
    ])('holds a delay-%i frame for %i presents every time', (delay, presents) => {
        const holds = steady(measureHolds(script(delay, 40)));
        expect(holds.length).toBeGreaterThanOrEqual(38);
        expect(histogram(holds.map((h) => h.presents))).toEqual({ [presents]: holds.length });
    });

    it('holds a delay-7 frame for two presents most of the time (112 ms on a 110 ms pair)', () => {
        const holds = steady(measureHolds(script(7, 200)));
        const hist = histogram(holds.map((h) => h.presents));
        expect(Object.keys(hist).map(Number).sort()).toEqual([2, 3]);
        const twoShare = hist[2] / holds.length;
        // 110 ms is 6.875 game units, so two presents pass a delay of 7 whenever
        // the clock phase rounds up. The phase at each frame start depends on the
        // previous hold, so the holds cycle 2,2,2,3,2,2,3: five in seven are two
        // presents and the mean is 2.29 presents (126 ms). The original measured
        // 2 to 3 samples a frame, mean 124 ms; before this rule ours was 147 ms.
        expect(twoShare).toBeGreaterThanOrEqual(0.7);
        expect(twoShare).toBeLessThanOrEqual(0.9);
        const meanMs = mean(holds.map((h) => h.ticks)) * DGDS_TICK_MS;
        expect(meanMs).toBeGreaterThanOrEqual(112);
        expect(meanMs).toBeLessThanOrEqual(130);
    });

    it('holds small delays for a single present', () => {
        for (const delay of [0, 1, 2, 3]) {
            const holds = steady(measureHolds(script(delay, 20)));
            expect(histogram(holds.map((h) => h.presents))).toEqual({ 1: holds.length });
        }
    });

    it('keeps delay 8 at about 165 ms a frame (BUILDING:7 3:82 calibration, #40)', () => {
        const holds = steady(measureHolds(script(8, 39)));
        const meanMs = mean(holds.map((h) => h.ticks)) * DGDS_TICK_MS;
        expect(meanMs).toBeGreaterThanOrEqual(160);
        expect(meanMs).toBeLessThanOrEqual(170);
    });

    it('holds the first frame after a delay change one present longer', () => {
        // SET_DELAY 8 (3 presents) then SET_DELAY 12 (4 presents): the frame that
        // changes the delay anchors its deadline at its own present and is drawn
        // again at the present its hold elapses.
        // (The last frame's hold has no successor frame, so it is not measured.)
        const holds = measureHolds([...script(8, 4), ...script(12, 5)]);
        expect(holds.map((h) => h.presents)).toEqual([4, 3, 3, 3, 5, 4, 4, 4]);
    });

    it('does not extend a zero-delay frame after a delay change', () => {
        const holds = measureHolds([...script(8, 2), ...script(0, 4)]);
        expect(holds.map((h) => h.presents)).toEqual([4, 3, 1, 1, 1]);
    });

    it('samples the game clock at the nominal present time, not the 20 ms fine tick', () => {
        // Nominal present n is at n * 55 ms: floor(n * 55 / 16).
        const timing = createTimingCompatibility();
        expect([1, 2, 3, 4, 16].map((n) => timing.gameClockAtPresent(n))).toEqual([3, 6, 10, 13, 55]);
        expect(timing.gameClockAtPresent(4, WM_TIMER_MS)).toBe(13);
        expect(timing.gameClockAtPresent(4, DGDS_TICK_MS)).toBe(5);
    });

    it('with per-tick presents, a hold is the authored 16 ms delay on the 20 ms grid', () => {
        // Unit tests run the present gate per fine tick (wmTimerMs = 20): the
        // clock then advances 1.25 units a tick, so delay 8 (128 ms) holds 6 or 7
        // ticks and delay 0 holds one.
        const eight = steady(measureHolds(script(8, 20), { wmTimerMs: DGDS_TICK_MS }));
        expect(new Set(eight.map((h) => h.ticks))).toEqual(new Set([6, 7]));
        const zero = steady(measureHolds(script(0, 10), { wmTimerMs: DGDS_TICK_MS }));
        expect(histogram(zero.map((h) => h.ticks))).toEqual({ 1: zero.length });
    });
});
