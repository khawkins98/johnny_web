// Establishing-shot seed map for the faithfulness gate (test/faithfulness-diff.mjs).
//
// Root cause (see scratchpad/findings/plusone-underrun-rootcause.md and
// scratchpad/findings/establishing-shot-seedmap.md, not committed -- proprietary
// investigation notes; this file is the durable, committed distillation): many ADS
// gags open with a one-time `IF_NOT_PLAYED[S,X] -> ADD_SCENE(S,X) + ...`
// "establishing shot" for a location, keyed on `state.playedHistory`. driveGag()
// (src/dgds/scripting/__tests__/support/drive-gag.mjs) builds a FRESH runtime with
// EMPTY playedHistory for every single gag capture, so that guard is always false
// and the one-time shot fires every time, alongside the gag's real first actor --
// inflating our maxConc by exactly 1 over the reference. The original-binary
// reference fingerprints were captured mid-session, after that location's shot had
// already played once (from an earlier gag/tag visit), so it structurally can
// never appear in a reference capture for these tags again. This is a TEST-HARNESS
// coverage asymmetry, not an engine bug -- proven structural: refs regenerated at
// N=8 runs, 0/19 affected gags collapsed.
//
// IMPLEMENTATION NOTE: the obvious fix -- pre-seed `state.playedHistory` with the
// establishing key so `IF_NOT_PLAYED` reads "played" from tick 1 -- was tried
// first and is UNSAFE: in every gag checked, the establishing shot's ADD_SCENE
// and the gag's real first actor's ADD_SCENE are emitted by the SAME guarded
// branch (e.g. ACTIVITY tag 1's expanded bytecode is
// `IF_NOT_PLAYED[1,12] -> ADD_SCENE(1,12) + ADD_SCENE(1,13)`), so pre-seeding
// playedHistory skips the whole branch and the gag never runs at all (verified:
// this produced "zero live ticks -- gag did not run" for 15 of these 17 gags).
// Instead, `keys` here are "sceneIdx:tagId" strings dropped from the OUR-ENGINE
// FINGERPRINT ONLY (vocab/maxConc/actorTicks in
// tools/faithfulness-oracle/fingerprint.mjs), every tick, with the engine itself
// left completely untouched -- driveGag runs unseeded exactly as before. This is
// verified behaviorally equivalent to "the reference capture started after the
// establishing shot's overlap already ended": the establishing key and the real
// actor genuinely co-occur only for a short initial window (e.g. ACTIVITY:1's
// 1:12/1:13 overlap is ticks 1-5 of a 5000-tick run, then 1:12 drops out and
// 1:13 continues alone for the rest), so filtering the key from the fingerprint
// reproduces exactly what a mid-session binary capture would have shown, without
// requiring the engine to actually believe the shot "played" before it ran. Only
// the gags this file lists get filtered; everything else is unaffected
// (byte-identical to before this map existed).
//
// SAFETY RULE (do not violate): a key is listed here ONLY if filtering it out of
// the fingerprint makes the gag's maxConc/vocab CONVERGE exactly to the
// committed reference, with no other unexplained divergence masked. Two gags in
// the original 19-gag OVER+1 survey failed that check and are deliberately NOT
// listed:
//   - ACTIVITY:11 -- filtering its own guard (5:20) still leaves maxConc=4 vs ref=5;
//     a second, unrelated actor (5:42, itself ANOTHER tag's (ACTIVITY:8) guard) is
//     also missing from the ref vocab. Two unexplained divergences, not a single
//     establishing-shot artifact -- left as documented OVER+1.
//   - JOHNNY:6 -- its maxConc-2 peak ({3:3,3:9} at tick 125) doesn't even involve
//     its own establishing shot (4:1); 3:9 has no IF_NOT_PLAYED guard anywhere in
//     JOHNNY.ADS. Not an establishing-shot artifact at all -- left as documented
//     OVER+1 (candidate for the same divergence class as the BUILDING:2
//     controller-ordering bug; see plusone-underrun-rootcause.md).
//
// Keyed by "ADS_NAME:tag" (matches `${ref.name}:${ref.tag}` in faithfulness-diff.mjs).
export const establishingShotSeeds = {
    'ACTIVITY:1': {
        keys: ['1:12'],
        rationale: 'opening IF_NOT_PLAYED[1,12] -> ADD(1,12)+ADD(1,13); 1:12 is the one-time establishing shot',
    },
    'ACTIVITY:7': {
        keys: ['4:1'],
        rationale: 'opening IF_NOT_PLAYED[4,1] -> ADD(4,1)+ADD(4,110); 4:1 is the one-time establishing shot',
    },
    'ACTIVITY:8': {
        keys: ['5:42'],
        rationale: 'opening IF_NOT_PLAYED[5,42] -> ADD(5,42)+ADD(5,3)+ADD(5,19); 5:42 is the one-time establishing shot',
    },
    'FISHING:1': {
        keys: ['1:1'],
        rationale: 'opening IF_NOT_PLAYED[1,1] -> ADD(1,1)+ADD(1,18); 1:1 is the one-time establishing shot',
    },
    'FISHING:2': {
        keys: ['1:1'],
        rationale: 'same location-establishing shot as FISHING:1 (shared opening IF_NOT_PLAYED[1,1])',
    },
    'FISHING:4': {
        keys: ['4:43'],
        rationale: 'opening IF_NOT_PLAYED[4,43] -> ADD(4,43)+ADD(4,17); 4:43 is the one-time establishing shot',
    },
    'FISHING:6': {
        keys: ['1:1'],
        rationale: 'same location-establishing shot as FISHING:1/2 (shared opening IF_NOT_PLAYED[1,1])',
    },
    'FISHING:7': {
        keys: ['4:43'],
        rationale: 'same location-establishing shot as FISHING:4 (shared opening IF_NOT_PLAYED[4,43])',
    },
    'FISHING:8': {
        keys: ['4:43'],
        rationale: 'same location-establishing shot as FISHING:4/7 (shared opening IF_NOT_PLAYED[4,43])',
    },
    'JOHNNY:4': {
        keys: ['2:29'],
        rationale: 'opening IF_NOT_PLAYED[2,29] -> ADD(2,29)+ADD(2,36); 2:29 is the one-time establishing shot',
    },
    // STAND:1-12 open with RUN_SCRIPT 14 ("STAND INIT"): IF_NOT_PLAYED[1,42] ->
    // ADD(1,42), a one-time MJAMBWLK loader that overlaps the first pose for ticks
    // 1-5 only, then drops out. Absent from every STAND_1..12 ref (mid-session
    // capture). Filtering it converges maxConc to the ref's 1; pose vocab is left
    // unfiltered (STAND:1's 1:1 and STAND:12's 1:64 stay visible as `extra`: authored
    // RANDOM picks the 3-run ref union did not happen to roll).
    ...Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((tag) => [
            `STAND:${tag}`,
            {
                keys: ['1:42'],
                rationale: 'inlined STAND INIT IF_NOT_PLAYED[1,42] -> ADD(1,42); 1:42 is the one-time loader shot',
            },
        ]),
    ),
    'STAND:15': {
        keys: ['2:27'],
        rationale: 'opening IF_NOT_PLAYED[2,27] -> ADD(2,27)+ADD(2,12); 2:27 is the one-time establishing shot',
    },
    'STAND:16': {
        keys: ['2:27'],
        rationale: 'same location-establishing shot as STAND:15 (shared opening IF_NOT_PLAYED[2,27])',
    },
    'SUZY:1': {
        keys: ['3:1'],
        rationale: 'opening IF_NOT_PLAYED[3,1] -> ADD(3,1)+ADD(1,1); 3:1 is the one-time establishing shot',
    },
    'SUZY:2': {
        keys: ['3:1'],
        rationale: 'same location-establishing shot as SUZY:1 (shared opening IF_NOT_PLAYED[3,1])',
    },
    'VISITOR:1': {
        keys: ['1:44'],
        rationale: 'opening IF_NOT_PLAYED[1,44] -> ADD(1,44)+ADD(1,52); 1:44 is the one-time establishing shot',
    },
    'WALKSTUF:1': {
        keys: ['1:1'],
        rationale: 'opening IF_NOT_PLAYED[1,1] -> ADD(1,1)+ADD(1,2)+ADD(1,4) (3-way add); 1:1 is the one-time establishing shot',
    },
    'WALKSTUF:2': {
        keys: ['2:9'],
        rationale: 'opening IF_NOT_PLAYED[2,9] -> ADD(2,9)+ADD(2,3); 2:9 is the one-time establishing shot',
    },
};
