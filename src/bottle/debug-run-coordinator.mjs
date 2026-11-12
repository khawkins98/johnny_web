/**
 * Coordinate one atomic debug-run handoff across title-owned and DGDS-owned
 * playback. A host attempt spans its walk, ADS runtime, and final transition.
 */
export const createDebugRunCoordinator = ({ sequenceTools, stopRuntime, stopAudio = () => {} }) => {
    if (!sequenceTools) return null;
    let pendingOverride = null;
    let activeAttempt = null;
    let activeSelection = null;
    // A preview the viewer chose to keep: it plays on, no longer reported as temporary.
    let keptSelection = null;
    let generation = 0;
    let interruptionReason = 'script_override';
    const statusListeners = new Set();

    const status = () => {
        const resumedSequence = sequenceTools.status?.() ?? null;
        if (!activeSelection?.preview) return resumedSequence;

        return Object.freeze({
            storyDay: activeSelection.titleState?.storyDay ?? resumedSequence?.storyDay ?? 1,
            current: 1,
            total: 1,
            remaining: 0,
            active: Object.freeze({ script: activeSelection.script, tagId: activeSelection.tagId }),
            next: null,
            final: Object.freeze({ script: activeSelection.script, tagId: activeSelection.tagId }),
            ...Object.fromEntries(['band', 'night', 'tidePhase', 'startTime', 'island', 'forceNight', 'forceHighTide'].map(
                (key) => [key, activeSelection.titleState?.[key]],
            )),
            lowTide: activeSelection.titleState?.lowTide ?? false,
            preview: true,
            resume: resumedSequence,
            ...(keptSelection === activeSelection ? { band: null, preview: false } : {}),
        });
    };

    const publishStatus = () => {
        for (const listener of statusListeners) listener(status());
    };

    sequenceTools.subscribeStatus?.(publishStatus);

    const request = ({ mode, script, tagId, storyDay, band, slot, childTag, route }) => {
        const options = band == null ? { storyDay } : { storyDay, band };
        if (mode === 'live') sequenceTools.returnToLive?.();
        // A preview interrupts the gag in progress; remember it so the viewer can go back.
        else if (mode === 'preview' || mode === 'preview-child') sequenceTools.holdPlace?.('preview');
        const override =
            mode === 'live' ? null : mode === 'preview' || mode === 'preview-child'
                ? mode === 'preview-child'
                    ? Object.freeze({
                        ...sequenceTools.preview(script, tagId, options),
                        childScenePreview: { slot, tag: childTag, route, armed: false, continueAds: true },
                    })
                    : sequenceTools.preview(script, tagId, options)
                : (sequenceTools.planFrom(script, tagId, options), null);

        generation++;
        interruptionReason = 'script_override';
        pendingOverride = override;
        stopAudio();
        activeAttempt?.controller.abort('script_override');
        stopRuntime('script_override');
        activeSelection = null;
        publishStatus();
        return override;
    };

    /** Keep the temporary day and time of day as the saved position, without a cut. */
    const keep = () => {
        const current = status();
        if (!current?.band) return false;
        sequenceTools.keepVisit?.({ storyDay: current.storyDay, band: current.band, preview: Boolean(current.preview) });
        if (current.preview) keptSelection = activeSelection;
        publishStatus();
        return true;
    };

    return Object.freeze({
        request,
        keep,
        reset() {
            generation++;
            interruptionReason = 'restart';
            pendingOverride = null;
            activeSelection = null;
            activeAttempt?.controller.abort('restart');
            stopAudio();
            stopRuntime('restart');
            sequenceTools.clearRun?.();
            publishStatus();
        },
        status,
        subscribeStatus(listener) {
            statusListeners.add(listener);
            listener(status());
            return () => statusListeners.delete(listener);
        },
        activate(selection) {
            activeSelection = selection;
            publishStatus();
        },
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
        // A second abort cannot replace AbortSignal.reason. Honor the latest
        // request if a title reset overtakes an already queued preview.
        interruptionReason: (attempt) => attempt.generation !== generation
            ? interruptionReason : attempt.signal.reason,
        takeOverride() {
            const override = pendingOverride;
            pendingOverride = null;
            return override;
        },
    });
};
