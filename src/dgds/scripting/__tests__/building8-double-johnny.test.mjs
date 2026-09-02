import { describe, expect, it } from 'vitest';
import { driveGag, hasData } from './support/drive-gag.mjs';
import { isTtmFinished } from '../ttm-run-state.mjs';

// Regression scaffold for the "two Johnnys" at the end of BUILDING.ADS #8 (MJFIRE,
// sceneIdx 3). See scratchpad specs/render-bugs.md "Bug 2 — ARBITRATION UPDATE".
//
// Symptom: 3:140 "j walk to tree" plays CONCURRENTLY with 3:53/3:143 "johnny sits
// (back)", so two Johnny bodies draw at once at the end of the fire gag.
//
// Root cause (causally confirmed by a seed sweep): the smoke(39)->small-fire(41)->
// sit-back(53) cycle runs MORE THAN ONCE. The second sit-back re-fires while
// 3:140 is mid-walk. The extra cycle is admitted because the fire-retry guard
//   IF_NOT_RUNNING 3 38  AND  IF_NOT_RUNNING 3 40  ->  ADD 3 39 (smoke)
// does NOT gate out the smoke branch when RANDOM already picked 38/40 this tick.
// (Our 0x1360 IF_NOT_RUNNING is a wait-until-not-running barrier + the RANDOM pick
// is staged, not eagerly committed; the jc_reborn reference treats 0x1360 as
// skip-if-running with an eager RANDOM commit, so smoke fires only on the NOP roll
// -> exactly one fire cycle.)
//
// It is NOT the finish-dispatch (that faithfully fires each scene instance's
// IF_LASTPLAYED handoff once per termination — the campfire 3:44 re-arm relies on it).
//
// SKIPPED: the faithful rule (one fire cycle vs many) is not yet confirmed against
// the original BINARY, and the fix lives in load-bearing 0x1360/RANDOM semantics
// with golden-shift risk. Un-skip and run once that arbitration is done; it should
// FAIL pre-fix (double cycle) and PASS post-fix (single cycle, no walk/sit overlap).

// SKIPPED still: a one-line skip-if-running flip of 0x1360 makes smokeCycles==1 and
// removes the drawn overlap here, but it regresses campfire continuity, ACTIVITY-gag
// completion, and the explicit IF_NOT_RUNNING dependency-barrier tests -- the wait-barrier
// is a port invention compensating for the binary's re-poll+completion model. A faithful
// fix is the ADS scheduler re-grounding (ticket Phase 2), not a one-liner. Un-skip when
// that lands; it should PASS (smokeCycles==1, no DRAWN walk/sit overlap).
// FIXED by the single per-slot re-poll driver + skip-if-running 0x1360 (Task 4 of
// scratchpad/plans/2026-09-02-ads-per-slot-repoll-collapse.md). The binary evaluates
// IF_NOT_RUNNING live each tick and re-interprets every active slot's chunk every tick;
// under that model the fire-retry guard admits the smoke branch exactly once
// (presence-dedup keeps a re-poll a no-op while 3:39 is live), so the
// smoke->fire->sit->walk cycle runs ONCE -- no second sit-back re-firing during 3:140's
// walk, hence no two Johnny bodies. smokeCycles==1, no DRAWN walk/sit overlap, all seeds.
describe('BUILDING.ADS #8 — no "two Johnnys" at the fire-gag finish', () => {
    // A range of seeds; several currently produce the double (e.g. 1, 3, 4, 7).
    for (const seed of [1, 2, 3, 4, 5, 7, 11, 42, 99, 123]) {
        it(`seed ${seed}: walk-to-tree (3:140) never overlaps a sit-back (3:53/3:143)`, () => {
            let overlapTick = null;
            let smokeCycles = 0;
            const prevFire = new Set();
            driveGag({
                adsName: 'BUILDING.ADS',
                tag: 8,
                seed,
                maxTicks: 6000,
                onTick: (rt, _res, tick) => {
                    const s3 = rt.state.scenes.filter((s) => s.sceneIdx === 3);
                    const tags = new Set(s3.map((s) => s.tagId));
                    // Smoke-cycle count: rising edge of tag 39 being (re-)added to the list.
                    if (tags.has(39) && !prevFire.has(39)) smokeCycles += 1;
                    prevFire.clear();
                    for (const t of tags) prevFire.add(t);
                    // "Two Johnnys" = two bodies COMPOSITED at once. A finished scene lingers
                    // in state.scenes until pruned but composeTtmFrame skips it (isTtmFinished
                    // && agedOut), so it draws nothing -- only DRAWING scenes count. Using raw
                    // list membership here would false-positive on a finished walk still parked
                    // in the list next to the sit-back.
                    const drawing = new Set(
                        s3.filter((s) => !isTtmFinished(s) || s.agedOut === false).map((s) => s.tagId),
                    );
                    const walking = drawing.has(140);
                    const sitting = drawing.has(143) || drawing.has(53);
                    if (walking && sitting && overlapTick === null) overlapTick = tick;
                },
            });
            expect(overlapTick, `walk/sit overlap first seen at tick ${overlapTick}`).toBeNull();
            // The fire is lit exactly once per gag.
            expect(smokeCycles).toBe(1);
        });
    }

    it('has game data available', () => {
        expect(hasData).toBe(true);
    });
});
