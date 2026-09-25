/**
 * ads-walker.mjs — the original's per-tick ADS interpreter.
 *
 * This is a transliteration of SCRANTIC.SCR segment 1048 (the ADS tick driver
 * and its opcode handlers), hand-disassembled because Ghidra could not recover
 * the opcode jump tables. Addresses below are `1048:xxxx`; see
 * scratchpad/findings/pr19-decomp-verification.md for the method.
 *
 * MODEL (FUN_1048_1acb, the tick):
 *   1. every tag whose flag is 3 (fresh) or 4 (woken by GOSUB) becomes 1 (active)
 *      as the loop reaches it; only flag-1 tags are walked (asm 1acb loop 2);
 *   2. an active tag is walked from its FIRST op to 0xFFFF every tick
 *      (FUN_1048_1925). There is no per-tag resumable program counter: the only
 *      mid-script resume is the WHILE family (0x10x0), which stores its own
 *      address in tag+0x292 (asm 17f8/17fd) and is re-entered there next tick;
 *   3. the TTM node pass runs AFTER the walks in the same tick (dc:14983+), so
 *      the ADS always reads the node states left by the previous tick.
 *
 * The runtime owns step 3 (DgdsRuntime#runTtmController); this module owns 1-2.
 *
 * OPCODES (executor FUN_1048_1519, table 1048:1875 -> handlers at +0x58):
 *   IF family 0x1310-0x13c1 -> 1758: evaluate the condition chain with
 *     FUN_1048_1223; TRUE runs the body with a nested walk that returns at the
 *     body's 0x1510, FALSE skips to the matching 0x1510 (FUN_1048_11db/106b,
 *     nesting-aware); either way execution continues PAST the 0x1510 (asm 1796).
 *   WHILE family 0x1010-0x1080 -> 17a0: TRUE stores the op address as the tag's
 *     resume point, runs the body, then returns null (ends this tick's walk).
 *     FALSE clears the resume point and skips past the 0x1520 (FUN_1048_118a).
 *   0x1510 -> 1588: sets the stop flag [0x460c] so the enclosing walk returns.
 *   0x1520 -> 158a: stop flag + null.        0x1500 -> 1567 (unused in corpus).
 *   0x2005 ADD -> FUN_1048_0db6: arg3==0 -> state 1, >0 -> state 2 (count-1),
 *     <0 -> state 3 (timer); +0x2d++. NO presence check, NO frame reset.
 *   0x2000 -> FUN_1048_0e2e: frame := start, then ADD.   0x2010 STOP -> 0e9b: state 0.
 *   0x2015 -> 0e6e: state 5.   0x2020 -> 0ec8: full node reset.
 *   0x3010 RANDOM -> FUN_1048_0cda: sum the block's weights (FUN_1048_0c8d:
 *     ADD/0x2000 use param 4, 0x3020 param 1, anything else param 3), draw ONE
 *     word, pick = abs(word % total) + 1, walk subtracting weights, execute the
 *     picked op through 1519 unless it is 0x3020; total 0 -> no draw.
 *   0x4000 -> FUN_1048_0f8c (sequence to back).   0x4010 -> 0ef2 (unused).
 *   0xf010 -> 1669: arg -1 = the tag being walked, else look the tag up by id;
 *     set its flag to 2; if it is the current tag return null (abort the walk),
 *     otherwise continue. Nodes are untouched: live TTMs drain on their own.
 *   0xf200 GOSUB -> 16c2: target flag = 4.   0xf210 -> 1709: target flag = 3.
 *   0xf000 -> 1645: current tag flag = 2, null.
 *   0x1420/0x1430/0x3020 reached as statements -> 1642 -> null (they are only
 *     meaningful inside a chain / RANDOM block).
 *
 * CONDITIONS (FUN_1048_1223, table 1048:14bd; `si` = the (slot,tag) node):
 *   0x1330 IF_NOT_PLAYED (1351): !si || si.added == 0     0x1340 (1360): si && added != 0
 *   0x1350 IF_PLAYED     (13bd): si && state == 4  -- a ONE-TICK pulse: state 4 is
 *     set by the node pass when the TTM ends (dc:15009) and cleared back to 0 by
 *     the NEXT node pass (dc:14988), after that tick's walks have seen it.
 *   0x1360 IF_NOT_RUNNING(136f): !si || state == 4 || state == 0
 *   0x1370 IF_RUNNING    (1384): si && state in {1,2,3}   (0x1070 WHILE uses the same)
 *   0x1310 (13ae): state == 5.   0x1320 (139f): !si || state != 5.
 *   0x1080 (132f): tag.whileCount <= param.
 *   Chains (asm 13ca-14a2): strictly left to right, no precedence. TRUE then OR:
 *   set sticky, skip the OR and the next condition unevaluated. TRUE then AND:
 *   clear result, evaluate the next. FALSE then OR: evaluate the next. FALSE then
 *   AND: skip the next condition. Result = result | sticky.
 *
 * COMPLETION (FUN_1048_0766, called by the story driver FUN_1018_06bf after each
 * tick): the gag is over once the tag's flag is neither 1 nor 4 (i.e. its F010
 * ran) AND every node in its list is in state 0 or 4. The runtime applies that
 * rule with `isAdsTagEnded` + its live-thread check.
 *
 * Port mapping of the node table: a node is a `state.scenes` entry keyed by
 * (sceneIdx, tagId). States 1-3 = isTtmRunning, state 4 = isTtmFinished with
 * `playedPulse` (stamped by the runtime's node pass), state 0 = finished without
 * the pulse, or absent. The `+0x2d` "ever ADDed" counter is `state.adsAdded`.
 * Known gap: STOP removes the scene object, so a STOP followed by a later ADD
 * restarts the TTM from its start frame; the binary resumes the frame it was
 * stopped on (0e9b writes only +0x2f).
 */
