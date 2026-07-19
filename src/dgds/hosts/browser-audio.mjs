import { AudioOperationType } from '../scripting/audio-operation.mjs';

const record = (trace, operation, action, details = {}) =>
    trace?.record('audio-sample', {
        tick: operation.tick,
        sceneIdx: operation.sceneIdx,
        tagId: operation.tagId,
        action,
        sample: operation.sample,
        ...details,
    });

/** Consume logical DGDS audio operations using a Web Audio manager. */
export const consumeBrowserAudio = (operations, { audioManager, trace } = {}) => {
    for (const operation of operations) {
        if (operation.type !== AudioOperationType.PLAY_SAMPLE) continue;

        if (!audioManager?.getSoundFxSource) {
            record(trace, operation, 'unavailable');
            continue;
        }
        if (audioManager.context?.state === 'suspended') {
            audioManager.context.resume();
        }

        const sampleSource = audioManager.getSoundFxSource();
        if (!sampleSource?.load) {
            record(trace, operation, 'unavailable');
            continue;
        }
        sampleSource.load(operation.sample, () => {
            record(trace, operation, 'started', {
                enabled: audioManager.enabled !== false,
                contextState: audioManager.context?.state ?? null,
            });
            sampleSource.play();
        });
    }
};
