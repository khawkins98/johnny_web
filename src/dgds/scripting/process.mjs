/**
 * Browser host for an instance-owned DGDS runtime.
 *
 * Engine coordination lives in runtime.mjs. This module supplies browser
 * services, owns the one active page session, and preserves the legacy
 * startProcess/__DEBUG__ API while callers migrate to explicit instances.
 */
import { createSoftwareSurface } from './surface.mjs';
import { createTraceRecorder } from './trace.mjs';
import { diagnostics } from './diagnostics.mjs';
import { setLogging } from './log.mjs';
import { createSessionInfo } from './session-info.mjs';
import { createTimingCompatibility } from './timing-compatibility.mjs';
import { DGDS_TICK_MS } from './timing.mjs';
import { DgdsRuntime } from './runtime.mjs';
import { createBrowserScheduler } from '../hosts/browser-scheduler.mjs';
import { consumeBrowserAudio } from '../hosts/browser-audio.mjs';
import { createBrowserFramePresenter } from '../hosts/browser-frame-presenter.mjs';
import { createEntryResourceProvider } from '../resource-provider.mjs';
import { createBrowserPresentationPolicy } from '../hosts/browser-presentation-policy.mjs';

let activeRuntime = null;
let activeScheduler = null;
let activeFramePresenter = null;
let activeStop = null;
let diagnosticTrace = null;
let diagnosticSession = 0;
let diagnosticTraceId = null;

const runtimeSessionInfo = () => ({
    ...createSessionInfo({
        mode: diagnostics.mode,
        tick: activeRuntime?.state.tick ?? null,
    }),
    engine: activeRuntime?.describe() ?? null,
});

const persistDiagnosticTrace = async () => {
    if (!diagnosticTrace || !import.meta.env.DEV) return null;
    try {
        const result = await diagnosticTrace.persist('/__dgds_trace', { traceId: diagnosticTraceId });
        if (diagnostics.console) console.log(`[DGDS] Flight recorder saved to ${result.path}`);
        return result;
    } catch (error) {
        console.warn('[DGDS] Flight recorder could not be persisted', error);
        return null;
    }
};

const beginDiagnosticTrace = () => {
    diagnosticSession++;
    diagnosticTraceId = `dgds-${new Date().toISOString().replaceAll(':', '-')}-${diagnosticSession}`;
    diagnosticTrace = createTraceRecorder({ pixelHashes: true });
    diagnosticTrace.startSession({
        ...runtimeSessionInfo(),
        diagnosticSession,
        persistence: import.meta.env.DEV ? 'vite-localhost' : 'manual-download',
    });
    if (activeRuntime) activeRuntime.state.trace = diagnosticTrace;
    return diagnosticTrace;
};

diagnostics.subscribeEvents((type, data) => {
    diagnosticTrace?.record(type, { recordedAt: new Date().toISOString(), ...data });
});