import { isTtmFinished, isTtmRunning } from './ttm-run-state.mjs';
import { addSceneNode, findSceneNode, resetSceneNode, stopSceneNode } from './ads-scene-changes.mjs';
import { moveSequenceToBack } from './ttm-sequence-order.mjs';
import { verboseLog } from './scripting-log.mjs';

/** Per-tag flag word (tag record +0x12). */
export const TagFlag = Object.freeze({
    IDLE: 0,
    ACTIVE: 1,
    ENDED: 2, // set by F010 / 0xf000
    START: 3, // fresh gag start (FUN_1048_0805 with 3); becomes ACTIVE when the walk loop reaches it
    WOKEN: 4, // GOSUB target (0xf200); becomes ACTIVE when the walk loop reaches it
});

const END = 0xffff;
const END_BRANCH = 0x1510;
const END_WHILE = 0x1520;
const ELSE_MARK = 0x1500;
const RANDOM_END = 0x30ff;
const RANDOM_WEIGHT = 0x3020;
const AND = 0x1420;
const OR = 0x1430;

// Table 1048:1875 rows that dispatch to the IF handler (1758) / WHILE handler (17a0).
const IF_OPS = new Set([
    0x1310, 0x1320, 0x1330, 0x1340, 0x1350, 0x1360, 0x1370, 0x1380, 0x1390, 0x13a0, 0x13a1, 0x13b0, 0x13b1, 0x13c0,
    0x13c1,
]);
const WHILE_OPS = new Set([0x1010, 0x1020, 0x1030, 0x1040, 0x1050, 0x1060, 0x1070, 0x1080]);

const tagIdOf = (scene) => (typeof scene.tagId === 'object' ? scene.tagId?.id : scene.tagId);

/**
 * Build the tag table for one ADS resource. The synthetic 0xfff0 END_IF markers
 * the text parser inserts are dropped: the binary's block structure is carried by
 * 0x1510 alone, and the parser emits its END_IFs BEFORE any indent-0 opcode, which
 * misplaces an F010 that sits inside a body (STAND tags 1-12, ACTIVITY tag 1).
 */
export const createAdsProgram = (data) => ({
    tags: (data?.scenes || []).map((scene, index) => ({
        index,
        id: tagIdOf(scene),
        script: (scene.script || []).filter((op) => op.opcode !== 0xfff0),
        flag: TagFlag.IDLE,
        resumeIp: -1,
        whileCount: 0,
    })),
});

