export const ExecutionStatus = Object.freeze({
    YIELDED: 'yielded',
    LOOPED: 'looped',
    COMPLETED: 'completed',
});

export const executionOutcome = (status, state, details = {}) => Object.freeze({
    status,
    sceneIdx: state?.sceneIdx ?? null,
    tagId: state?.tagId ?? null,
    programCounter: state?.reentry ?? null,
    ...details,
});

export const pendingExecution = (state, reason = 'not-started') => (
    executionOutcome(ExecutionStatus.YIELDED, state, { reason })
);