diagnostics.subscribe((current, previous) => {
    const state = activeRuntime?.state;
    if (current.trace && !previous.trace) {
        beginDiagnosticTrace();
    } else if (!current.trace && previous.trace) {
        diagnosticTrace?.stopSession({
            disabledAt: new Date().toISOString(),
            tick: state?.tick ?? null,
            droppedEvents: diagnosticTrace?.dropped ?? 0,
        });
        void persistDiagnosticTrace();
    } else if (current.trace && previous.trace && current.mode !== previous.mode) {
        diagnosticTrace?.record('diagnostics-mode', {
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

    // Push the diagnostics flags into the canonical logger so the core can emit
    // console output without importing the diagnostics/observability layer.
    setLogging({ console: diagnostics.console, verbose: diagnostics.verbose });
});

// Seed the canonical logger with the diagnostics flags parsed at load time.
setLogging({ console: diagnostics.console, verbose: diagnostics.verbose });

export const stopProcess = (reason = 'stopped') => activeStop?.(reason) ?? false;

export const startProcess = (initialState) => {
    activeStop?.('replaced');

    const {
        audioManager = null,
        onComplete,
        context,
        mainContext,
        entries,
        resourceProvider: suppliedResourceProvider,
        presentationPolicy: suppliedPresentationPolicy,
        backgroundDecorator,
        ...runtimeInitialState
    } = initialState;

    const random = runtimeInitialState.random || Math.random;
    const timingCompatibility = runtimeInitialState.timingCompatibility || createTimingCompatibility();
    const surfaceFactory = runtimeInitialState.surfaceFactory || createSoftwareSurface;
    const resourceProvider = suppliedResourceProvider || createEntryResourceProvider(entries);
    const presentationPolicy = suppliedPresentationPolicy || createBrowserPresentationPolicy({ random });

    const runtime = new DgdsRuntime({
        ...runtimeInitialState,
        random,
        timingCompatibility,
        surfaceFactory,
        resourceProvider,
    });
    activeRuntime = runtime;
    const framePresenter = createBrowserFramePresenter({
        context,
        mainContext,
        presentationPolicy,
        backgroundDecorator,
        preserveInitialForeground: Boolean(runtimeInitialState.hostManagedTransitions),
    });
    activeFramePresenter = framePresenter;

    if (!runtimeInitialState.trace && diagnostics.trace) {
        if (!diagnosticTrace?.active) beginDiagnosticTrace();
        runtime.state.trace = diagnosticTrace;
        diagnosticTrace.record('runtime-start', {
            recordedAt: new Date().toISOString(),
            engine: runtime.describe(),
        });
    }
    if (diagnostics.console) {
        console.log('[DGDS] Diagnostics session', runtimeSessionInfo());
    }

    const scheduler = createBrowserScheduler();
    activeScheduler = scheduler;
    let finished = false;
    const finish = (reason) => {
        if (finished) return false;
        finished = true;
        scheduler.stop();
        if (diagnosticTrace && runtime.state.trace === diagnosticTrace) {
            diagnosticTrace.record('runtime-stop', {
                recordedAt: new Date().toISOString(),
                reason,
                tick: runtime.state.tick,
                droppedEvents: diagnosticTrace.dropped,
            });
            void persistDiagnosticTrace();
        }
        if (activeScheduler === scheduler) {
            activeScheduler = null;
            activeStop = null;
        }
        if (reason !== 'completed' && activeRuntime === runtime) {
            framePresenter.clear();
            activeRuntime = null;
            activeFramePresenter = null;
        }
        onComplete?.({ reason });
        return true;
    };
    activeStop = finish;
    scheduler.start((baseTicks) => {
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
                finish('completed');
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
    jumpToScene: (tagId) => {
        // Legacy free-run preview for the dev dropdown (not the single-gag path).
        const jumped = activeRuntime?.jumpToScene(tagId, { single: false });
        if (jumped) activeFramePresenter?.clear();
        return jumped;
    },
    setNightMode: (isNight) => {
        activeRuntime?.setNightMode(isNight);
        if (activeRuntime) activeFramePresenter?.presentBackground(activeRuntime.state);
    },
    refreshBackground: () => {
        if (activeRuntime) activeFramePresenter?.presentBackground(activeRuntime.state);
    },
    stepScene: (direction) => activeRuntime?.stepScene(direction),
    setPlaybackRate: (rate) => activeRuntime?.setPlaybackRate(rate),
    getPresentation: () =>
        activeRuntime?.getPresentation() ?? {
            scene: null,
            name: '',
            playbackRate: 1,
        },
    getState: () => activeRuntime?.state ?? null,
    getTrace: () => diagnosticTrace?.snapshot() || [],
    saveTrace: () => {
        const trace = diagnosticTrace;
        if (!trace) throw new Error('Diagnostics are disabled; enable them in Settings first');
        return trace.download();
    },
    persistTrace: () => {
        const trace = diagnosticTrace;
        if (!trace) throw new Error('Diagnostics are disabled; enable them in Settings first');
        return trace.persist();
    },
};