/** Start a gag: every tag idle, the selected one fresh (flag 3). */
export const resetAdsProgram = (program, startIndex) => {
    for (const tag of program.tags) {
        tag.flag = TagFlag.IDLE;
        tag.resumeIp = -1;
        tag.whileCount = 0;
    }
    if (program.tags[startIndex]) program.tags[startIndex].flag = TagFlag.START;
};

/** FUN_1048_0766's flag test: the tag's program is over once it is neither active nor woken. */
export const isAdsTagEnded = (tag) => tag != null && tag.flag !== TagFlag.ACTIVE && tag.flag !== TagFlag.WOKEN;

const findTag = (program, id) => program.tags.find((tag) => tag.id === id);

/**
 * FUN_1048_0c8d: the weight a RANDOM block reads off one of its ops.
 */
const weightOf = (op) => {
    const params = op.params || [];
    let weight;
    if (op.opcode === 0x2000 || op.opcode === 0x2005) weight = params[3];
    else if (op.opcode === RANDOM_WEIGHT) weight = params[0];
    else weight = params[2];
    return Number.isFinite(weight) ? weight : 0;
};

/**
 * One RANDOM draw mapped onto 1..total. `state.faithfulPick` is the binary's
 * lagged-Fibonacci stream (faithful-rng.mjs) producing abs((int16)(word % total)) + 1
 * directly; the fallback keeps the harnesses' seeded-LCG accounting (one draw,
 * floor(random() * total), same cumulative buckets).
 */
export const drawRandomPick = (state, total) => {
    if (typeof state.faithfulPick === 'function') return state.faithfulPick(total);
    if (typeof state.random !== 'function') {
        throw new TypeError('ADS runtime requires an injected random source');
    }
    return Math.floor(state.random() * total) + 1;
};

/**
 * Skip to the 0x1510 that closes the block starting at `ip` (FUN_1048_106b as
 * called from FUN_1048_11db). Nested IF blocks are skipped recursively; a chain
 * (`cond AND cond OR cond ...`) is one IF. Returns the index of the closing
 * 0x1510/0x1500, or -1 at 0xFFFF / end of script (the binary returns null).
 */
export const skipBlock = (script, ip) => {
    let p = ip;
    while (p < script.length) {
        const code = script[p].opcode;
        if (code === END) return -1;
        if (code === END_BRANCH || code === ELSE_MARK) return p;
        if (IF_OPS.has(code)) {
            p = skipChain(script, p);
            if (p < 0) return -1;
            const close = skipBlock(script, p);
            if (close < 0) return -1;
            p = close + 1;
            continue;
        }
        p += 1;
    }
    return -1;
};

/** Advance past a condition chain without evaluating it (the 0303 skips inside 106b/1223). */
const skipChain = (script, ip) => {
    let p = ip + 1;
    while (p < script.length && (script[p].opcode === AND || script[p].opcode === OR)) p += 2;
    return p <= script.length ? p : -1;
};

/** FUN_1048_118a: scan forward to the 0x1520 closing a WHILE body (not nesting-aware). */
const skipToEndWhile = (script, ip) => {
    for (let p = ip; p < script.length; p++) {
        const code = script[p].opcode;
        if (code === END) return -1;
        if (code === END_WHILE) return p;
    }
    return -1;
};

