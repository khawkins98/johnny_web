import { describe, expect, it } from 'vitest';
import { createRecordingSurface } from '../surface.mjs';
import {
    registerSaveUnder, restoreSaveUnder, queueDeferredRestore, flushDeferredRestores,
} from '../save-under.mjs';

describe('global content-addressed save-under', () => {
    it('restores by rect key, independent of any per-scene slot index', () => {
        const surface = createRecordingSurface();
        const state = { surface, saveUnder: [] };
        registerSaveUnder(state, { x: 5, y: 6, width: 8, height: 8 });
        restoreSaveUnder(state, { x: 5, y: 6, width: 8, height: 8 });
        expect(surface.commands.at(-1)).toMatchObject({ operation: 'replaceRegionFrom' });
        expect(state.saveUnder).toHaveLength(0); // consumed
    });

    it('keeps two same-index saves of different rects distinct (no collision)', () => {
        const surface = createRecordingSurface();
        const state = { surface, saveUnder: [] };
        registerSaveUnder(state, { x: 0, y: 0, width: 4, height: 4 });   // "scene A slot 0"
        registerSaveUnder(state, { x: 40, y: 40, width: 4, height: 4 }); // "scene B slot 0"
        restoreSaveUnder(state, { x: 0, y: 0, width: 4, height: 4 });    // A's rect only
        expect(state.saveUnder.map((e) => e.key)).toEqual(['40:40:4:4']); // B's entry survives
    });

    it('defers a queued node exactly one tick', () => {
        const surface = createRecordingSurface();
        const state = { surface, pendingRestore: [] };
        queueDeferredRestore(state, { surface: createRecordingSurface(), x: 0, y: 0, width: 4, height: 4 });
        flushDeferredRestores(state); // tick T: age 1 -> requeued age 0, no draw yet
        expect(surface.commands.some((c) => c.operation === 'replaceRegionFrom')).toBe(false);
        flushDeferredRestores(state); // tick T+1: age 0 -> applied
        expect(surface.commands.some((c) => c.operation === 'replaceRegionFrom')).toBe(true);
    });
});
