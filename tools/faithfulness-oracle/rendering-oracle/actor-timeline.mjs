#!/usr/bin/env node
// Coarse actor-presence timeline from a capture-gag.sh capture directory.
//
// Purpose: a render-position-tolerant, pixel-cheap BEHAVIORAL signature for
// comparing our engine's playback of a gag against the original's captured
// frames -- "when does the actor/prop build up, when is it doing its thing,
// when does it clear" -- without needing frame-exact pixel alignment (see
// mask-diff.mjs/rank.mjs for the exact-pixel comparison path; this is the
// cheaper first-pass check: does the SHAPE of the arc match at all).
//
// Method: read every fb_*.ppm (P6, 640x480) in the capture dir, take a
// static baseline frame from the middle of the burst (50% index -- for a
// build->action->clear arc the midpoint is very likely to be far from
// t=0/steady-state and gives a reasonably "busy" reference to diff against;
// this is a coarse heuristic, not a true empty-scene background), and count
// how many pixels differ from that baseline *inside the island action box*
// (x in [100,360), y in [110,250) -- the on-screen region where Johnny/props
// actually act out gags, calibrated against the campfire capture). A frame
// is "active" when more than 40 pixels in the box differ from baseline;
// "cleared" is the first active-window frame afterward with fewer than 5
// changed pixels.
//
// Usage: node actor-timeline.mjs <capturedir>
// Output: JSON { frames, firstActive, lastActive, peakFrame, clearedAt }

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readPPM } from './ppm-lib.mjs';

const BOX = { x0: 100, x1: 360, y0: 110, y1: 250 };
const ACTIVE_THRESHOLD = 40; // changed px in box to call a frame "active"
const CLEAR_THRESHOLD = 5; // changed px in box to call a frame "cleared"
const CHANNEL_TOL = 16;

function countChangedInBox(frame, baseline) {
    const { w, data } = frame;
    let n = 0;
    for (let y = BOX.y0; y < BOX.y1; y++) {
        for (let x = BOX.x0; x < BOX.x1; x++) {
            const i = y * w + x;
            const dr = Math.abs(data[i * 3] - baseline.data[i * 3]);
            const dg = Math.abs(data[i * 3 + 1] - baseline.data[i * 3 + 1]);
            const db = Math.abs(data[i * 3 + 2] - baseline.data[i * 3 + 2]);
            if (Math.max(dr, dg, db) > CHANNEL_TOL) n++;
        }
    }
    return n;
}

function main() {
    const dir = process.argv[2];
    if (!dir) {
        console.error('usage: node actor-timeline.mjs <capturedir>');
        process.exit(1);
    }

    const files = readdirSync(dir)
        .filter((f) => f.startsWith('fb_') && f.endsWith('.ppm'))
        .sort();
    if (files.length === 0) {
        console.error(`no fb_*.ppm frames found in ${dir}`);
        process.exit(1);
    }

    const paths = files.map((f) => path.join(dir, f));
    const baselineIdx = Math.floor(paths.length * 0.5);
    const baseline = readPPM(paths[baselineIdx]);

    const changed = new Array(paths.length).fill(0);
    for (let i = 0; i < paths.length; i++) {
        let frame;
        try {
            frame = readPPM(paths[i]);
        } catch {
            changed[i] = 0;
            continue;
        }
        changed[i] = countChangedInBox(frame, baseline);
    }

    let firstActive = -1;
    let lastActive = -1;
    let peakFrame = -1;
    let peakVal = -1;
    for (let i = 0; i < changed.length; i++) {
        if (changed[i] > ACTIVE_THRESHOLD) {
            if (firstActive === -1) firstActive = i;
            lastActive = i;
        }
        if (changed[i] > peakVal) {
            peakVal = changed[i];
            peakFrame = i;
        }
    }

    let clearedAt = -1;
    if (lastActive !== -1) {
        for (let i = lastActive + 1; i < changed.length; i++) {
            if (changed[i] < CLEAR_THRESHOLD) {
                clearedAt = i;
                break;
            }
        }
    }

    const result = {
        frames: paths.length,
        firstActive,
        lastActive,
        peakFrame,
        clearedAt,
    };
    console.log(JSON.stringify(result, null, 2));
}

main();
