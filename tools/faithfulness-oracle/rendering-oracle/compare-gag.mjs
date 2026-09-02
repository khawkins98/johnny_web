#!/usr/bin/env node
// Differential behavioral-arc comparison: original binary vs our engine, for
// ONE ADS gag. Finds gags that COMPLETE in both engines but render/sequence
// differently -- the blanket completion-only sweep is blind to this class of
// bug because "did it finish" says nothing about "did it look/act the same".
//
// THE SIGNAL (deliberately coarse, NOT pixel-exact -- see caveats below):
//
//   ORIGINAL side: actor-timeline.mjs's changed-pixel-count-in-island-box
//   arc, read from a capture-gag.sh capture dir. {frames, firstActive,
//   lastActive, peakFrame, clearedAt}.
//
//   OUR-ENGINE side: drive the same gag with drive-gag.mjs's driveGag() (the
//   real single-gag completion path) and, once per tick, count how many
//   entries in runtime.state.scenes are "drawing" -- i.e. not yet
//   isTtmFinished(), OR finished-but-not-yet-aged-out (agedOut === false;
//   composeTtmFrame still paints its held last frame for one more tick, so
//   it is still visually present). This yields the analogous
//   {ticks, firstActive, lastActive, peakTick, peakCount, clearedAt} arc.
//
// Both sides are normalized to a fraction-of-active-window peak position (0
// = peak right at gag start, 1 = peak right at the end) so the frame-rate vs
// tick-rate mismatch between the two engines drops out of the comparison.
//
// CAVEATS (read before trusting a verdict):
//  - Pixel-count and actor-count measure genuinely different things. A
//    "peak" in changed-pixels is a moment of maximum VISUAL motion; a
//    "peak" in drawing-actor-count is a moment where multiple TTM scene
//    instances are simultaneously non-finished, which happens routinely for
//    1-2 ticks during a scene handoff even when nothing has gone wrong. Do
//    not read exact numeric equality into this: only GROSS divergence
//    (very different active-length ratio, no-clear vs clear, a SUSTAINED
//    peak-count > 1) is meaningful signal.
//  - force-gag.py's weight=127 patch makes the forced gag get re-selected by
//    the scene director indefinitely, so BOTH sides tend to loop rather than
//    play once and go idle. Neither side may show a single clean
//    build->act->clear arc; this tool reports the FIRST active window found
//    and flags when a clear was never observed (which can be an artifact of
//    the forced loop, not a real bug -- see the report for how this played
//    out on BUILDING #7).
//  - This is a coarse first-pass filter for the completion-only sweep, not a
//    replacement for a frame-exact / thread-list trace diff. See the
//    tool's report for a recommendation on whether it is decisive enough to
//    run at catalogue scale.
//
// Usage:
//   node compare-gag.mjs <adsId-hex> <tag> <capturedir> [adsName] [maxTicks]
//
//   adsId-hex   e.g. 0x66 (BUILDING) -- see ADS_ID_NAME below / force-gag.py
//   tag         ADS tag / gag number, e.g. 7
//   capturedir  a capture-gag.sh output dir (fb_*.ppm already captured)
//   adsName     override the ADS resource name (default: looked up from
//               adsId-hex via ADS_ID_NAME + ".ADS")
//   maxTicks    tick budget for driving our engine (default 2000; the forced
//               gag typically loops and will not naturally "complete")
//
// Example:
//   node compare-gag.mjs 0x66 7 $SP/fb-campfire7b

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const ADS_ID_NAME = {
    0x65: 'ACTIVITY',
    0x66: 'BUILDING',
    0x68: 'FISHING',
    0x69: 'JOHNNY',
    0x6a: 'MARY',
    0x6c: 'STAND',
    0x6d: 'SUZY',
    0x6e: 'VISITOR',
    0x6f: 'WALKSTUF',
};

function normalizeArc({ length, firstActive, lastActive, peakIndex, clearedAt }) {
    if (firstActive === -1) {
        return { length, hasActivity: false, activeLen: 0, peakPosition: null, clears: false };
    }
    const activeLen = lastActive - firstActive + 1;
    const peakPosition = activeLen > 0 ? (peakIndex - firstActive) / Math.max(1, activeLen - 1) : null;
    return {
        length,
        hasActivity: true,
        firstActive,
        lastActive,
        activeLen,
        peakIndex,
        peakPosition,
        clears: clearedAt !== -1,
        clearedAt,
    };
}

function getOriginalArc(captureDir) {
    const out = execFileSync('node', [path.join(SCRIPT_DIR, 'actor-timeline.mjs'), captureDir], {
        encoding: 'utf8',
    });
    const raw = JSON.parse(out);
    return {
        raw,
        arc: normalizeArc({
            length: raw.frames,
            firstActive: raw.firstActive,
            lastActive: raw.lastActive,
            peakIndex: raw.peakFrame,
            clearedAt: raw.clearedAt,
        }),
    };
}