const evalCondition = (ctx, op) => {
    const { state } = ctx;
    const params = op.params || [];
    switch (op.opcode) {
        case 0x1330: // IF_NOT_PLAYED (1351): !si || +0x2d == 0
            return !state.adsAdded?.has(`${params[0]}:${params[1]}`);
        case 0x1340: // (1360): si && +0x2d != 0
            return Boolean(state.adsAdded?.has(`${params[0]}:${params[1]}`));
        case 0x1350: // IF_PLAYED (13bd): state == 4 -- the one-tick completion pulse
        case 0x1050: {
            const scene = findSceneNode(state, params[0], params[1]);
            return scene !== undefined && isTtmFinished(scene) && scene.playedPulse === true;
        }
        case 0x1360: // IF_NOT_RUNNING (136f): !si || state 0 || state 4
        case 0x1060: {
            const scene = findSceneNode(state, params[0], params[1]);
            return scene === undefined || !isTtmRunning(scene);
        }
        case 0x1370: // IF_RUNNING / WHILE_RUNNING (1384): state 1, 2 or 3
        case 0x1070: {
            const scene = findSceneNode(state, params[0], params[1]);
            return scene !== undefined && isTtmRunning(scene);
        }
        case 0x1310: // (13ae): state == 5 (held) -- 0x2015 is never issued, so never true
        case 0x1010:
            return false;
        case 0x1320: // (139f): !si || state != 5
        case 0x1020:
            return true;
        case 0x1080: // (132f): the tag's WHILE iteration count has not passed the operand
            return ctx.tag.whileCount <= params[0];
        default:
            // 0x1380-0x13c1 dispatch to handlers 12af-1311 that read no node; none
            // appear in the shipped ADS files.
            verboseLog(`ADS: unmodelled condition 0x${op.opcode.toString(16)} evaluates false`);
            return false;
    }
};

/**
 * FUN_1048_1223: evaluate the condition chain starting at `ip`.
 * @returns {{ value: boolean, next: number }} `next` = index of the first body op, or -1 on a malformed chain.
 */
export const evalChain = (ctx, ip) => {
    const { script } = ctx.tag;
    let result = false;
    let sticky = false;
    let p = ip;
    for (;;) {
        const op = script[p];
        if (!op) return { value: false, next: -1 };
        result = evalCondition(ctx, op);
        p += 1;
        // asm 13ca-14a2: consume AND/OR tokens
        let evaluateNext = false;
        while (!evaluateNext) {
            const token = script[p]?.opcode;
            if (token === undefined) return { value: false, next: -1 };
            if (token !== AND && token !== OR) return { value: result || sticky, next: p };
            if (result) {
                if (token === OR) {
                    sticky = true; // 140e
                    p += 2; // skip the OR and the next condition, unevaluated
                } else {
                    result = false; // 1433
                    p += 1;
                    evaluateNext = true;
                }
            } else if (token === OR) {
                p += 1; // 145e: evaluate the next condition
                evaluateNext = true;
            } else {
                p += 2; // 1483: AND after false skips the next condition
            }
        }
    }
};

/** FUN_1048_0cda. `ip` = first op inside the block. Returns the index past 0x30ff, or -1. */
const execRandom = (ctx, ip) => {
    const { script } = ctx.tag;
    let total = 0;
    let q = ip;
    while (q < script.length && script[q].opcode !== RANDOM_END) {
        total += weightOf(script[q]);
        q += 1;
    }
    if (q >= script.length) return -1;
    const end = q + 1;
    if (total <= 0) return end;
    let roll = drawRandomPick(ctx.state, total);
    let pick = ip;
    for (;;) {
        roll -= weightOf(script[pick]);
        if (roll < 1 || pick + 1 >= q) break;
        pick += 1;
    }
    if (script[pick].opcode !== RANDOM_WEIGHT) exec(ctx, pick);
    return end;
};

/** F010 handler (asm 1669-16bf). */
const execFadeOut = (ctx, ip) => {
    const { program, tag, state } = ctx;
    const arg = tag.script[ip].params?.[0];
    const target = arg === -1 || arg === undefined ? tag : findTag(program, arg);
    if (target) target.flag = TagFlag.ENDED;
    // Johnny's host owns the between-gag wipes (hostManagedTransitions). Other DGDS
    // hosts keep the port's alpha fade as a cosmetic overlay while the live TTMs
    // drain; it no longer blocks the interpreter (the binary's F010 is instant).
    if (!state.hostManagedTransitions && !state.fadingOut) {
        state.fadingOut = true;
        state.fadeOpacity = 0;
    }
    return target === tag ? -1 : ip + 1;
};

/**
 * FUN_1048_1519: execute the op at `ip`. Returns the index of the next op, or -1
 * where the binary returns null (abort the current walk). Sets `ctx.stop` where the
 * binary sets [0x460c].
 */
