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
});
