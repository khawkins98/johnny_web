import { describe, expect, it } from 'vitest';
import { indexAdsChunks } from '../script-runner.mjs';

describe('indexAdsChunks', () => {
    it('maps each IF_PLAYED (slot,tag) to the index after it, allowing multiples', () => {
        const script = [
            { opcode: 0x1350, params: [3, 82] }, // IF_PLAYED 3:82
            { opcode: 0x2005, params: [3, 83] }, // ADD 3:83
            { opcode: 0x1510, params: [] }, // END_SCENE_BRANCH
            { opcode: 0x1350, params: [3, 141] },
            { opcode: 0x2005, params: [3, 140] },
            { opcode: 0x1510, params: [] },
            { opcode: 0x1350, params: [3, 82] }, // second chunk for 3:82
            { opcode: 0x2005, params: [3, 99] },
            { opcode: 0x1510, params: [] },
        ];
        const idx = indexAdsChunks(script);
        expect(idx.get('3:82')).toEqual([1, 7]);
        expect(idx.get('3:141')).toEqual([4]);
    });

    it('returns an empty map when no IF_PLAYED opcodes are present', () => {
        const script = [{ opcode: 0x2005, params: [3, 83] }, { opcode: 0x1510, params: [] }];
        expect(indexAdsChunks(script).size).toBe(0);
    });

    it('maps every OR-clause key to the shared body after the LAST clause', () => {
        // IF_PLAYED 1:10 OR 1:21 OR 1:23  { RANDOM ... }  -- the body (index 5)
        // fires when ANY clause finishes, so all three keys map to it. Mirrors the
        // FISHING ambient loop: dispatching from a non-last clause (1:10 / 1:21)
        // must enter the RANDOM body, not the next OR/IF_PLAYED opcode.
        const script = [
            { opcode: 0x1350, params: [1, 10] }, // 0: IF_PLAYED 1:10
            { opcode: 0x1430, params: [] }, // 1: OR
            { opcode: 0x1350, params: [1, 21] }, // 2: IF_PLAYED 1:21
            { opcode: 0x1430, params: [] }, // 3: OR
            { opcode: 0x1350, params: [1, 23] }, // 4: IF_PLAYED 1:23
            { opcode: 0x3010, params: [] }, // 5: RANDOM_START (the shared body)
            { opcode: 0x2005, params: [1, 22] }, // 6
            { opcode: 0x30ff, params: [] }, // 7: RANDOM_END
            { opcode: 0xfff0, params: [] }, // 8: END_IF
            { opcode: 0x1510, params: [] }, // 9: END_SCENE_BRANCH
        ];
        const idx = indexAdsChunks(script);
        expect(idx.get('1:10')).toEqual([5]);
        expect(idx.get('1:21')).toEqual([5]);
        expect(idx.get('1:23')).toEqual([5]);
    });

    it('does NOT merge across AND -- an AND-joined clause keeps its own body', () => {
        // AND needs all clauses, so a single-tag finish can't satisfy it; each
        // AND-joined IF_PLAYED maps to its own i+1, unchanged.
        const script = [
            { opcode: 0x1350, params: [1, 10] }, // 0: IF_PLAYED 1:10
            { opcode: 0x1420, params: [] }, // 1: AND
            { opcode: 0x1350, params: [1, 21] }, // 2: IF_PLAYED 1:21
            { opcode: 0x2005, params: [1, 22] }, // 3
            { opcode: 0xfff0, params: [] }, // 4
            { opcode: 0x1510, params: [] }, // 5
        ];
        const idx = indexAdsChunks(script);
        expect(idx.get('1:10')).toEqual([1]); // its own i+1 (the AND), not merged
        expect(idx.get('1:21')).toEqual([3]);
    });
});
