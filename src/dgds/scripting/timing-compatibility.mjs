import { isFrameBoundary } from './frame-timing.mjs';
import { DGDS_TICK_MS, WM_TIMER_MS } from './timing.mjs';

const DEFAULT_TIMING_PROFILE = 'faithful-browser';
const ORIGINAL_GAME_TICK_MS = 16;

// The authored SET_DELAY operand is a count of the original engine's 16 ms game
// clock (DAT_1068_2e72, advanced by the FUN_1008_16ce timer). The runtime keeps
// it in that unit: a frame's deadline is `now + delay` on that clock, and the
// clock is only read at each ~55 ms present (see gameClockAtPresent below).
const identityFrameCadence = (ticks) => ticks;

/**
 * Maps faithful DGDS timing into host scheduler timing.
 *
 * Named patches are intentionally data transformations, not opcode branches.
 * The default profile keeps the authored delay on the original 16 ms clock;
 * frame advancement itself is gated to the ~55 ms WM_TIMER in the runtime (see
 * WM_TIMER_MS), which is what makes small/zero delays play at their true ~18 fps
 * instead of 50 fps.
 */
export const createTimingCompatibility = ({
    profile = DEFAULT_TIMING_PROFILE,
    patches = [{ name: 'game-clock-frame-hold', map: identityFrameCadence }],
} = {}) => ({
    profile,
    patchNames: patches.map((patch) => patch.name),

    // Negative ADS ADD counts are deadlines on the same original 16 ms game
    // clock. Round up: a deadline must not expire before its authored time.
    mapTimeLimit(authoredTicks) {
        return Math.max(1, Math.ceil((authoredTicks * ORIGINAL_GAME_TICK_MS) / DGDS_TICK_MS));
    },

    // Recovers the original engine's ~55 ms WM_TIMER present cadence from the host's
    // variable per-tick clock. The canonical engine advances at most one animation
    // frame per present; this host-timing hook owns HOW the ~55 ms boundary is
    // recovered by accumulating fine-tick deltas. Returns whether this tick is a
    // present and the carried accumulator. `periodMs` overrides the default (unit
    // tests pass the fine-tick period to run per-tick). Priming the accumulator to a
    // full period makes the very first tick a present so the first frame shows at once.
    advancePresentCadence(accumulatorMs, frameDelta, periodMs = WM_TIMER_MS) {
        const next = (accumulatorMs === undefined ? periodMs : accumulatorMs) + frameDelta;
        const isPresent = next >= periodMs;
        return { isPresent, accumulatorMs: isPresent ? next - periodMs : next };
    },

    // The original's 16 ms game clock as the TTM controller sees it at present
    // number `presentIndex` (FUN_1048_196e reads DAT_1068_2e72 once per ~55 ms
    // tick). The clock is read at the present's nominal time, `presentIndex *
    // periodMs`, not at the 20 ms fine tick that carries the present: on the fine
    // grid two presents are 100 or 120 ms apart, which rounds a 112 ms (delay 7)
    // hold up to three presents far more often than the original's 110 ms pair
    // (6.875 units, so about 7 in 8 pairs pass a delay of 7).
    gameClockAtPresent(presentIndex, periodMs = WM_TIMER_MS) {
        return Math.floor((presentIndex * periodMs) / ORIGINAL_GAME_TICK_MS);
    },

    mapFrameBoundary(boundary, context = {}) {
        if (!isFrameBoundary(boundary)) {
            throw new TypeError('Expected a faithful DGDS frame boundary');
        }

        const holdTicks = patches.reduce(
            (ticks, patch) => patch.map(ticks, { boundary, context }),
            boundary.delayTicks,
        );

        return Object.freeze({
            authoredDelayTicks: boundary.delayTicks,
            // The hold in original 16 ms game-clock units: the frame's deadline is
            // the present's game clock plus this.
            holdTicks: Math.max(0, Math.round(holdTicks || 0)),
            profile,
            patches: patches.map((patch) => patch.name),
        });
    },
});
