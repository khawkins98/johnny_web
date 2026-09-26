/**
 * completion-model.mjs -- faithfulness ORACLE for ADS gag completion.
 *
 * READ-ONLY reference. NOT imported by the production engine; only tests/probes
 * import it. It transliterates the original binary's completion oracle so the
 * production engine can be differentially checked against the binary's ACTUAL
 * rule instead of against a judgment call. (Issue #11, Phase 1.)
 *
 * Binary source: `FUN_1048_0766` (decompiled.c:14034-14067), the per-gag
 * completion oracle the scene director consults each tick
 * (`FUN_1018_06bf:5761-5769` advances the scene queue only when it returns 0):
 *
 *   iVar3 = FUN_1048_19e7(adsTag);              // find the tag's scene-group; -1 if none
 *   if (iVar3 == -1) return 0;                  // no group -> COMPLETE
 *   runState = group.state[+0x12] & 0xfff7;     // mask bit3
 *   if (runState != 4 && runState != 1) {
 *       node = group.threadListHead[+0x3d2];    // per-group linked list of TTM threads
 *       if (node == NULL) return 0;             // no threads -> COMPLETE
 *       do {
 *           t = *node; node++;
 *           if (t == 0) return 0;               // list terminator, all skipped -> COMPLETE
 *       } while (t.state[+0x2f] == 4            // finished  -> skip
 *             || t.state[+0x2f] == 0            // stopped/inactive -> skip
 *             || t.field[+0xc] != 0);           // (aux) -> skip
 *       // fell out == found a thread whose state is NEITHER 4 nor 0
 *   }
 *   return 1;                                   // a LIVE thread exists -> STILL RUNNING
 *
 * Distilled rule: a gag is COMPLETE iff its tag has ended and its scene group
 * holds no LIVE thread -- i.e. every thread is finished (state 4) or stopped (state 0). A
 * running OR self-rearming ambient thread blocks completion simply by being
 * live; there is NO "unbounded loop that doesn't block" exception. This is a
 * linked-list form of jc_reborn's `while (numThreads)` (`ads.c:683`).
 *
 * The port models the thread list as `state.scenes` (stopped threads are spliced
 * out, so "state 0" threads are simply absent) and thread state 4 as
 * `isTtmFinished(scene)`. So the faithful predicate over the port's state is:
 * a scene is a LIVE thread iff it is present and NOT finished -- with NO KEEP_GOING
 * / unbounded-loop exclusion. ADS ADD commits immediately in the walker, so
 * there is no pending-add queue to consult.
 */

import { isTtmFinished } from '../ttm-run-state.mjs';

/**
 * The binary's live-thread predicate for one scene/thread: present and not
 * finished (stopped threads are absent from `state.scenes`). Deliberately does
 * NOT consult runMode/KEEP_GOING -- the binary has no such exception.
 */
export const isLiveThread = (scene) => scene != null && !isTtmFinished(scene);

/**
 * Faithful completion for a gag's scene group, per FUN_1048_0766: COMPLETE iff no
 * live thread remains and the walking tag has ended.
 * @param {object} state a DgdsRuntime state (reads `scenes` + `adsTagEnded`).
 * @returns {boolean}
 */
export const isGagComplete = (state) => {
    const liveThreads = (state.scenes || []).filter(isLiveThread);
    return state.adsTagEnded === true && liveThreads.length === 0;
};

/**
 * The oracle's per-tick view, for diffing against production. `oracleComplete` is
 * the binary rule; `liveThreads`/`tagEnded` explain WHY (so a divergence report
 * can name the thread that should still be blocking, e.g. a KEEP_GOING ambient).
 */
export const completionView = (state) => {
    const liveThreads = (state.scenes || []).filter(isLiveThread).map((s) => `${s.sceneIdx}:${s.tagId}`);
    const tagEnded = state.adsTagEnded === true;
    return { oracleComplete: tagEnded && liveThreads.length === 0, tagEnded, liveThreads };
};
