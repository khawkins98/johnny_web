/**
 * ads-slots.mjs — the binary's per-slot RESUMABLE chunk re-poll model for ADS.
 *
 * ------------------------------------------------------------------------
 * WHAT THIS IS (reverse-engineered from the original DGDS executable)
 * ------------------------------------------------------------------------
 * The original per-tick ADS controller (`FUN_1048_1acb`) does NOT run an ADS
 * tag's script once, top to bottom. Instead, at load it splits the tag's
 * (expanded) bytecode into CHUNKS at their END-branch boundaries
 * (`FUN_1048_04fc`), pre-creating one resumable "thread"/slot per chunk. Then,
 * EVERY tick, it re-walks each active slot's chunk from that slot's own
 * resumable position (`FUN_1048_0c30` -> `FUN_1048_0303`), gated by a per-slot
 * flag.
 *
 * The three semantics that make the fire gags (BUILDING #7 campfire / #8) play
 * faithfully -- and that this module preserves by REUSING the existing opcode
 * callbacks rather than reimplementing them:
 *
 *   1. IF_NOT_RUNNING (0x1360) is evaluated LIVE each tick: while the watched
 *      child is running the guard blocks, so the walk simply parks on it and
 *      re-evaluates next tick (skip-if-running -- NOT a one-time wait-barrier).
 *      The existing IF_NOT_RUNNING callback already sets `state.continue=false`
 *      when the child is running; under this driver "parked" just means
 *      "skip the body this tick, retry from here next tick".
 *   2. RANDOM (0x3010..0x30ff) commits its picked ADD EAGERLY the moment the
 *      block is entered; because the slot's resumable position advances PAST
 *      the RANDOM block, a re-poll resumes AFTER it and never re-picks (which
 *      would spawn a concurrent duplicate -- the "multiple Johnnies" bug).
 *   3. ADD_SCENE dedups on PRESENCE only: adding a (slot,tag) that is already
 *      live is a no-op, so re-polling an already-satisfied chunk never spawns a
 *      duplicate. (This is the existing ADD_SCENE `inScenes` guard.)
 *
 * Completion of a gag is decided ELSEWHERE (the controller's live-thread
 * drain, `FUN_1048_0766`). This module NEVER decides completion -- it only
 * advances the slots one tick.
 *
 * ------------------------------------------------------------------------
 * PUBLIC API
 * ------------------------------------------------------------------------
 *   buildAdsSlots(expandedScript) -> { script, slots }
 *   stepAdsSlots(state, slots, script) -> void   // advance one tick
 *
 * A `slot` is `{ index, chunkStart, chunkEnd, ip, flag }`:
 *   - chunkStart / chunkEnd : inclusive opcode-index bounds of the chunk
 *     (chunkEnd is the chunk's terminating END_BRANCH).
 *   - ip   : the resumable program counter. Starts at chunkStart; parks on a
 *            blocking guard; re-arms to chunkStart when a pass reaches the
 *            terminating END_BRANCH.
 *   - flag : 'fresh' at load, flipped to 'active' the first time it is stepped
 *            (mirrors the binary's per-slot gate at record+0x12). Slots stay
 *            active -- the binary keeps interpreting; the controller drains.
 *
 * This module is intentionally isolated: it is NOT wired into the live driver
 * yet (that is a later task). It reuses `ADSDispatch` + `applySceneChanges`
 * from script-runner so per-opcode behavior stays identical to production.
 */
import { ADSDispatch, applySceneChanges } from './script-runner.mjs';

// The IF-guard opcodes. Only a guard that blocks on a still-playing scene may
// PARK a slot (resume on it next tick to re-poll). Any other opcode that clears
// `state.continue` -- notably ADS_FADE_OUT (0xf010), which the binary treats as
// an end-of-segment marker rather than the port's pausing alpha-fade -- must NOT
// strand the slot mid-chunk (that would leave a terminal chunk's STOPs
// uncommitted and its guard never re-polled); it ends the pass and re-arms.
const GUARD_OPCODES = new Set([0x1330, 0x1350, 0x1360, 0x1370]);

// End-of-branch marker: the boundary the binary splits chunks on. It is also
// the opcode whose callback (END_SCENE_BRANCH) commits a chunk's staged scene
// changes, so a chunk's terminating END_BRANCH doubles as its commit point.
const END_BRANCH = 0x1510;
// Tag terminator.
const END = 0xffff;
// A dispatchable, non-terminator opcode makes a chunk "meaningful". A segment
// that is only branch/if/tag terminators carries no work and is dropped so the
// chunk list lines up with the authored IF-guarded chunk chain.
const TERMINATORS = new Set([END_BRANCH, END, 0xfff0 /* END_IF */]);

const segmentHasWork = (script, start, end) => {
    for (let i = start; i <= end; i++) {
        if (!TERMINATORS.has(script[i].opcode)) return true;
    }
    return false;
};

