// Fingerprint-only filter map for the faithfulness gate (test/faithfulness-diff.mjs).
//
// `keys` are "sceneIdx:tagId" strings dropped from OUR engine's fingerprint
// (vocab/maxConc/actorTicks in tools/faithfulness-oracle/fingerprint.mjs), and only
// during their opening appearance. The engine itself runs unchanged.
//
// The map is empty. History:
// - It used to list 29 gags (ACTIVITY:1/7/8, FISHING:1/2/4/6/7/8, JOHNNY:4,
//   STAND:1-12/15/16, SUZY:1/2, VISITOR:1, WALKSTUF:1/2). The theory was that the
//   references were captured mid-session, after a one-time
//   `IF_NOT_PLAYED[S,X] -> ADD_SCENE(S,X) + ...` establishing shot X had already played.
// - Every X key except SUZY's turned out to be a one-frame loader whose PURGE frame has
//   zero delay. The original ends such a thread in the tick it is added, and once the
//   engine did the same (PURGE in src/dgds/scripting/ttm-opcodes.mjs) those entries
//   changed nothing and were removed.
// - SUZY:1/2's 3:1 (MEANWHIL) stayed because references were sliced to one TTM slot and
//   3:1 is on slot 3. References now cover every slot of the gag's ADS (#25, gen-refs.mjs),
//   and the all-slot SUZY references do contain 3:1 at peak concurrency 2. So the last
//   entries were removed too. The mid-session theory was wrong for SUZY as well: a
//   forced capture reloads the ADS, so its IF_NOT_PLAYED guard is always open.
//
// SAFETY RULE (do not violate): list a key here ONLY if filtering it makes the gag's
// maxConc/vocab CONVERGE exactly to the committed reference, with no other unexplained
// divergence masked.
//
// Keyed by "ADS_NAME:tag" (matches `${ref.name}:${ref.tag}` in faithfulness-diff.mjs).
export const establishingShotSeeds = {};
