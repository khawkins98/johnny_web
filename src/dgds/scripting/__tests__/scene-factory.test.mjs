import { describe, expect, it, vi } from 'vitest';
import { canRunTtmScene, createTtmRuntimeState, getSceneState, prepareTtmScene } from '../scene-factory.mjs';
import { createRecordingSurface } from '../surface.mjs';

describe('TTM runtime state boundary', () => {
    it('copies only the explicit host and resource contract', () => {
        const surface = createRecordingSurface();
        const shared = {
            res: ['sprites'],
            bkgScreen: { name: 'ocean' },
            bkgRes: { name: 'island' },
            bkgRaft: { name: 'raft' },
            bkgOcean: ['day', 'night'],
            saveBkg: [{}],
            save: [{}, {}, {}],
            foregroundColor: { r: 1 },
            backgroundColor: { r: 0 },
            island: 1,
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
            game: parent.game,
            res: shared.res,
            bkgOcean: shared.bkgOcean,
            save: shared.save,
            saveBkg: shared.saveBkg,
        });
        expect(child.surface).not.toBe(surface);
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
        expect(second.surface).not.toBe(first.surface);
    });

    it('shares assets within one TTM resource but isolates different resources', () => {
        const command = (opcode) => ({ opcode, params: [] });
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
            island: 1,
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
        expect(first.paintOrder).toEqual({ resource: 1, sequence: 1 });
        expect(sibling.paintOrder).toEqual({ resource: 1, sequence: 2 });
        expect(otherResource.paintOrder).toEqual({ resource: 0, sequence: 1 });
        expect(first.environment.owner).toBe(first);
        expect(sibling.environment).toBe(first.environment);
        expect(canRunTtmScene(first)).toBe(true);
        expect(canRunTtmScene(sibling)).toBe(false);
        Object.assign(first.state.save[0], {
            canDraw: true,
            x: 10,
            y: 20,
            width: 30,
            height: 40,
        });
        first.environment.ready = true;
        expect(canRunTtmScene(sibling)).toBe(true);
        prepareTtmScene(sibling);
        const concurrentSibling = getSceneState(parent, 1, 12, 3, 0);
        expect(sibling.state.res).toBe(first.state.res);
        expect(sibling.state.save).not.toBe(first.state.save);
        expect(concurrentSibling.state.save).not.toBe(first.state.save);
        expect(concurrentSibling.state.save).not.toBe(sibling.state.save);
        expect(concurrentSibling.retries).toBe(2);
        expect(sibling.state.save[0]).toMatchObject({
            canDraw: true,
            x: 10,
            y: 20,
            width: 30,
            height: 40,
        });
        sibling.state.save[0].x = 99;
        expect(concurrentSibling.state.save[0].x).not.toBe(99);
        expect(otherResource.environment).not.toBe(first.environment);
        expect(otherResource.state.res).not.toBe(first.state.res);
        expect(otherResource.state.save).not.toBe(first.state.save);
    });
});
