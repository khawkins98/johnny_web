import { describe, expect, it } from 'vitest';
import { extractSceneFlow } from '../scene-flow.mjs';

// A tiny fake label resolver for synthetic tests: slot:tag -> readable name.
const label = (slot, tag) => `S${slot}T${tag}`;

const op = (line, params, indent = 0) => ({ line, params, indent, opcode: 0 });

describe('extractSceneFlow', () => {
    it('extracts a simple start-once branch: IF_NOT_PLAYED -> ADD_SCENE', () => {
        const scene = {
            tagId: { id: 1, description: 'GAG ONE' },
            script: [
                op('IF_NOT_PLAYED 1 1', [1, 1]),
                op('ADD_SCENE 1 1 0 1', [1, 1, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('END', []),
            ],
        };

        const flow = extractSceneFlow(scene, { label });

        expect(flow.gag).toEqual({ tag: 1, name: 'GAG ONE' });
        expect(flow.steps).toHaveLength(1);
        expect(flow.steps[0].guard).toEqual({ kind: 'start', slot: 1, tag: 1, name: 'S1T1' });
        expect(flow.steps[0].adds).toEqual([{ slot: 1, tag: 1, name: 'S1T1' }]);
        expect(flow.steps[0].stops).toEqual([]);
        expect(flow.steps[0].random).toBe(false);
    });

    it('builds an edge from an IF_PLAYED guard tag to the added scene tag', () => {
        const scene = {
            tagId: { id: 1, description: 'GAG ONE' },
            script: [
                op('IF_PLAYED 1 18', [1, 18]),
                op('ADD_SCENE 1 10 0 1', [1, 10, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('END', []),
            ],
        };

        const flow = extractSceneFlow(scene, { label });

        expect(flow.steps[0].guard).toEqual({ kind: 'after', slot: 1, tag: 18, name: 'S1T18' });
        expect(flow.edges).toContainEqual(['1:18', '1:10']);
        expect(flow.nodes).toEqual(
            expect.arrayContaining([
                { key: '1:18', name: 'S1T18' },
                { key: '1:10', name: 'S1T10' },
            ]),
        );
    });

    it('marks steps inside a RANDOM_START/RANDOM_END block as random', () => {
        const scene = {
            tagId: { id: 1, description: 'GAG ONE' },
            script: [
                op('IF_PLAYED 1 10', [1, 10]),
                op('RANDOM_START', [], 1),
                op('ADD_SCENE 1 20 0 1', [1, 20, 0, 1], 2),
                op('ADD_SCENE 1 21 0 1', [1, 21, 0, 1], 2),
                op('RANDOM_END', [], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('END', []),
            ],
        };

        const flow = extractSceneFlow(scene, { label });

        expect(flow.steps).toHaveLength(1);
        expect(flow.steps[0].random).toBe(true);
        expect(flow.steps[0].adds).toEqual([
            { slot: 1, tag: 20, name: 'S1T20' },
            { slot: 1, tag: 21, name: 'S1T21' },
        ]);
    });

    it('reads an IF_RUNNING guard as a while-condition and still edges to its target', () => {
        const scene = {
            tagId: { id: 1, description: 'GAG ONE' },
            script: [
                op('IF_RUNNING 1 5', [1, 5]),
                op('ADD_SCENE 1 6 0 1', [1, 6, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('END', []),
            ],
        };

        const flow = extractSceneFlow(scene, { label });

        expect(flow.steps[0].guard).toEqual({ kind: 'while', slot: 1, tag: 5, name: 'S1T5' });
        expect(flow.edges).toContainEqual(['1:5', '1:6']);
    });
});
