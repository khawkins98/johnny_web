/**
 * log.mjs — canonical dev-logging config + emitters.
 *
 * The canonical execution path emits console diagnostics through these helpers.
 * Whether anything is printed is decided by a small mutable config that the HOST
 * pushes in (see hosts/diagnostics wiring in process.mjs) via `setLogging`.
 * The core never reads the `diagnostics` singleton or the URL query string; it
 * only reads/writes this local config, so it carries no dependency on the
 * override/observability layer. Default is silent.
 */

const config = { console: false, verbose: false };

/** Host hook: push the current diagnostics flags into the canonical logger. */
export const setLogging = ({ console: consoleEnabled, verbose } = {}) => {
    if (consoleEnabled !== undefined) config.console = Boolean(consoleEnabled);
    if (verbose !== undefined) config.verbose = Boolean(verbose);
};

export const isConsoleLogging = () => config.console;
export const isVerboseLogging = () => config.verbose;

export const getTimestamp = () => new Date().toISOString().substring(11, 23);

export const debugLog = (...args) => {
    if (config.console) console.log(`[DGDS] [${getTimestamp()}]`, ...args);
};

export const verboseLog = (...args) => {
    if (config.verbose) console.log(`[DGDS:V] [${getTimestamp()}]`, ...args);
};
