import { describeSceneFlowGuard } from '../../../dgds/scripting/scene-flow.mjs';

const START = '__gag__';

/** Adapt the ADS extractor's guarded actions to a navigable graph. */
export function buildSceneFlowMap(flow) {
    const nodes = new Map([[START, { key: START, name: flow.gag.name || `Gag ${flow.gag.tag}`, kind: 'start' }]]);
    const edges = [];
    const addNode = (item, kind = 'scene') => {
        const key = `${item.slot}:${item.tag}`;
        if (!nodes.has(key)) nodes.set(key, { key, name: item.name, kind });
        return key;
    };
    for (const step of flow.steps) {
        for (const branch of [step, ...(step.arms || [])]) {
            const actions = [
                ...branch.adds.map((item) => ({ item, action: 'add' })),
                ...branch.stops.map((item) => ({ item, action: 'stop' })),
            ];
            if (!actions.length) continue;
            const refs = branch.guard.refs || (branch.guard.kind === 'always' ? [] : [branch.guard]);
            const sources = !refs.length || branch.guard.kind === 'start' || branch.guard.kind === 'ifNotRunning'
                ? [START] : refs.map((item) => addNode(item));
            const guard = describeSceneFlowGuard(branch.guard, { fallThrough: branch.fallThrough });
            for (const from of sources) {
                for (const { item, action } of actions) {
                    edges.push({ from, to: addNode(item, action === 'stop' ? 'stop' : 'scene'), guard,
                        random: Boolean(branch.random), action });
                }
            }
        }
    }
    return { nodes: [...nodes.values()], edges, start: START };
}
