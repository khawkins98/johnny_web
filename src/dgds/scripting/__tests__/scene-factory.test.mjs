import { describe, expect, it, vi } from 'vitest';
import { canRunTtmScene, createTtmRuntimeState, getSceneState } from '../scene-factory.mjs';
import { createRecordingSurface } from '../surface.mjs';

const command = (opcode) => ({ opcode, params: [] });

/**
 * Build a parent/root runtime state exposing a shared `surface` and a `scenesRes`
 * holding a two-scene TTM resource at index 1 (prologue tag 0, siblings 3 and 21).
 */
const makeTtmParent = () => {
    const ttm = {
        scenes: [
            { tagId: 0, script: [command(0x0ff0)] },
            { tagId: 3, script: [command(0xa500)] },
            { tagId: 21, script: [command(0xa500)] },
        ],
    };
    return {
        scenesRes: [undefined, ttm],
        scenes: [],
        data: { scenes: [{ tagId: 1 }], resources: [{ id: 1 }] },
        currentScene: 0,
        resourceProvider: { resolve: vi.fn() },
        surface: createRecordingSurface(),
        surfaceFactory: createRecordingSurface,
        audioOperations: [],
        random: () => 0.5,
        delay: 0,
        backgroundId: 1,
        foregroundColor: {},
        backgroundColor: {},
        cloudIdx: 15,
        cloudX: 0,
        cloudY: 0,
    };
};

