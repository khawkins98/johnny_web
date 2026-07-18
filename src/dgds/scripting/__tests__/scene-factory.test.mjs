import { describe, expect, it, vi } from 'vitest';
import { createTtmRuntimeState } from '../scene-factory.mjs';
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
            entries: ['entries'],
            scenesRes: ['ttm'],
            audioManager: { play: vi.fn() },
            random: () => 0.25,
            compatibility: { setting: vi.fn() },
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
            surface,
            entries: parent.entries,
            scenesRes: parent.scenesRes,
            audioManager: parent.audioManager,
            random: parent.random,
            compatibility: parent.compatibility,
            res: shared.res,
            bkgOcean: shared.bkgOcean,
            save: shared.save,
            saveBkg: shared.saveBkg,
        });
        expect(child).not.toHaveProperty('currentScene');
        expect(child).not.toHaveProperty('addScenes');
        expect(child).not.toHaveProperty('removeScenes');
        expect(child).not.toHaveProperty('playedHistory');
        expect(child).not.toHaveProperty('fadingOut');
        expect(child).not.toHaveProperty('fadeOpacity');
    });

    it('creates fresh execution and clip state for every child', () => {
        const parent = { scenes: [], entries: [], scenesRes: [], res: [], surface: createRecordingSurface() };

        const first = createTtmRuntimeState(parent, parent, 1, 1);
        const second = createTtmRuntimeState(parent, parent, 1, 2);
        first.clip.x = 99;
        first.reentry = 8;

        expect(second.clip.x).toBe(0);
        expect(second.reentry).toBe(0);
    });
});