async function getOursArc(adsName, tag, maxTicks) {
    const { driveGag } = await import('../../../src/dgds/scripting/__tests__/support/drive-gag.mjs');
    const { isTtmFinished } = await import('../../../src/dgds/scripting/ttm-run-state.mjs');

    const counts = [];
    const result = driveGag({
        adsName,
        tag,
        maxTicks,
        onTick: (runtime) => {
            const drawing = runtime.state.scenes.filter((s) => !isTtmFinished(s) || s.agedOut === false).length;
            counts.push(drawing);
        },
    });

    let firstActive = -1;
    let lastActive = -1;
    let peakIndex = -1;
    let peakVal = -1;
    for (let i = 0; i < counts.length; i++) {
        if (counts[i] >= 1) {
            if (firstActive === -1) firstActive = i;
            lastActive = i;
        }
        if (counts[i] > peakVal) {
            peakVal = counts[i];
            peakIndex = i;
        }
    }
    let clearedAt = -1;
    if (lastActive !== -1) {
        for (let i = lastActive + 1; i < counts.length; i++) {
            if (counts[i] === 0) {
                clearedAt = i;
                break;
            }
        }
    }

    // Sustained peak > 1: count the longest run of consecutive ticks with
    // count > 1. A 1-2 tick blip during a scene handoff is normal; a long
    // run is the "possible extra body" flag.
    let longestOverlapRun = 0;
    let run = 0;
    for (const c of counts) {
        if (c > 1) {
            run++;
            longestOverlapRun = Math.max(longestOverlapRun, run);
        } else {
            run = 0;
        }
    }

    return {
        raw: { ticks: counts.length, completed: result.completed, peakCount: peakVal, longestOverlapRun },
        arc: normalizeArc({ length: counts.length, firstActive, lastActive, peakIndex, clearedAt }),
    };
}

function verdict(orig, ours, oursRaw) {
    const flags = [];

    if (!orig.hasActivity && !ours.hasActivity) {
        flags.push('neither side shows activity in box/scenes -- cannot confirm the gag ran at all');
        return { verdict: 'DIVERGENT', flags };
    }
    if (orig.hasActivity !== ours.hasActivity) {
        flags.push(`activity mismatch: original hasActivity=${orig.hasActivity}, ours=${ours.hasActivity}`);
        return { verdict: 'DIVERGENT', flags };
    }

    // Peak-position delta (both normalized 0..1 across their own active window).
    let peakDelta = null;
    if (orig.peakPosition != null && ours.peakPosition != null) {
        peakDelta = Math.abs(orig.peakPosition - ours.peakPosition);
        if (peakDelta > 0.4) flags.push(`peak-position delta ${peakDelta.toFixed(2)} (>0.4) -- gag's "moment of most action" lands in a different part of the arc`);
    }

    // Clear-behavior: forgiving, since the forced weight=127 loop can hide a
    // clean clear on either side -- flag only a mismatch, not "never clears"
    // on both.
    if (orig.clears !== ours.clears) {
        flags.push(`clear-behavior mismatch: original clears=${orig.clears}, ours clears=${ours.clears} (may be a forced-loop artifact -- see report)`);
    }

    if (oursRaw.longestOverlapRun > 5) {
        flags.push(`sustained drawing-actor overlap: ${oursRaw.longestOverlapRun} consecutive ticks with >1 drawing scene (peak count ${oursRaw.peakCount}) -- possible extra body / duplicate actor`);
    }

    let v;
    if (flags.length === 0) v = 'MATCH';
    else if (flags.some((f) => f.includes('extra body') || f.includes('activity mismatch'))) v = 'DIVERGENT';
    else v = 'MINOR-SHIFT';

    return { verdict: v, flags, peakDelta };
}

async function main() {
    const [adsHex, tagStr, captureDir, adsNameArg, maxTicksArg] = process.argv.slice(2);
    if (!adsHex || !tagStr || !captureDir) {
        console.error('usage: node compare-gag.mjs <adsId-hex> <tag> <capturedir> [adsName] [maxTicks]');
        process.exit(1);
    }
    const adsId = parseInt(adsHex, 16);
    const tag = parseInt(tagStr, 10);
    const adsName = adsNameArg || `${ADS_ID_NAME[adsId]}.ADS`;
    const maxTicks = maxTicksArg ? parseInt(maxTicksArg, 10) : 2000;

    if (!adsName || adsName === 'undefined.ADS') {
        console.error(`no ADS_ID_NAME entry for 0x${adsId.toString(16)} -- pass adsName explicitly`);
        process.exit(1);
    }

    console.log(`== comparing adsId=0x${adsId.toString(16)} tag=${tag} (${adsName}) ==`);
    console.log(`original capture: ${captureDir}`);

    const { raw: origRaw, arc: origArc } = getOriginalArc(captureDir);
    const { raw: oursRaw, arc: oursArc } = await getOursArc(adsName, tag, maxTicks);

    console.log('\n-- original (pixel-change-in-box, frames) --');
    console.log(JSON.stringify(origRaw));
    console.log('normalized:', JSON.stringify(origArc));

    console.log('\n-- ours (drawing-actor-count, ticks) --');
    console.log(JSON.stringify(oursRaw));
    console.log('normalized:', JSON.stringify(oursArc));

    const { verdict: v, flags, peakDelta } = verdict(origArc, oursArc, oursRaw);

    console.log('\n-- diff --');
    console.log(`active-len: original=${origArc.activeLen}/${origArc.length} frames, ours=${oursArc.activeLen}/${oursArc.length} ticks (different units -- not directly comparable in absolute terms)`);
    if (peakDelta != null) console.log(`peak-position delta: ${peakDelta.toFixed(3)} (orig=${origArc.peakPosition?.toFixed(3)}, ours=${oursArc.peakPosition?.toFixed(3)})`);
    console.log(`clears: original=${origArc.clears}, ours=${oursArc.clears}`);
    console.log(`ours peak drawing-actor count: ${oursRaw.peakCount} (longest sustained overlap run: ${oursRaw.longestOverlapRun} ticks)`);

    console.log(`\nVERDICT: ${v}`);
    for (const f of flags) console.log(`  - ${f}`);
    if (flags.length === 0) console.log('  (no divergence flags raised)');
}

main();
