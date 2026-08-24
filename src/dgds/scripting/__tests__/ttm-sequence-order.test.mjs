import { describe, expect, it } from 'vitest';
import { moveSequenceToBack, sequencePaintIndex } from '../ttm-sequence-order.mjs';

describe('TTM sequence painter order', () => {
    it('mutates stable definition order independently of invocation order', () => {
        const state = { ttmSequenceOrder: ['3:44', '3:47', '3:75'] };
        const fire = { sequenceKey: '3:44' };
        const actor = { sequenceKey: '3:47' };

        expect(moveSequenceToBack(state.ttmSequenceOrder, 3, 44)).toBe(true);

        expect(state.ttmSequenceOrder).toEqual(['3:47', '3:75', '3:44']);
        expect(sequencePaintIndex(state, actor)).toBe(0);
        expect(sequencePaintIndex(state, fire)).toBe(2);
    });

    it('leaves the order unchanged for an unknown definition', () => {
        const order = ['1:1'];
        expect(moveSequenceToBack(order, 9, 9)).toBe(false);
        expect(order).toEqual(['1:1']);
    });
});
