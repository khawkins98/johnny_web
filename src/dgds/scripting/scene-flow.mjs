/**
 * scene-flow.mjs — turns one ADS gag scene's authored bytecode into a
 * human-readable flow model: an ordered list of "when X happens, do Y" steps
 * plus a dependency graph (edges) suitable for a mermaid flowchart.
 *
 * Pure and browser-safe: it does no file IO and does not load ADS/TTM data
 * itself. Callers inject a `label(slot, tag) -> string` resolver (see
 * tools/faithfulness-oracle/scene-flow-doc.mjs for the real one, backed by
 * loadAds()); tests can pass any stub.
 *
 * The ADS bytecode this reads from is documented in ads-opcodes.mjs. A
 * branch (one chunk between END_SCENE_BRANCH markers) is either:
 *   - unconditional (no leading IF): guard = 'always'
 *   - guarded by exactly one IF_* condition
 *   - guarded by a chain of IF_* conditions joined by OR / AND, compiled as
 *     nested IFs (see the FISHING.ADS OR-chain example in ads-opcodes.mjs's
 *     handleIfPlayedFinishedBranch doc comment) — represented here as a
 *     single step whose guard carries all joined conditions plus a
 *     `combinator`.
 * A RANDOM_START..RANDOM_END block inside a branch's body means the engine
 * picks ONE of the ADD_SCENEs inside it at runtime — surfaced as
 * `random: true` on the step.
 */

const GUARD_KIND_BY_OPCODE_NAME = {
    IF_NOT_PLAYED: 'start',
    IF_PLAYED: 'after',
    IF_RUNNING: 'while',
    IF_NOT_RUNNING: 'ifNotRunning',
};

const opName = (op) => op.line?.trim().split(/\s+/)[0] ?? '';

const isGuardOp = (op) => opName(op) in GUARD_KIND_BY_OPCODE_NAME;
const isJoinOp = (op) => opName(op) === 'OR' || opName(op) === 'AND';

const guardRef = (op, label) => {
    const [slot, tag] = op.params;
    return { kind: GUARD_KIND_BY_OPCODE_NAME[opName(op)], slot, tag, name: label(slot, tag) };
};

/** Split a scene's flat script into its top-level branches (END_SCENE_BRANCH-delimited chunks). */
const splitBranches = (script) => {
    const branches = [];
    let current = [];
    for (const op of script) {
        if (opName(op) === 'END_SCENE_BRANCH') {
            if (current.length) branches.push(current);
            current = [];
        } else if (opName(op) === 'END') {
            // sentinel end-of-script marker, not part of any branch
        } else {
            current.push(op);
        }
    }
    if (current.length) branches.push(current);
    return branches;
};

/**
 * Parse one branch into { guard, body }. The guard is the leading run of
 * IF-family / OR / AND ops; everything after that (minus its closing
 * END_IFs) is the body. A branch with no leading IF has guard = null
 * (kind 'always').
 */
const parseGuardChain = (branch, label) => {
    const refs = [];
    let combinator = null;
    let i = 0;
    while (i < branch.length && (isGuardOp(branch[i]) || isJoinOp(branch[i]))) {
        const op = branch[i];
        if (isGuardOp(op)) {
            refs.push(guardRef(op, label));
        } else {
            combinator = opName(op) === 'OR' ? 'or' : 'and';
        }
        i++;
    }
    // Body is everything after the guard chain, minus trailing END_IF markers
    // (one per nested guard) and any END_SCENE marker.
    const rest = branch.slice(i).filter((op) => opName(op) !== 'END_IF');
    return { refs, combinator, body: rest };
};

const buildGuard = (refs, combinator) => {
    if (refs.length === 0) return { kind: 'always' };
    if (refs.length === 1) return { ...refs[0] };
    return { ...refs[0], combinator, refs };
};

/** Extract ADD_SCENE / STOP_SCENE actions from a branch body, and whether it contains a RANDOM block. */
const parseBody = (body, label) => {
    const adds = [];
    const stops = [];
    let random = false;
    for (const op of body) {
        const name = opName(op);
        if (name === 'RANDOM_START') random = true;
        else if (name === 'ADD_SCENE') {
            const [slot, tag] = op.params;
            adds.push({ slot, tag, name: label(slot, tag) });
        } else if (name === 'STOP_SCENE') {
            const [slot, tag] = op.params;
            stops.push({ slot, tag, name: label(slot, tag) });
        }
    }
    return { adds, stops, random };
};

/**
 * @param {{tagId:{id:number,description:string}, script:Array}} scene
 * @param {{label:(slot:number,tag:number)=>string}} deps
 */
export const extractSceneFlow = (scene, { label }) => {
    const branches = splitBranches(scene.script);

    const steps = [];
    const edges = [];
    const nodeMap = new Map();
    const addNode = (slot, tag) => {
        const key = `${slot}:${tag}`;
        if (!nodeMap.has(key)) nodeMap.set(key, { key, name: label(slot, tag) });
        return key;
    };

    for (const branch of branches) {
        const { refs, combinator, body } = parseGuardChain(branch, label);
        const { adds, stops, random } = parseBody(body, label);
        if (refs.length === 0 && adds.length === 0 && stops.length === 0) continue;

        steps.push({ guard: buildGuard(refs, combinator), adds, stops, random });

        // Dependency edges: an IF_PLAYED/IF_RUNNING guard tag "unlocks" whatever
        // this branch adds. IF_NOT_PLAYED (start) and no-guard branches don't
        // depend on another gag scene, so they contribute no edges.
        const edgeSources = refs.filter((r) => r.kind === 'after' || r.kind === 'while');
        if (edgeSources.length && adds.length) {
            for (const src of edgeSources) {
                const fromKey = addNode(src.slot, src.tag);
                for (const add of adds) {
                    const toKey = addNode(add.slot, add.tag);
                    edges.push([fromKey, toKey]);
                }
            }
        }
    }

    return {
        gag: { tag: scene.tagId.id, name: scene.tagId.description },
        steps,
        edges,
        nodes: [...nodeMap.values()],
    };
};
