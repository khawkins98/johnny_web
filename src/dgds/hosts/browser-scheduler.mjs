import { createFixedStepClock, DGDS_TICK_MS } from '../scripting/timing.mjs';

const fallbackRequestFrame = callback => setTimeout(
    () => callback(globalThis.performance?.now?.() ?? Date.now()),
    DGDS_TICK_MS,
);

const fallbackCancelFrame = frameId => clearTimeout(frameId);

/**
 * Browser animation-frame adapter.
 *
 * Converts host timestamps into a bounded number of logical DGDS ticks. It
 * owns no game state and is fully replaceable in tests or a non-browser host.
 */
export const createBrowserScheduler = ({
    clock = createFixedStepClock(),
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis) || fallbackRequestFrame,
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) || fallbackCancelFrame,
} = {}) => {
    let frameId = null;
    let running = false;

    const stop = () => {
        if (!running) return;
        running = false;
        if (frameId !== null) cancelFrame(frameId);
        frameId = null;
    };

    const start = onTicks => {
        if (running) throw new Error('Browser scheduler is already running');
        running = true;

        const frame = timestamp => {
            if (!running) return;
            frameId = requestFrame(frame);
            onTicks(clock.consume(timestamp));
        };

        frameId = requestFrame(frame);
        return stop;
    };

    return {
        start,
        stop,
        get running() {
            return running;
        },
    };
};

