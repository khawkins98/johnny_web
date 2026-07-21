/**
 * Coordinate one atomic debug-run handoff across title-owned and DGDS-owned
 * playback. A host attempt spans its walk, ADS runtime, and final transition.
 */
export const createDebugRunCoordinator = ({ sequenceTools, stopRuntime, stopAudio = () => {} }) => {
    if (!sequenceTools) return null;
    let pendingOverride = null;
    let activeAttempt = null;
    let generation = 0;

    const request = ({ mode, script, tagId, storyDay }) => {
        const options = { storyDay };
        const override =
            mode === 'preview'
                ? sequenceTools.preview(script, tagId, options)
                : (sequenceTools.planFrom(script, tagId, options), null);

        generation++;
        pendingOverride = override;
        stopAudio();
        activeAttempt?.controller.abort('script_override');
        stopRuntime('script_override');
        return override;
    };

    return Object.freeze({
        request,
        beginAttempt() {
            const attempt = Object.freeze({
                generation,
                controller: new AbortController(),
                get signal() {
                    return this.controller.signal;
                },
            });
            activeAttempt = attempt;
            return attempt;
        },
        endAttempt(attempt) {
            if (activeAttempt === attempt) activeAttempt = null;
        },
        interrupted: (attempt) => attempt.signal.aborted || attempt.generation !== generation,
        takeOverride() {
            const override = pendingOverride;
            pendingOverride = null;
            return override;
        },
    });
};
