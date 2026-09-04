import { describe, expect, it } from 'vitest';
import { hasData, loadAds } from './support/drive-gag.mjs';

// Data-lint guarding the OR-group assumption the runtime's IF/OR chaining relies on
// (see `handleIfCondition`/`findMatchingEndIf` in script-runner.mjs): an OR (0x1430)
// inside a condition joins IF_PLAYED (0x1350) clauses ONLY. The OR-chain walk treats
// every clause of such a group as sharing the single body after the last clause; if a
// shipped ADS ever joined a NON-IF_PLAYED opcode with OR (e.g. IF_PLAYED a OR
// IF_NOT_RUNNING b), the walk would end the group early and mis-index the handoff
// silently. The corpus is frozen (proprietary SCRANTIC data), so this is a one-time
// verification that turns that latent assumption into a loud failure if the data is
// ever regenerated/changed.
const ADS_FILES = [
    'ACTIVITY.ADS',
    'BUILDING.ADS',
    'WALKSTUF.ADS',
    'VISITOR.ADS',
    'MARY.ADS',
    'FISHING.ADS',
    'JOHNNY.ADS',
    'MISCGAG.ADS',
    'STAND.ADS',
    'SUZY.ADS',
];

const OR = 0x1430;
const IF_PLAYED = 0x1350;

describe.skipIf(!hasData)('ADS OR-groups join IF_PLAYED clauses only (OR-chain walk assumption)', () => {
    it('has no OR joining a non-IF_PLAYED opcode in any shipped ADS scene', () => {
        const offenders = [];
        for (const file of ADS_FILES) {
            let data;
            try {
                data = loadAds(file);
            } catch {
                continue; // not every title ships every ADS file
            }
            for (const scene of data.scenes || []) {
                const script = scene.script || [];
                for (let i = 0; i < script.length; i++) {
                    if (script[i].opcode !== OR) continue;
                    // An OR must sit between two IF_PLAYED clauses.
                    const before = script[i - 1]?.opcode;
                    const after = script[i + 1]?.opcode;
                    if (before !== IF_PLAYED || after !== IF_PLAYED) {
                        offenders.push(
                            `${file} tag ${scene.tagId?.id} op ${i}: OR between ` +
                                `0x${(before ?? 0).toString(16)} and 0x${(after ?? 0).toString(16)}`,
                        );
                    }
                }
            }
        }
        expect(offenders, offenders.join('\n')).toEqual([]);
    });
});
