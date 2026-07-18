export const parseDiagnostics = (search = '') => {
    const params = new URLSearchParams(search);
    const requested = params.has('debug');
    const mode = params.get('debug') || (requested ? 'basic' : 'off');
    const legacyTrace = params.has('trace');

    return Object.freeze({
        mode,
        enabled: requested || legacyTrace,
        ui: requested || legacyTrace,
        console: requested,
        verbose: mode === 'verbose' || mode === 'all',
        trace: legacyTrace || mode === 'trace' || mode === 'all',
    });
};

export const diagnostics = (() => {
    try { return parseDiagnostics(window.location.search); }
    catch { return parseDiagnostics(); }
})();
