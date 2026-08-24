import { loadResourceEntry } from './resource.mjs';

/**
 * Adapt archive entries to the synchronous named-resource contract consumed by
 * the DGDS runtime. Decoding remains synchronous because authored scripts may
 * draw a resource later in the same interpreter pass.
 */
export const createEntryResourceProvider = (entries, { decode = loadResourceEntry } = {}) => {
    if (!Array.isArray(entries)) {
        throw new TypeError('Entry resource provider requires an entries array');
    }
    const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));

    return Object.freeze({
        has: (name) => entriesByName.has(name),
        resolve(name) {
            const entry = entriesByName.get(name);
            return entry === undefined ? undefined : decode(entry);
        },
    });
};
