import { describe, expect, it } from 'vitest';
import { DgdsRuntime } from '../runtime.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { getSceneState } from '../scene-factory.mjs';
import { createSoftwareSurface } from '../surface.mjs';
import { composeTtmFrame } from '../composition.mjs';
import { PALETTE } from '../../palette.mjs';

// Faithful scene-handoff behaviour (RE: phase4-stopped-scene-handoff.md).
// The original engine hands one gag sub-scene off to the next with ZERO
// background-only frames: the finishing scene's last frame is still shown the
// tick it finishes, and its successor draws its first frame the same tick the
// finished one drops. The immediate-mode port used to blank for two ticks
// (finished scene dropped the tick it finished; successor drawn a tick late).

const RED = 12;
const litPixels = (surface) => {
    let n = 0;
    for (let i = 3; i < surface.pixels.length; i += 4) if (surface.pixels[i] !== 0) n++;
    return n;
};
const litAt = (surface, x, y) => surface.pixels[(y * surface.width + x) * 4 + 3] !== 0;

const drawFrame = (x) => [
    { opcode: 0x2000, params: [RED, 0] },
    { opcode: 0xa100, params: [x, 100, 10, 10] },
    { opcode: 0x0ff0, params: [] },
];

const createRuntime = (overrides) =>
    new DgdsRuntime({
        type: 'ADS',
        singleAdsScene: true,
        random: () => 0,
        timingCompatibility: createTimingCompatibility(),
        surfaceFactory: () => createSoftwareSurface(),
        resourceProvider: { resolve: () => undefined },
        data: {
            name: 'handoff',
            resources: [{ id: 1, name: 'SCENES.TTM' }],
            scenes: [{ tagId: { id: 1 }, script: [{ opcode: 0xffff, params: [] }] }],
        },
        ...overrides,
    });

describe('faithful scene handoff: no background-only frame between sub-scenes', () => {
    it('shows a scene’s final frame the tick it finishes, then ages it out within a bounded tick', () => {
        // A ONCE scene: draws one frame at x=100, then its TTM completes.
        const ttm = {
            tags: [{ id: 5, description: 'actor' }],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 5, script: [...drawFrame(100), { opcode: 0x1120, params: [] }] },
            ],
        };
        const runtime = createRuntime({ resourceProvider: { resolve: () => ttm } });
        const actor = getSceneState(runtime.state, 1, 5, 0, 1); // ONCE
        runtime.state.scenes.push(actor);

        // Drive until the actor draws its frame and its TTM reports finished,
        // composing each tick and recording whether its rect is lit.
        const shownWhileFinishing = [];
        let finishTick = -1;
        for (let tick = 0; tick < 12; tick++) {
            runtime.tick(20);
            composeTtmFrame(runtime.state);
            const lit = litAt(runtime.state.surface, 105, 105);
            if (actor.runState === 'finished' && finishTick === -1) {
                finishTick = tick;
                shownWhileFinishing.push(lit); // the tick it finished: must still be shown
            } else if (finishTick !== -1 && tick <= finishTick + 2) {
                shownWhileFinishing.push(lit);
            }
        }

        expect(finishTick).toBeGreaterThanOrEqual(0);
        // The tick it finishes, its final frame is STILL composed (age-out is
        // one tick later, not the same tick) -- no dropped final frame.
        expect(shownWhileFinishing[0]).toBe(true);
        // But it does age out (never frozen): a later tick clears it.
        expect(shownWhileFinishing.some((shown) => shown === false)).toBe(true);
    });

    it('never composes an empty frame across a finish -> stop -> add -> draw handoff', () => {
        // Predecessor 1:1 draws at x=100 then finishes; the ADS reacts to it
        // being played by adding successor 1:2, which draws at x=200.
        const ttm = {
            tags: [
                { id: 1, description: 'predecessor' },
                { id: 2, description: 'successor' },
            ],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 1, script: [...drawFrame(100), { opcode: 0x1120, params: [] }] },
                { tagId: 2, script: [...drawFrame(200), { opcode: 0x1200, params: [1] }] },
            ],
        };
        const runtime = createRuntime({
            adsSceneTag: 1,
            resourceProvider: { resolve: () => ttm },
            // Real 50 ms present cadence over 20 ms fine ticks, so the "successor
            // drawn a tick late" defect is exercised, not masked by per-tick present.
            wmTimerMs: 50,
            data: {
                name: 'handoff-2',
                resources: [{ id: 1, name: 'SCENES.TTM' }],
                scenes: [
                    {
                        tagId: { id: 1 },
                        script: [
                            { opcode: 0x1350, params: [1, 1] }, // IF_PLAYED 1:1
                            { opcode: 0x2005, params: [1, 2, 1, 1] }, // ADD_SCENE 1:2
                            { opcode: 0x1510, params: [] },
                            { opcode: 0xffff, params: [] },
                        ],
                    },
                ],
            },
        });
        const predecessor = getSceneState(runtime.state, 1, 1, 1, 1);
        runtime.state.scenes.push(predecessor);

        // Record the composed pixel count every tick. Once anything has been
        // drawn, there must be no later tick with an empty composite while a
        // drawable scene exists (predecessor still finishing or successor active).
        const counts = [];
        let everDrawn = false;
        for (let tick = 0; tick < 16; tick++) {
            runtime.tick(20);
            composeTtmFrame(runtime.state);
            const n = litPixels(runtime.state.surface);
            if (n > 0) everDrawn = true;
            const successorActive = runtime.state.scenes.some((s) => s.tagId === 2);
            counts.push({ tick, n, everDrawn, successorActive });
        }

        // The successor must eventually be running and drawing.
        expect(counts.some((c) => c.successorActive && c.n > 0)).toBe(true);

        // No background-only frame once drawing has started and before the
        // successor has taken over: every tick from first-draw through the
        // successor being active must have a non-empty composite.
        const firstDrawn = counts.findIndex((c) => c.n > 0);
        const successorShown = counts.findIndex((c) => c.successorActive && c.n > 0);
        const gap = counts
            .slice(firstDrawn, successorShown + 1)
            .filter((c) => c.n === 0);
        expect(gap).toEqual([]);
    });
});