// ENTRY guards: the opcodes the binary (and jc_reborn's `adsLoad`) bookmarks as
// a slot boundary -- 0x1350 IF_PLAYED, and a LEADING 0x1360 IF_NOT_RUNNING (one
// that precedes the tag's first 0x1350/0x1370). A segment whose leading guard is
// a non-first 0x1330 IF_NOT_PLAYED or 0x1370 IF_RUNNING is NOT bookmarked -- it
// is a FALL-THROUGH continuation of the current slot's branch ladder.
const IF_PLAYED_OP = 0x1350;
const IF_NOT_RUNNING_OP = 0x1360;
const IF_RUNNING_OP = 0x1370;

// The first guard opcode a segment leads with, or null if it carries none.
const leadingGuard = (script, start, end) => {
    for (let i = start; i <= end; i++) {
        if (GUARD_OPCODES.has(script[i].opcode)) return script[i].opcode;
    }
    return null;
};

/**
 * Split a tag's already-expanded ADS script into RESUMABLE slots. The binary does
 * NOT create one independent thread per END_BRANCH: `FUN_1048_04fc` / jc_reborn's
 * `adsLoad` bookmark slot ENTRY POINTS only, and only at an IF_PLAYED (0x1350), a
 * leading IF_NOT_RUNNING (0x1360), or the tag's opening segment. A segment led by
 * a non-first IF_NOT_PLAYED (0x1330) or IF_RUNNING (0x1370) is a FALL-THROUGH arm
 * of the preceding slot's branch ladder, so its opcode range is MERGED into that
 * slot (its `chunkEnd` extends to cover the arm) rather than becoming a new,
 * independently-polled slot. Without the merge a mid-tag IF_NOT_PLAYED arm whose
 * guard is trivially true at tick 1 (FISHING tag 3's octopus "else" arm) fires in
 * parallel with the opening pass, over-drawing the scene (maxConc 4 vs the
 * reference's 2). See scratchpad/findings/ads-branch-model.md.
 *
 * Degenerate segments that contain only terminators (a lone trailing END, or the
 * second of a doubled END_BRANCH left by a nested branch) are dropped -- they
 * carry no work.
 *
 * @param {{opcode:number, params?:number[]}[]} expandedScript
 * @returns {{ script: object[], slots: {index:number, chunkStart:number, chunkEnd:number, ip:number, flag:string}[] }}
 */
export const buildAdsSlots = (expandedScript) => {
    const slots = [];
    let start = 0;
    // jc_reborn `bookmarkingIfNotRunnings`: a 0x1360 is an entry only until the
    // tag's first 0x1350/0x1370 is seen.
    let bookmarking = true;
    let sawFirst = false;
    for (let i = 0; i < expandedScript.length; i++) {
        if (expandedScript[i].opcode !== END_BRANCH) continue;
        if (segmentHasWork(expandedScript, start, i)) {
            const guard = leadingGuard(expandedScript, start, i);
            const isEntry =
                !sawFirst || // the opening pass is always a slot start
                guard === IF_PLAYED_OP ||
                (guard === IF_NOT_RUNNING_OP && bookmarking);
            if (isEntry || slots.length === 0) {
                slots.push({
                    index: slots.length,
                    chunkStart: start,
                    chunkEnd: i,
                    ip: start,
                    flag: 'fresh',
                });
            } else {
                // Fall-through arm: extend the current slot to cover this segment.
                slots[slots.length - 1].chunkEnd = i;
            }
            sawFirst = true;
            if (guard === IF_PLAYED_OP || guard === IF_RUNNING_OP) bookmarking = false;
        }
        start = i + 1;
    }
    return { script: expandedScript, slots };
};

/**
 * Walk ONE chunk from its resumable position once, using the real ADS opcode
 * callbacks. Mirrors runScript's inner loop but bounded to [chunkStart,chunkEnd]
 * and keyed off the slot's own `ip` instead of the single top-level PC:
 *
 *   - a callback that requests a forward jump (a failed guard skipping its
 *     body to the matching END_IF) is honored via `state.jumpTo`;
 *   - a callback that blocks (`state.continue===false`: an IF_PLAYED whose
 *     scene is still playing, or an IF_NOT_RUNNING whose child is running)
 *     PARKS the slot on that opcode and returns -- the walk resumes there next
 *     tick, so RANDOM/ADD opcodes already passed are not re-run;
 *   - reaching the terminating END_BRANCH commits (its END_SCENE_BRANCH
 *     callback runs applySceneChanges) and RE-ARMS the slot to chunkStart so
 *     the next tick re-polls the guard from the top.
 */
