/**
 * Browser host for an instance-owned DGDS runtime.
 *
 * Engine coordination lives in runtime.mjs. This module supplies browser
 * services, owns the one active page session, and preserves the legacy
 * startProcess/__DEBUG__ API while callers migrate to explicit instances.
 */
import { createCanvasSurfaceElement } from './surface.mjs';
import { createBrowserCompatibility } from './compatibility.mjs';
import { createTraceRecorder } from './trace.mjs';
import { diagnostics } from './diagnostics.mjs';
import { createSessionInfo } from './session-info.mjs';
import { createTimingCompatibility } from './timing-compatibility.mjs';
import { DGDS_TICK_MS } from './timing.mjs';
import { DgdsRuntime } from './runtime.mjs';
import { createBrowserScheduler } from '../hosts/browser-scheduler.mjs';
import { consumeBrowserAudio } from '../hosts/browser-audio.mjs';
import { createBrowserFramePresenter } from '../hosts/browser-frame-presenter.mjs';

let activeRuntime = null;
let activeScheduler = null;
let activeFramePresenter = null;

const runtimeSessionInfo = () => ({
    ...createSessionInfo({
        mode: diagnostics.mode,
        tick: activeRuntime?.state.tick ?? null,
    }),
    engine: activeRuntime?.describe() ?? null,
});

const beginRuntimeTrace = () => {
    if (!activeRuntime) return;
    const recorder = createTraceRecorder({ pixelHashes: true });
    recorder.startSession(runtimeSessionInfo());
    activeRuntime.state.trace = recorder;
};

diagnostics.subscribe((current, previous) => {
    const state = activeRuntime?.state;
    if (current.trace && !previous.trace) {
        beginRuntimeTrace();
    } else if (!current.trace && previous.trace) {
        state?.trace?.stopSession({
            disabledAt: new Date().toISOString(),
            tick: state?.tick ?? null,
        });
    } else if (current.trace && previous.trace && current.mode !== previous.mode) {
        state?.trace?.record('diagnostics-mode', {
            tick: state?.tick ?? null,
            previousMode: previous.mode,
            mode: current.mode,
        });
    }

    if (current.enabled && !previous.enabled) {
        console.log('[DGDS] Diagnostics enabled', runtimeSessionInfo());
    } else if (!current.enabled && previous.enabled) {
        console.log('[DGDS] Diagnostics disabled');
    } else if (current.mode !== previous.mode) {
        console.log(`[DGDS] Diagnostics mode changed: ${previous.mode} → ${current.mode}`);
    }
});

export const startProcess = (initialState) => {
    activeScheduler?.stop();

    const {
        audioManager = null,
        onComplete,
        context,
        mainContext,
        ...runtimeInitialState
    } = initialState;

    const compatibility = runtimeInitialState.compatibility || createBrowserCompatibility({
        ...(runtimeInitialState.random ? { random: runtimeInitialState.random } : {}),
    });
    const random = runtimeInitialState.random || compatibility.random;
    const timingCompatibility = runtimeInitialState.timingCompatibility
        || compatibility.timing
        || createTimingCompatibility();
    const surfaceFactory = runtimeInitialState.surfaceFactory || createCanvasSurfaceElement;

    const runtime = new DgdsRuntime({
        ...runtimeInitialState,
        compatibility,
        random,
        timingCompatibility,
        surfaceFactory,
    });
    activeRuntime = runtime;
    const framePresenter = createBrowserFramePresenter({ context, mainContext });
    activeFramePresenter = framePresenter;

    if (!runtimeInitialState.trace && diagnostics.trace) beginRuntimeTrace();
    if (diagnostics.console) {
        console.log('[DGDS] Diagnostics session', runtimeSessionInfo());
    }

    const scheduler = createBrowserScheduler();
    activeScheduler = scheduler;
    scheduler.start(baseTicks => {
        const state = runtime.state;
        state.speedRemainder += baseTicks * state.playbackRate;
        const ticks = Math.floor(state.speedRemainder);
        state.speedRemainder -= ticks;

        for (let tick = 0; tick < ticks; tick++) {
            const result = runtime.tick(DGDS_TICK_MS);
            framePresenter.present(state, result.presentation);
            consumeBrowserAudio(result.audioOperations, {
                audioManager,
                trace: state.trace,
            });
            if (result.completed) {
                scheduler.stop();
                if (activeScheduler === scheduler) activeScheduler = null;
                onComplete?.();
                break;
            }
        }
    });

    return runtime.state;
};

// Legacy singleton façade for the page's developer and enhanced controls.
// Engine state belongs to DgdsRuntime; this façade only targets the active host
// session and can be removed once UI consumers receive a runtime instance.
export const __DEBUG__ = {
    jumpToScene: tagId => {
        const jumped = activeRuntime?.jumpToScene(tagId);
        if (jumped) activeFramePresenter?.clear();
        return jumped;
    },
    setNightMode: isNight => {
        activeRuntime?.setNightMode(isNight);
        if (activeRuntime) activeFramePresenter?.presentBackground(activeRuntime.state);
    },
    stepScene: direction => activeRuntime?.stepScene(direction),
    setPlaybackRate: rate => activeRuntime?.setPlaybackRate(rate),
    getPresentation: () => activeRuntime?.getPresentation() ?? {
        scene: null,
        name: '',
        playbackRate: 1,
    },
    getState: () => activeRuntime?.state ?? null,
    getTrace: () => activeRuntime?.state.trace?.snapshot() || [],
    saveTrace: () => {
        const trace = activeRuntime?.state.trace;
        if (!trace) throw new Error('Diagnostics are disabled; enable them in Settings first');
        return trace.download();
    },
    persistTrace: () => {
        const trace = activeRuntime?.state.trace;
        if (!trace) throw new Error('Diagnostics are disabled; enable them in Settings first');
        return trace.persist();
    },
};