const exec = (ctx, ip) => {
    const { state, program, tag } = ctx;
    const { script } = tag;
    const op = script[ip];
    const code = op.opcode;
    const params = op.params || [];

    if (IF_OPS.has(code)) {
        const { value, next } = evalChain(ctx, ip);
        if (next < 0) return -1;
        const close = value ? walk(ctx, next) : skipBlock(script, next);
        return close < 0 ? -1 : close + 1; // asm 1796: past the 0x1510
    }
    if (WHILE_OPS.has(code)) {
        const { value, next } = evalChain(ctx, ip);
        if (next < 0) return -1;
        if (value) {
            tag.whileCount += 1; // +0xb2
            tag.resumeIp = ip; // +0x292/0x294
            walk(ctx, next);
            return -1; // asm 1815: the WHILE ends this tick's walk
        }
        tag.whileCount = 0;
        tag.resumeIp = -1;
        const close = skipToEndWhile(script, next);
        return close < 0 ? -1 : close + 1;
    }

    switch (code) {
        case 0x0001:
        case 0x0005:
            return ip + 1;
        case AND:
        case OR:
        case RANDOM_WEIGHT:
            return -1; // 1642 -> 1869
        case ELSE_MARK: {
            const close = skipBlock(script, ip + 1);
            ctx.stop = true;
            return close;
        }
        case END_BRANCH:
            ctx.stop = true; // 1581: the enclosing walk returns pointing AT the 0x1510
            return ip;
        case END_WHILE:
            ctx.stop = true;
            return -1;
        case 0x2000:
            addSceneNode(state, params[0], params[1], params[2], params[3], { restart: true });
            return ip + 1;
        case 0x2005:
            addSceneNode(state, params[0], params[1], params[2], params[3]);
            return ip + 1;
        case 0x2010:
            stopSceneNode(state, params[0], params[1]);
            return ip + 1;
        case 0x2015:
            verboseLog(`ADS: 0x2015 (hold) ${params[0]}:${params[1]} is not modelled`);
            return ip + 1;
        case 0x2020:
            resetSceneNode(state, params[0], params[1]);
            return ip + 1;
        case 0x3010:
            return execRandom(ctx, ip + 1);
        case 0x4000:
            moveSequenceToBack(state.ttmSequenceOrder, params[0], params[1]);
            return ip + 1;
        case 0x4010:
            return ip + 1;
        case 0xf000:
            tag.flag = TagFlag.ENDED;
            return -1;
        case 0xf010:
            return execFadeOut(ctx, ip);
        case 0xf200: {
            const target = findTag(program, params[0]);
            if (target) target.flag = TagFlag.WOKEN;
            return ip + 1;
        }
        case 0xf210: {
            const target = findTag(program, params[0]);
            if (target) target.flag = TagFlag.START;
            return ip + 1;
        }
        case END:
            return -1;
        default:
            // The executor's table lookup fails -> 1869 -> null.
            verboseLog(`ADS: unknown opcode 0x${code.toString(16)} aborts the walk`);
            return -1;
    }
};

/**
 * FUN_1048_1925: run ops from `ip` until 0xFFFF (returns -1), an abort (-1), or a
 * 0x1510 that set the stop flag (returns that index).
 */
const walk = (ctx, ip) => {
    const { script } = ctx.tag;
    for (;;) {
        if (ip < 0 || ip >= script.length || script[ip].opcode === END) return -1;
        ip = exec(ctx, ip);
        if (ctx.stop) {
            ctx.stop = false; // asm 194a
            return ip;
        }
        if (ip < 0) return -1;
    }
};

/**
 * One tick of FUN_1048_1acb's ADS half: walk every active tag from its top (or its
 * armed WHILE), in file order. Tags a GOSUB wakes earlier in the same pass are
 * walked in this pass if they follow the caller in file order, next pass otherwise.
 */
export const stepAdsProgram = (state, program) => {
    for (const tag of program.tags) {
        if (tag.flag === TagFlag.START || tag.flag === TagFlag.WOKEN) tag.flag = TagFlag.ACTIVE;
        if (tag.flag !== TagFlag.ACTIVE) continue;
        const ctx = { state, program, tag, stop: false };
        walk(ctx, tag.resumeIp >= 0 ? tag.resumeIp : 0);
    }
};
