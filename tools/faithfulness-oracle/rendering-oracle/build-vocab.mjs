#!/usr/bin/env node
/**
 * Build a coverage VOCABULARY from one or more thread-timeline JSONL files
 * (shared format: {"t":i,"live":["slot:tag",...]} per tick). A single run only
 * exercises ONE RNG branch, so the FAITHFUL/DIVERGENT verdict needs the UNION
 * across many runs -- multiple seeds for our engine, multiple forced captures
 * (or one long looped capture) for the original -- to cover the RANDOM branches.
 *
 * Emits JSON:
 *   { "actors": ["slot:tag", ...sorted],   // every actor that EVER drew, unioned
 *     "maxConc": <int>,                      // max concurrent drawing actors over all inputs
 *     "states": <int>,                       // distinct live-sets seen (union)
 *     "inputs": <int>, "ticks": <int> }
 *
 * Usage: node build-vocab.mjs <timeline1.jsonl> [timeline2.jsonl ...]
 *        node build-vocab.mjs --glob '<dir>/*.jsonl'   (shell-expanded paths also fine)
 */
import { readFileSync } from 'node:fs';

const paths = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (paths.length === 0) {
    console.error('usage: build-vocab.mjs <timeline.jsonl> [more.jsonl ...]');
    process.exit(2);
}

const actors = new Set();
const states = new Set();
let maxConc = 0;
let ticks = 0;

for (const p of paths) {
    let text;
    try {
        text = readFileSync(p, 'utf8');
    } catch {
        continue; // tolerate a missing/failed input in a batch
    }
    for (const line of text.trim().split('\n')) {
        if (!line) continue;
        let rec;
        try {
            rec = JSON.parse(line);
        } catch {
            continue;
        }
        const live = (rec.live || []).slice().sort();
        ticks++;
        maxConc = Math.max(maxConc, live.length);
        states.add(live.join(','));
        for (const a of live) actors.add(a);
    }
}

console.log(
    JSON.stringify({
        actors: [...actors].sort((a, b) => {
            const [as, at] = a.split(':').map(Number);
            const [bs, bt] = b.split(':').map(Number);
            return as - bs || at - bt;
        }),
        maxConc,
        states: states.size,
        inputs: paths.length,
        ticks,
    }),
);
