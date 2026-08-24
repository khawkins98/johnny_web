export const AudioOperationType = Object.freeze({
    PLAY_SAMPLE: 'play-sample',
});

export const emitPlaySample = (state, sample) => {
    const operation = Object.freeze({
        type: AudioOperationType.PLAY_SAMPLE,
        sample,
        tick: state.getTraceTick?.() ?? state.tick ?? null,
        sceneIdx: state.sceneIdx ?? null,
        tagId: state.tagId ?? null,
    });
    state.audioOperations?.push(operation);
    return operation;
};
