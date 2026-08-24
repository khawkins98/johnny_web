/** Explicit ADS-visible state of one TTM sequence invocation. */
export const TtmRunState = Object.freeze({
    STARTING: 'starting',
    RUNNING: 'running',
    WAITING: 'waiting',
    FINISHED: 'finished',
});

export const TtmRunMode = Object.freeze({
    ONCE: 'once',
    COUNTED: 'counted',
    TIME_LIMITED: 'time-limited',
    KEEP_GOING: 'keep-going',
});

export const isTtmRunning = (scene) =>
    scene != null &&
    (scene.runState === TtmRunState.STARTING ||
        scene.runState === TtmRunState.RUNNING ||
        scene.runState === TtmRunState.WAITING);

export const isTtmFinished = (scene) => scene?.runState === TtmRunState.FINISHED;
