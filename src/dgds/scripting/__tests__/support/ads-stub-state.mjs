import { createAdsProgram } from '../../ads-walker.mjs';
import { TtmRunState } from '../../ttm-run-state.mjs';

// Shared fixtures for driving the ADS interpreter (ads-walker.mjs) without game
// data. Every TTM slot is a stub environment with an empty prologue, so ADD
// materializes a scene object at once (in `starting`, i.e. running) without
// running any TTM. Tests emulate the node pass by hand: `finishNode` is "the TTM
// ended this pass" (state 4, the one-tick IF_PLAYED pulse) and `clearPulses` is
// the next pass's state-4 -> 0 clear.

export const op = (opcode, ...params) => ({ opcode, params });

export const makeAdsState = (sceneIdxTags, { random = () => 0, faithfulPick = null, hostManagedTransitions = true } = {}) => {
    const scenesRes = {};
    for (const [sceneIdx, tags] of Object.entries(sceneIdxTags)) {
        scenesRes[sceneIdx] = {
            // scenes[0] is the shared prologue (empty script => environment ready at once).
            scenes: tags.map((tagId) => ({ tagId, script: [] })),
        };
    }
    return {
        type: 'ADS',
        currentScene: 0,
        scenes: [],
        adsAdded: new Set(),
        playedHistory: new Set(),
        ttmSequenceOrder: [],
        random,
        ...(faithfulPick ? { faithfulPick } : {}),
        scenesRes,
        surface: {},
        surfaceFactory: () => ({}),
        hostManagedTransitions,
        fadingOut: false,
        fadeOpacity: 0,
    };
};

/** Build a program whose tags are numbered 1..n in file order. */
export const makeProgram = (...scripts) =>
    createAdsProgram({ scenes: scripts.map((script, index) => ({ tagId: { id: index + 1 }, script })) });

export const find = (state, sceneIdx, tagId) => state.scenes.find((s) => s.sceneIdx === sceneIdx && s.tagId === tagId);
export const count = (state, sceneIdx, tagId) =>
    state.scenes.filter((s) => s.sceneIdx === sceneIdx && s.tagId === tagId).length;

/** The node pass saw this TTM end: state 4 for exactly the next walk. */
export const finishNode = (state, sceneIdx, tagId) => {
    const scene = find(state, sceneIdx, tagId);
    scene.runState = TtmRunState.FINISHED;
    scene.playedPulse = true;
};

/** The next node pass: every state-4 node goes back to 0. */
export const clearPulses = (state) => {
    for (const scene of state.scenes) scene.playedPulse = false;
};
