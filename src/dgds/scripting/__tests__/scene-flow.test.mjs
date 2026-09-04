import { describe, expect, it } from 'vitest';
import { extractSceneFlow, outlineSceneFlowSteps } from '../scene-flow.mjs';

// A tiny fake label resolver for synthetic tests: slot:tag -> readable name.
const label = (slot, tag) => `S${slot}T${tag}`;

// Real ADS ops carry BOTH a numeric `opcode` (what ads-slots.mjs's slot model
// reads) and a textual `line` (what the guard/body parser reads). The slot
// classification only works if synthetic ops carry the right opcode, so map the
// mnemonic to its real opcode here.
const OPCODES = {
    IF_NOT_PLAYED: 0x1330,
    IF_PLAYED: 0x1350,
    IF_NOT_RUNNING: 0x1360,
    IF_RUNNING: 0x1370,
    END_SCENE_BRANCH: 0x1510,
    ADD_SCENE: 0x2005,
    STOP_SCENE: 0x2010,
    RANDOM_START: 0x3010,
    RANDOM_END: 0x30ff,
    END_IF: 0xfff0,
    END: 0xffff,
};

const op = (line, params, indent = 0) => ({
    line,
    params,
    indent,
    opcode: OPCODES[line.trim().split(/\s+/)[0]] ?? 0,
});

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

    it('classifies non-first IF_NOT_PLAYED / IF_RUNNING branches as fall-through arms of the preceding entry ladder', () => {
        // An IF_PLAYED entry followed by an IF_RUNNING arm and an IF_NOT_PLAYED
        // "else" arm — the octopus retry-ladder shape (FISHING:3). Per the
        // engine's slot model (ads-slots.mjs) the entry is a slot boundary and
        // the two later arms are fall-through continuations of that same slot,
        // NOT independent "at the start" entries.
        const scene = {
            tagId: { id: 3, description: 'LADDER' },
            script: [
                op('IF_PLAYED 1 44', [1, 44]),
                op('ADD_SCENE 1 48 0 1', [1, 48, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('IF_RUNNING 1 46', [1, 46]),
                op('ADD_SCENE 1 47 0 1', [1, 47, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('IF_NOT_PLAYED 1 45', [1, 45]),
                op('ADD_SCENE 1 45 0 1', [1, 45, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('END', []),
            ],
        };

        const flow = extractSceneFlow(scene, { label });

        // One ENTRY step (the IF_PLAYED), carrying the two later branches as
        // fall-through arms — not three top-level steps.
        expect(flow.steps).toHaveLength(1);
        const entry = flow.steps[0];
        expect(entry.guard.kind).toBe('after');
        expect(entry.fallThrough).toBe(false);
        expect(entry.arms).toHaveLength(2);
        expect(entry.arms[0].guard.kind).toBe('while');
        expect(entry.arms[1].guard.kind).toBe('start');
        // Every arm is flagged as a fall-through, none as an entry.
        for (const arm of entry.arms) expect(arm.fallThrough).toBe(true);

        // The rendered outline must NOT surface the IF_NOT_PLAYED arm as a
        // second "at the start" — it reads as an "otherwise" ladder rung.
        const outline = outlineSceneFlowSteps(flow);
        const starts = outline.filter((o) => o.guardText === 'at the start');
        expect(starts).toHaveLength(0);
        expect(outline.filter((o) => o.fallThrough)).toHaveLength(2);
        expect(outline.some((o) => /^otherwise/.test(o.guardText))).toBe(true);
    });

    it('keeps a linear IF_PLAYED chain as independent entry steps (no fall-through grouping)', () => {
        // JOHNNY:2-shape: each IF_PLAYED is its own slot entry, so each stays a
        // top-level step with no arms — the clean linear flow must not regress.
        const scene = {
            tagId: { id: 2, description: 'LINEAR' },
            script: [
                op('IF_NOT_PLAYED 1 1', [1, 1]),
                op('ADD_SCENE 1 1 0 1', [1, 1, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('IF_PLAYED 1 1', [1, 1]),
                op('ADD_SCENE 1 2 0 1', [1, 2, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('IF_PLAYED 1 2', [1, 2]),
                op('ADD_SCENE 1 3 0 1', [1, 3, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('END', []),
            ],
        };

        const flow = extractSceneFlow(scene, { label });

        expect(flow.steps).toHaveLength(3);
        for (const step of flow.steps) {
            expect(step.fallThrough).toBe(false);
            expect(step.arms).toEqual([]);
        }
        const outline = outlineSceneFlowSteps(flow);
        expect(outline.map((o) => o.guardText)).toEqual([
            'at the start',
            'after "S1T1"',
            'after "S1T2"',
        ]);
        expect(outline.every((o) => !o.fallThrough)).toBe(true);
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
