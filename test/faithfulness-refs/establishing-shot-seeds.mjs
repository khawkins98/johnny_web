// Fingerprint-only filter map for the faithfulness gate (test/faithfulness-diff.mjs).
//
// `keys` are "sceneIdx:tagId" strings dropped from OUR engine's fingerprint
// (vocab/maxConc/actorTicks in tools/faithfulness-oracle/fingerprint.mjs), and only
// during their opening appearance. The engine itself runs unchanged.
//
// History: this map used to list 29 gags (ACTIVITY:1/7/8, FISHING:1/2/4/6/7/8,
// JOHNNY:4, STAND:1-12/15/16, SUZY:1/2, VISITOR:1, WALKSTUF:1/2). The theory was that
// the references were captured mid-session, after a one-time
// `IF_NOT_PLAYED[S,X] -> ADD_SCENE(S,X) + ...` establishing shot X had already played.
// Every X key except SUZY's turned out to be a one-frame loader whose PURGE frame has
// zero delay: 1:12 GJDIVE, 4:1 MJREAD, 5:42 MJBATH, 1:1 MJFISH, 4:43 MJFISHC,
// 2:29 SJMSSGE, 1:42 MJAMBWLK, 2:27 MJTELE, 1:44 GJVIS3, 1:1 WOULDBE and 2:9 MJRAFT.
// The original ends such a thread in the tick it is added, so no capture ever shows it
// as a live thread. Once the engine does the same (see PURGE in
// src/dgds/scripting/ttm-opcodes.mjs), filtering those keys changes nothing. The whole-catalogue fingerprints (vocab, maxConc and per-actor ticks, all
// 64 gags) are identical with and without them, so they were removed.
//
// SAFETY RULE (do not violate): list a key here ONLY if filtering it makes the gag's
// maxConc/vocab CONVERGE exactly to the committed reference, with no other unexplained
// divergence masked.
//
// What remains is SUZY:1/2's 3:1 (MEANWHIL "quarky watch", a 49-frame drawing
// animation, not a loader). Each SUZY reference is sliced to a single TTM slot
// (`"slot": "1"` / `"2"` in SUZY_1.json / SUZY_2.json, see gen-refs.mjs), and 3:1 is
// on slot 3, so the reference cannot contain it. Our fingerprint is not slot-sliced,
// so without this entry 3:1 adds one to maxConc.
//
// Keyed by "ADS_NAME:tag" (matches `${ref.name}:${ref.tag}` in faithfulness-diff.mjs).
export const establishingShotSeeds = {
    'SUZY:1': {
        keys: ['3:1'],
        rationale: 'opening IF_NOT_PLAYED[3,1] -> ADD(3,1)+ADD(1,1); 3:1 is on slot 3, outside the ref slice (slot 1)',
    },
    'SUZY:2': {
        keys: ['3:1'],
        rationale: 'same opening IF_NOT_PLAYED[3,1] as SUZY:1; 3:1 is on slot 3, outside the ref slice (slot 2)',
    },
};
