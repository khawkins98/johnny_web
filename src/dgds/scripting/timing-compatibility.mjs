import { isFrameBoundary } from './frame-timing.mjs';

const DEFAULT_TIMING_PROFILE = 'faithful-browser';

// The authored SET_DELAY operand is in the original engine's ~16 ms game-tick
// unit; the runtime counts down in 20 ms fine ticks. Rescale 16 ms -> 20 ms.
// A floor of 1 fine tick is kept below so every frame passes through the runtime's
// waitTicks countdown (which arms `frameReady`, letting the interpreter advance
// past the UPDATE). The real minimum on-screen time comes from the runtime's 50 ms
// WM_TIMER present gate, not from this delay value.
const wmTimerFrameCadence = (ticks) => Math.round((ticks * 16) / 20);

/**
 * Maps faithful DGDS timing into host scheduler timing.
 *
 * Named patches are intentionally data transformations, not opcode branches.
 * The default profile rescales the authored 16 ms-unit delay into the runtime's
 * 20 ms fine tick; frame advancement itself is gated to the 50 ms WM_TIMER in the
 * runtime (see WM_TIMER_MS), which is what makes small/zero delays play at their
 * true ~20 fps instead of 50 fps.
 */
export const createTimingCompatibility = ({
    profile = DEFAULT_TIMING_PROFILE,
    patches = [{ name: 'wm-timer-frame-cadence', map: wmTimerFrameCadence }],
} = {}) => ({
    profile,
    patchNames: patches.map((patch) => patch.name),

    mapFrameBoundary(boundary, context = {}) {
        if (!isFrameBoundary(boundary)) {
            throw new TypeError('Expected a faithful DGDS frame boundary');
        }

        const runtimeDelayTicks = patches.reduce(
            (ticks, patch) => patch.map(ticks, { boundary, context }),
            boundary.delayTicks,
        );

        return Object.freeze({
            authoredDelayTicks: boundary.delayTicks,
            runtimeDelayTicks: Math.max(1, Math.round(runtimeDelayTicks || 0)),
            profile,
            patches: patches.map((patch) => patch.name),
        });
    },
});
