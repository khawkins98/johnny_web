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
 * This intentionally specifies only the fields the current host and machine
 * consume. A second title should extend the contract from evidence rather than
 * adding speculative configuration here.
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
    requireString(definition.resources?.intro, 'resources.intro');
    requireString(definition.resources?.activity, 'resources.activity');
    requireString(definition.audio?.archive, 'audio.archive');
    if (!Array.isArray(definition.audio?.sampleOffsets)) {
        throw new TypeError('Bottle game package requires audio.sampleOffsets');
    }
    if (!definition.background || typeof definition.background !== 'object') {
        throw new TypeError('Bottle game package requires background metadata');
    }

    return deepFreeze(definition);
};
