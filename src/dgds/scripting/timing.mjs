/**
 * Browser-to-DGDS timing adapter.
 *
 * DGDS script delays are expressed in engine timer ticks. The interpreter keeps
 * those values as ticks; only this host-side adapter translates elapsed browser
 * time into a number of ticks to execute.
 */
export const DGDS_TICK_MS = 1000 / 60;
export const MAX_CATCH_UP_TICKS = 5;

export const createFixedStepClock = ({ tickMs = DGDS_TICK_MS, maxCatchUpTicks = MAX_CATCH_UP_TICKS } = {}) => {
    let previousTimestamp;
    let accumulator = 0;

    return {
        consume(timestamp) {
            if (!Number.isFinite(timestamp)) return 0;

            // Run an initial engine tick on the first browser frame. Resource
            // loading has already completed, so there is no useful reason to
            // leave the intro frame visible for another timer interval.
            if (previousTimestamp === undefined) {
                previousTimestamp = timestamp;
                return 1;
            }

            const elapsed = Math.max(0, timestamp - previousTimestamp);
            previousTimestamp = timestamp;
            accumulator += elapsed;

            const ticks = Math.min(Math.floor((accumulator + Number.EPSILON) / tickMs), maxCatchUpTicks);
            accumulator -= ticks * tickMs;

            // A suspended tab must not replay minutes of stale animation. Keep
            // only the fractional remainder after the bounded catch-up work.
            if (ticks === maxCatchUpTicks && accumulator >= tickMs) {
                accumulator %= tickMs;
            }

            return ticks;
        },

        reset() {
            previousTimestamp = undefined;
            accumulator = 0;
        },
    };
};
