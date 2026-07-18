const MODES = new Set(['off', 'basic', 'verbose', 'trace', 'all']);

export const modeState = (mode) => Object.freeze({
    mode,
    enabled: mode !== 'off',
    ui: mode !== 'off',
    console: mode === 'basic' || mode === 'verbose' || mode === 'trace' || mode === 'all',
    verbose: mode === 'verbose' || mode === 'all',
    trace: mode === 'trace' || mode === 'all',
});

export const parseDiagnostics = (search = '') => {
    const params = new URLSearchParams(search);
    if (params.has('trace') && !params.has('debug')) return modeState('trace');
    if (!params.has('debug')) return modeState('off');
    const requested = params.get('debug') || 'basic';
    return modeState(MODES.has(requested) ? requested : 'basic');
};

export const createDiagnosticsController = (initial = modeState('off')) => {
    let current = initial;
    const listeners = new Set();
    const controller = {
        get mode() { return current.mode; },
        get enabled() { return current.enabled; },
        get ui() { return current.ui; },
        get console() { return current.console; },
        get verbose() { return current.verbose; },
        get trace() { return current.trace; },
        snapshot: () => current,
        setMode(mode) {
            if (!MODES.has(mode)) throw new RangeError(`Unknown diagnostics mode: ${mode}`);
            if (mode === current.mode) return current;
            const previous = current;
            current = modeState(mode);
            listeners.forEach(listener => listener(current, previous));
            return current;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    return controller;
};

const initialDiagnostics = (() => {
    try { return parseDiagnostics(window.location.search); }
    catch { return parseDiagnostics(); }
})();

export const diagnostics = createDiagnosticsController(initialDiagnostics);
