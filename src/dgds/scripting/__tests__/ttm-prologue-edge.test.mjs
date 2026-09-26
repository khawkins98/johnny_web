import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadResources } from '../../resource.mjs';
import { DgdsRuntime } from '../runtime.mjs';
import { addSceneNode } from '../ads-scene-changes.mjs';
import { createRecordingSurface } from '../surface.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { hasData } from './support/drive-gag.mjs';

const op = (opcode, ...params) => ({ opcode, params });

const runtimeWith = (ttm, resolveResource) =>
    new DgdsRuntime({
        type: 'ADS',
        data: {
            name: 'prologue-fixture',
            resources: [{ id: 1, name: 'SCENES.TTM' }],
            scenes: [{
                tagId: { id: 1 },
                script: [op(0x2005, 1, 3, 2, 1), op(0xf010, -1), op(0xffff)],
            }],
        },
        adsSceneTag: 1,
        singleAdsScene: true,
        resourceProvider: {
            resolve: (name) => name === 'SCENES.TTM' ? ttm : resolveResource(name),
        },
        random: () => 0,
        timingCompatibility: createTimingCompatibility(),
        surfaceFactory: createRecordingSurface,
        wmTimerMs: 20,
    });

describe('TTM frame-zero prologue edge cases', () => {
    it.skipIf(!hasData)('the shipped archive has one frame-zero SET_SCENE and 40 separate prologues', () => {
        const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/data');
        const bytes = (name) => {
            const buffer = readFileSync(path.join(dataDir, name));
            return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        };
        const archive = loadResources(bytes('RESOURCE.MAP'), bytes('RESOURCE.001'))
            .getResource('RESOURCE.001');
        const ttms = archive.entries.filter((entry) => entry.type === 'TTM')
            .map((entry) => archive.loadEntry(entry.name));
        const withFrameZeroScene = ttms.filter((ttm) => ttm.scenes[0].script.length === 0);

        expect(ttms).toHaveLength(41);
        expect(withFrameZeroScene.map((ttm) => ttm.name)).toEqual(['WOULDBE.TTM']);
        expect(withFrameZeroScene[0].scenes[1].script.slice(0, 5).map((c) => c.opcode))
            .toEqual([0x1110, 0xf010, 0x1060, 0xf050, 0x0ff0]);
        expect(ttms.filter((ttm) => ttm !== withFrameZeroScene[0])
            .every((ttm) => ttm.scenes[0].script.at(-1)?.opcode === 0x0ff0)).toBe(true);

        // MJJOG's first tagged frame has no LOAD_SCREEN. The screen that the
        // browser presenter uses comes solely from the separate prologue setup.
        const mjjog = ttms.find((ttm) => ttm.name === 'MJJOG.TTM');
        const screen = { name: 'ISLETEMP.SCR', type: 'SCR' };
        const runtime = runtimeWith(mjjog, (name) => name === screen.name ? screen : undefined);
        expect(runtime.state.bkgScreen).toBeNull();
        const thread = addSceneNode(runtime.state, 1, 1, 1, 1);
        expect(thread.state.bkgScreen).toBe(screen);
        expect(runtime.state.bkgScreen).toBe(screen);
    });

    it('replays WOULDBE-style frame-zero setup when its first thread repeats', () => {
        const screen = { name: 'ISLETEMP.SCR', type: 'SCR' };
        const resolveScreen = vi.fn(() => screen);
        const ttm = {
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 3, script: [
                    op(0x1110, 3), op(0xf010, 'ISLETEMP.SCR'), op(0x0ff0),
                ] },
            ],
        };
        const runtime = runtimeWith(ttm, resolveScreen);

        runtime.tick(20);
        const thread = runtime.state.scenes[0];
        expect(thread.prologueLength).toBe(0);
        expect(thread.targetStart).toBe(0);
        expect(thread.state.bkgScreen).toBe(screen);
        expect(resolveScreen).toHaveBeenCalledTimes(1);

        // The first pass completes and the counted ADD resets the thread to its
        // start frame. Clear the cached screen to make the second load observable.
        runtime.tick(20);
        expect(thread.retries).toBe(0);
        expect(thread.state.reentry).toBe(0);
        thread.state.bkgScreen = null;
        runtime.tick(20);
        expect(thread.state.bkgScreen).toBe(screen);
        expect(resolveScreen).toHaveBeenCalledTimes(2);
    });

    it('runs a separate frame-zero prologue as host asset setup without yielding its UPDATE', () => {
        const screen = { name: 'ISLETEMP.SCR', type: 'SCR' };
        const resolveScreen = vi.fn(() => screen);
        const ttm = {
            scenes: [
                { tagId: 0, script: [op(0xf010, 'ISLETEMP.SCR'), op(0x0ff0)] },
                { tagId: 3, script: [op(0x1110, 3), op(0x0ff0)] },
            ],
        };
        const runtime = runtimeWith(ttm, resolveScreen);
        const thread = addSceneNode(runtime.state, 1, 3, 1, 1);

        expect(thread.state.bkgScreen).toBe(screen);
        expect(runtime.state.bkgScreen).toBe(screen);
        expect(thread.state.reentry).toBe(2);
        expect(thread.targetStart).toBe(2);
        expect(thread.state.frameBoundary).toBeNull();
        expect(resolveScreen).toHaveBeenCalledTimes(1);

        runtime.tick(20);
        runtime.tick(20);
        runtime.tick(20);
        expect(resolveScreen).toHaveBeenCalledTimes(1);
    });
});
