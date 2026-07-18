/**
 * Browser compatibility profile.
 *
 * Rendering/orchestration code consumes this interface instead of reading
 * browser globals directly. Tests and alternate hosts can inject deterministic
 * storage, time, and randomness.
 */
import { createTimingCompatibility } from './timing-compatibility.mjs';

export const createBrowserCompatibility = ({
    storage = globalThis.localStorage,
    now = () => Date.now(),
    currentHour = () => new Date().getHours(),
    random = Math.random,
    timing = createTimingCompatibility(),
} = {}) => ({
    now,
    currentHour,
    random,
    timing,

    setting(key, fallback = null) {
        try {
            return storage?.getItem(key) ?? fallback;
        } catch {
            return fallback;
        }
    },

    randomInt(minimum, maximum) {
        const low = Math.ceil(Math.min(minimum, maximum));
        const high = Math.floor(Math.max(minimum, maximum));
        return low + Math.floor(random() * (high - low + 1));
    },
});