const stepChunk = (state, slot, script) => {
    const { chunkStart, chunkEnd } = slot;

    // Each tick a chunk begins with `continue` clear. Transient AND/OR chain
    // state is only meaningful within a single guard evaluation, so reset it
    // when (re)starting from the top; when resuming mid-chunk from a park,
    // leave it so a partially-evaluated chain is preserved.
    state.continue = true;
    if (slot.ip === chunkStart) {
        state.orMode = false;
        state.orChainPassed = false;
    }
    // The IF_PLAYED range scan (chunkBodyHasRandom / next-opcode lookahead)
    // reads state.activeAdsScript; bind it to the script this slot indexes.
    state.activeAdsScript = script;

    // Mirrors jc_reborn's `inSkipBlock`: a fall-through guard (IF_RUNNING /
    // IF_NOT_RUNNING / IF_NOT_PLAYED) whose guard FAILS skips its body; at that
    // branch's END_BRANCH the walk FALLS THROUGH to the next arm of a merged slot
    // instead of ending the pass. A branch actually TAKEN ends the pass. Reset per
    // pass -- parks only occur at the entry guard (chunkStart), so a fresh false at
    // the top of each pass is correct.
    let skip = false;

    for (let i = slot.ip; i <= chunkEnd; i++) {
        const command = script[i];
        const entry = ADSDispatch.find((e) => e.opcode === command.opcode);
        if (!entry) continue;

        state.reentryNow = i;
        state.jumpTo = undefined;
        entry.callback(state, ...(command.params ?? []));

        if (state.jumpTo !== undefined) {
            // Forward jump (failed guard skipping its body). Clamp inside the
            // chunk so a jump can never escape into a sibling chunk.
            const target = Math.min(state.jumpTo, chunkEnd + 1);
            state.jumpTo = undefined;
            if (command.opcode === IF_PLAYED_OP) {
                // A FAILED ENTRY guard (IF_PLAYED false) must END the pass and
                // re-arm -- NOT jump past its END_IF and walk into a merged slot's
                // fall-through tail (which would fire the ladder's "else" arm before
                // its entry scene has played -- the FISHING:3 over-draw). The entry
                // re-polls from the top next tick.
                slot.ip = chunkStart;
                return;
            }
            // A failed fall-through guard marks a skip: fall through at its END_BRANCH.
            skip = true;
            i = target - 1; // the loop's i++ lands on `target`
            continue;
        }

        if (!state.continue) {
            if (GUARD_OPCODES.has(command.opcode)) {
                // A guard (IF_PLAYED on a still-playing scene) blocks: park here
                // and re-poll from this opcode next tick, so RANDOM/ADD opcodes
                // already passed are not re-run.
                slot.ip = i;
                return;
            }
            // A non-guard block (ADS_FADE_OUT): the binary's F010 is an
            // end-of-segment marker, not a pause. End this pass and re-arm so the
            // chunk's guard re-polls next tick; any changes staged this pass
            // (e.g. the terminal chunk's STOPs) flush at end of tick.
            slot.ip = chunkStart;
            return;
        }

        // An INTRA-slot END_BRANCH (a merged slot's inner branch boundary): its
        // END_SCENE_BRANCH callback just committed this arm's staged changes. If the
        // arm was SKIPPED (a failed fall-through guard) continue to the next arm;
        // if it was TAKEN, end the pass and re-arm. The slot's FINAL END_BRANCH
        // (i === chunkEnd) always ends the pass via the loop exit below.
        if (command.opcode === END_BRANCH && i < chunkEnd) {
            if (skip) {
                skip = false;
            } else {
                slot.ip = chunkStart;
                return;
            }
        }
    }

    // Pass reached the chunk's END_BRANCH: its END_SCENE_BRANCH callback has
    // already committed the staged changes. Re-arm to the top so the binary's
    // "keep interpreting every tick" property holds -- ADD's presence-dedup
    // makes a re-poll of an already-satisfied chunk a no-op.
    slot.ip = chunkStart;
};

/**
 * Advance the ADS driver ONE tick: re-walk every active slot's chunk once from
 * its resumable position. Does NOT decide gag completion.
 *
 * @param {object} state  the ADS runtime state (scenes/addScenes/removeScenes/
 *                        scenesRandom/playedHistory, random source, etc.)
 * @param {ReturnType<typeof buildAdsSlots>['slots']} slots
 * @param {object[]} script  the expanded script the slots index into
 */
export const stepAdsSlots = (state, slots, script) => {
    for (const slot of slots) {
        if (slot.flag === 'fresh') slot.flag = 'active';
        if (slot.flag !== 'active') continue;
        stepChunk(state, slot, script);
    }
    // A final safety flush: if any chunk parked with residual staged changes
    // the blocking callback did not itself commit, make them visible now. In
    // practice guards block before their bodies stage anything, so this is a
    // no-op on real chunks -- but it keeps the "changes never linger past a
    // tick" invariant regardless of chunk shape.
    if (state.addScenes?.length || state.removeScenes?.length) {
        applySceneChanges(state);
    }
};
