import { isFrameBoundary } from './frame-timing.mjs';

const DEFAULT_TIMING_PROFILE = 'faithful-browser';

const browserYieldFloor = (ticks) => Math.max(1, ticks);

/**
 * Maps faithful DGDS timing into host scheduler timing.
 *
 * Named patches are intentionally data transformations, not opcode branches.
 * The default profile preserves authored delays and only makes a zero-delay
 * frame visible for one browser engine tick.
 */
export const createTimingCompatibility = ({
    profile = DEFAULT_TIMING_PROFILE,
    patches = [{ name: 'browser-yield-floor', map: browserYieldFloor }],
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
            runtimeDelayTicks: Math.max(1, Math.trunc(runtimeDelayTicks || 0)),
            profile,
            patches: patches.map((patch) => patch.name),
        });
    },
});
