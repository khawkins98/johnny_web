const MODES = new Set(['preview', 'sequence']);

export const parseDebugStageHash = (hash = '') => {
    const params = new URLSearchParams(String(hash).replace(/^#/, ''));
    const stage = params.get('stage');
    const separator = stage?.lastIndexOf(':') ?? -1;
    if (separator < 1) return null;
    const script = stage.slice(0, separator).toUpperCase();
    const tagId = Number(stage.slice(separator + 1));
    const storyDay = Number(params.get('day') || 1);
    const mode = params.get('mode') || 'preview';
    if (!script.endsWith('.ADS') || !Number.isInteger(tagId) || tagId < 1) return null;
    if (!Number.isInteger(storyDay) || storyDay < 1 || storyDay > 11 || !MODES.has(mode)) return null;
    return Object.freeze({ script, tagId, storyDay, mode });
};

export const formatDebugStageHash = ({ script, tagId, storyDay = 1, mode = 'preview' }) => {
    const params = new URLSearchParams();
    params.set('stage', `${script}:${tagId}`);
    params.set('day', String(storyDay));
    params.set('mode', MODES.has(mode) ? mode : 'preview');
    return `#${params}`;
};
