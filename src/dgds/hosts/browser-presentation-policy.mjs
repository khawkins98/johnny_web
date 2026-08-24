/** Browser-only settings, wall-time, and enhancement randomness. */
export const createBrowserPresentationPolicy = ({
    storage = globalThis.localStorage,
    now = () => Date.now(),
    currentHour = () => new Date().getHours(),
    random = Math.random,
} = {}) => {
    const backgroundStates = new WeakMap();

    return {
        now,
        currentHour,
        random,

        backgroundState(source) {
            let state = backgroundStates.get(source);
            if (!state) {
                state = {
                    cloudElapsed: source.cloudElapsed || 0,
                    cloudX: source.cloudX || 0,
                    cloudOriginX: source.cloudX || 0,
                    cloudY: source.cloudY || 0,
                    waveElapsed: source.waveElapsed || 0,
                    waveFrame: source.waveFrame || 0,
                };
                backgroundStates.set(source, state);
            }
            return state;
        },

        setting(key, fallback = null) {
            try {
                return storage?.getItem(key) ?? fallback;
            } catch {
                return fallback;
            }
        },
    };
};
