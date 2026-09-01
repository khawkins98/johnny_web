import { describe, expect, it } from 'vitest';
import { johnnyCastaway } from '../../../games/johnny/manifest.mjs';
import { driveGag, hasData, loadAds } from './support/drive-gag.mjs';

// Every ADS gag must run to completion on the REAL single-gag path (`driveGag` =
// singleAdsScene, the browser's path). This guards the content-addressed handoff
// dispatch: a gag whose ambient/rearm loop never drains (the gag-7 failure class)
// would spin past the tick cap here. Completion is the runtime's own `result.completed`
// (live-thread drain), NOT a currentScene sentinel -- the sentinel trips early on the
// single-gag path (currentScene advances into the concluding-children hold before the
// gag actually completes), which would make this pass trivially.
//
// SCRANTIC.SCR is proprietary + gitignored (absent in CI), so this runs locally and
// skips in CI, like the golden harness.
const activity = hasData ? loadAds(johnnyCastaway.resources.activity) : null;
const gagIds = activity ? [...new Set(activity.scenes.map((s) => s.tagId?.id).filter((id) => id != null))] : [];

describe.skipIf(!hasData)('every ADS gag runs to completion', () => {
    for (const gag of gagIds) {
        it(`gag ${gag} completes within 5000 ticks (no stall / infinite loop)`, () => {
            const { completed } = driveGag({
                adsName: johnnyCastaway.resources.activity,
                tag: gag,
                seed: 0x4a430000 + gag,
            });
            expect(completed, `gag ${gag} did not complete within 5000 ticks`).toBe(true);
        });
    }
});
