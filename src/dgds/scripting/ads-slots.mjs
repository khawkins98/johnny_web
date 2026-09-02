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

/**
 * Split a tag's already-expanded ADS script into chunks at each END_BRANCH
 * (0x1510) boundary -- the binary's `FUN_1048_04fc` load-time split. Each chunk
 * spans from the opcode after the previous boundary through its own terminating
 * END_BRANCH (inclusive). Degenerate segments that contain only terminators
 * (e.g. a lone trailing END, or the second of a doubled END_BRANCH left by a
 * nested branch) are dropped -- they carry no work.
 *
 * @param {{opcode:number, params?:number[]}[]} expandedScript
 * @returns {{ script: object[], slots: {index:number, chunkStart:number, chunkEnd:number, ip:number, flag:string}[] }}
 */
export const buildAdsSlots = (expandedScript) => {
    const slots = [];
    let start = 0;
    for (let i = 0; i < expandedScript.length; i++) {
        if (expandedScript[i].opcode !== END_BRANCH) continue;
        if (segmentHasWork(expandedScript, start, i)) {
            slots.push({
                index: slots.length,
                chunkStart: start,
                chunkEnd: i,
                ip: start,
                flag: 'fresh',
            });
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
            i = target - 1; // the loop's i++ lands on `target`
            continue;
        }

        if (!state.continue) {
            // Blocked: park here and retry from this opcode next tick. Staged
            // scene changes (if any) have already been committed by the
            // blocking callback where the binary would (IF_NOT_RUNNING flushes
            // a pending add before it waits); nothing else is left dangling
            // because a guard blocks before its body's ADDs run.
            slot.ip = i;
            return;
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
