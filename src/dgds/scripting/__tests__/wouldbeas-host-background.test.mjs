import { describe, expect, it } from 'vitest';
import { driveGag, hasData } from './support/drive-gag.mjs';

// Issue #49. WALKSTUF.ADS #1 (WOULDBEAS) adds WOULDBE.TTM tags 1, 2, 4, 6-9
// and 11-16, but WOULDBE's LOAD_SCREEN ISLETEMP.SCR lives in tag 3's frame.
// The gag never loads a screen, ocean, or island sprites of its own. It relies
// on the host-drawn island, the way the original relies on the host writing
// ISLETEMP.SCR. The browser host's fallback (src/bottle/host-background.mjs)
// supplies that island.
describe.skipIf(!hasData)('WOULDBEAS background ownership', () => {
    it('never loads a background of its own, so the host must keep its island', () => {
        let sawBackground = false;
        const { completed } = driveGag({
            adsName: 'WALKSTUF.ADS',
            tag: 1,
            maxTicks: 3000,
            onTick: (runtime) => {
                const { state } = runtime;
                const owners = [state, ...state.scenes.map((scene) => scene?.state).filter(Boolean)];
                if (owners.some((owner) => owner.bkgScreen || owner.bkgOcean?.length)) sawBackground = true;
            },
        });

        expect(completed).toBe(true);
        expect(sawBackground).toBe(false);
    });

    it('the sibling gag WALKSTUF.ADS #2 loads its own ocean', () => {
        let sawOcean = false;
        driveGag({
            adsName: 'WALKSTUF.ADS',
            tag: 2,
            maxTicks: 50,
            onTick: (runtime) => {
                if (runtime.state.scenes.some((scene) => scene?.state?.bkgOcean?.length)) sawOcean = true;
            },
        });

        expect(sawOcean).toBe(true);
    });
});
