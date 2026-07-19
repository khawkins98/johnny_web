const deepFreeze = value => {
    if (!value || typeof value !== 'object') return value;
    Object.values(value).forEach(deepFreeze);
    return Object.isFrozen(value) ? value : Object.freeze(value);
};

const requireString = (value, path) => {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`Bottle game package requires ${path}`);
    }
};

/**
 * Validate and freeze the title/version knowledge supplied to Bottle DGDS.
 *
 * The base contract contains identity and archive discovery only. Individual
 * hosts validate optional capabilities such as presentation entry points,
 * background metadata, audio catalogues, or interaction models.
 */
export const defineGamePackage = definition => {
    if (!definition || typeof definition !== 'object') {
        throw new TypeError('Bottle game package must be an object');
    }

    requireString(definition.id, 'id');
    requireString(definition.title, 'title');
    requireString(definition.version, 'version');
    requireString(definition.resources?.map, 'resources.map');
    requireString(definition.resources?.archive, 'resources.archive');
    return deepFreeze(definition);
};
