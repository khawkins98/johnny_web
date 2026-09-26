import { describe, expect, it } from 'vitest';
import { driveGag, hasData } from './support/drive-gag.mjs';
import { fingerprintOurs } from '../../../../tools/faithfulness-oracle/fingerprint.mjs';

// Original clock-instrumented captures: BUILDING:7/8 keep 3:83 for ten
// ~55ms samples; MARY:4 keeps 5:37 for 12–14. These are handoff windows, so
// checking their spans also catches the STOP-before-ADD ordering regression.
describe.skipIf(!hasData)('timed handoffs against original captures', () => {
    it.each([7, 8])('keeps BUILDING:%i embers until the boot routine stops them', (tag) => {
        const span = fingerprintOurs('BUILDING', tag, 1).actorSpanTicks['3:83'];
        expect(span).toBeDefined();
        expect(span.max).toBeGreaterThanOrEqual(10);
        expect(span.max).toBeLessThanOrEqual(40);

        const gag = driveGag({ adsName: 'BUILDING.ADS', tag, seed: 1 });
        expect(gag.completed).toBe(true);
        // Complete original episodes from two captures take roughly 61–68s;
        // random branch selection changes the exact episode length.
        expect(gag.ticks * 20).toBeGreaterThanOrEqual(60_000);
        expect(gag.ticks * 20).toBeLessThanOrEqual(70_000);
    });

    it('adds MARY:4 5:37 before its STOP pulse', () => {
        const span = fingerprintOurs('MARY', 4, 1).actorSpanTicks['5:37'];
        expect(span).toBeDefined();
        expect(span.max).toBeGreaterThanOrEqual(20);
        expect(span.max).toBeLessThanOrEqual(45);
    });
});