describe('TTM runtime state boundary', () => {
    it('copies only the explicit host and resource contract', () => {
        const surface = createRecordingSurface();
        const shared = {
            res: ['sprites'],
            bkgScreen: { name: 'ocean' },
            bkgRes: { name: 'backgroundId' },
            bkgRaft: { name: 'raft' },
            bkgOcean: ['day', 'night'],
            saveBkg: [{}],
            save: [{}, {}, {}],
            foregroundColor: { r: 1 },
            backgroundColor: { r: 0 },
            backgroundId: 1,
            cloudIdx: 15,
            cloudX: 320,
            cloudY: 20,
        };
        const parent = {
            ...shared,
            scenes: [],
            surface,
            surfaceFactory: createRecordingSurface,
            resourceProvider: { resolve: vi.fn() },
            scenesRes: ['ttm'],
            audioOperations: [],
            random: () => 0.25,
            storyRandom: { modulo: vi.fn() },
            game: { id: 'test-game' },
            currentScene: 12,
            addScenes: ['must not leak'],
            removeScenes: ['must not leak'],
            playedHistory: new Set(['must not leak']),
            fadingOut: true,
            fadeOpacity: 0.75,
        };

        const child = createTtmRuntimeState(parent, shared, 4, 113);

        expect(child).toMatchObject({
            type: 'TTM',
            sceneIdx: 4,
            tagId: 113,
            reentry: 0,
            continue: true,
            resourceProvider: parent.resourceProvider,
            scenesRes: parent.scenesRes,
            audioOperations: parent.audioOperations,
            random: parent.random,
            storyRandom: parent.storyRandom,
            game: parent.game,
            res: shared.res,
            bkgOcean: shared.bkgOcean,
            saveBkg: shared.saveBkg,
        });
        // Every scene draws into the ONE shared raster and links back to its root.
        expect(child.surface).toBe(surface);
        expect(child.root).toBe(parent);
        expect(child.audioOperations).toBe(parent.audioOperations);
        expect(child).not.toHaveProperty('currentScene');
        expect(child).not.toHaveProperty('addScenes');
        expect(child).not.toHaveProperty('removeScenes');
        expect(child).not.toHaveProperty('playedHistory');
        expect(child).not.toHaveProperty('fadingOut');
        expect(child).not.toHaveProperty('fadeOpacity');
    });

    it('creates fresh execution and clip state for every child', () => {
        const parent = {
            scenes: [],
            resourceProvider: { resolve: vi.fn() },
            scenesRes: [],
            res: [],
            surface: createRecordingSurface(),
            surfaceFactory: createRecordingSurface,
        };

        const first = createTtmRuntimeState(parent, parent, 1, 1);
        const second = createTtmRuntimeState(parent, parent, 1, 2);
        first.clip.x = 99;
        first.reentry = 8;

        expect(second.clip.x).toBe(0);
        expect(second.reentry).toBe(0);
        // Both children draw into the same shared raster.
        expect(second.surface).toBe(first.surface);
        expect(second.surface).toBe(parent.surface);
    });

    it('every scene draws into the runtime shared raster', () => {
        const state = makeTtmParent();
        const a = getSceneState(state, 1, 3, 0, 100);
        const b = getSceneState(state, 1, 21, 0, 100);
        expect(a.state.surface).toBe(state.surface);
        expect(b.state.surface).toBe(state.surface);
    });

    it('sibling scenes of one environment share environment state, not per-scene clones', () => {
        const state = makeTtmParent();
        const a = getSceneState(state, 1, 3, 0, 100);
        const b = getSceneState(state, 1, 21, 0, 100);
        // Sprite save-under now lives in the ONE global rect-keyed registry on the
        // root; siblings reach it via the same root and share the environment's
        // background-store slots. There are no per-scene sprite-save clones.
        expect(a.state.root).toBe(b.state.root);
        expect(a.state.saveBkg).toBe(b.state.saveBkg);
    });

    it('shares assets within one TTM resource but isolates different resources', () => {
        const ttm = (tag) => ({
            scenes: [
                { tagId: 0, script: [command(0x0ff0)] },
                { tagId: tag, script: [command(0xa500)] },
                { tagId: tag + 1, script: [command(0xa500)] },
                { tagId: tag + 2, script: [command(0xa500)] },
            ],
        });
        const parent = {
            scenesRes: [undefined, ttm(10), ttm(20)],
            scenes: [],
            data: {
                scenes: [{ tagId: 1 }],
                resources: [{ id: 2 }, { id: 1 }],
            },
            currentScene: 0,
            resourceProvider: { resolve: vi.fn() },
            surface: createRecordingSurface(),
            surfaceFactory: createRecordingSurface,
            audioOperations: [],
            random: () => 0.5,
            delay: 0,
            backgroundId: 1,
            foregroundColor: {},
            backgroundColor: {},
            cloudIdx: 15,
            cloudX: 0,
            cloudY: 0,
        };

        const first = getSceneState(parent, 1, 10, 0, 0);
        const sibling = getSceneState(parent, 1, 11, 0, 0);
        const otherResource = getSceneState(parent, 2, 20, 0, 0);

        expect(first.script).toHaveLength(2);
        expect(sibling.script).toHaveLength(1);
        expect(first.sequenceKey).toBe('1:10');
        expect(sibling.sequenceKey).toBe('1:11');
        expect(otherResource.sequenceKey).toBe('2:20');
        expect(first.environment.owner).toBe(first);
        expect(sibling.environment).toBe(first.environment);
        expect(canRunTtmScene(first)).toBe(true);
        expect(canRunTtmScene(sibling)).toBe(false);
        first.environment.ready = true;
        expect(canRunTtmScene(sibling)).toBe(true);

        const concurrentSibling = getSceneState(parent, 1, 12, 3, 0);
        const timeLimitedSibling = getSceneState(parent, 1, 12, -180, 1);

        // Siblings of one environment share resources AND the environment's
        // background-store slots. Sprite save-under lives in the global rect-keyed
        // registry (on the root), not per-scene slots.
        expect(sibling.state.res).toBe(first.state.res);
        expect(sibling.state.saveBkg).toBe(first.state.saveBkg);
        expect(concurrentSibling.state.saveBkg).toBe(first.state.saveBkg);
        // Both children draw into the one shared raster.
        expect(sibling.state.surface).toBe(parent.surface);
        expect(concurrentSibling.state.surface).toBe(parent.surface);

        expect(concurrentSibling.retries).toBe(2);
        expect(concurrentSibling.timeLimitTicks).toBeNull();
        expect(timeLimitedSibling.retries).toBe(0);
        expect(timeLimitedSibling.timeLimitTicks).toBe(180);
        expect(timeLimitedSibling.proportion).toBe(1);

        // A different TTM resource gets an isolated environment.
        expect(otherResource.environment).not.toBe(first.environment);
        expect(otherResource.state.res).not.toBe(first.state.res);
        expect(otherResource.state.saveBkg).not.toBe(first.state.saveBkg);
    });
});
