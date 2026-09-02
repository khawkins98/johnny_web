#!/usr/bin/env node
/**
 * Coverage-based faithfulness verdict: compare our engine's UNIONED actor
 * vocabulary (build-vocab over many seeds) against the ORIGINAL binary's
 * (build-vocab over many forced captures). This is the RNG-tolerant verdict --
 * with enough coverage on both sides, an actor OUR engine draws that NO original
 * run ever draws is a real divergence (extra body / wrong actor), and a higher
 * max-concurrency (>= +2) is an extra-body signature.
 *
 * Usage: node compare-vocab.mjs --orig <orig-vocab.json> --ours <ours-vocab.json> [--json] [--name <label>]
 *
 * Verdict:
 *   FAITHFUL  - ours.actors ⊆ orig.actors and ours.maxConc <= orig.maxConc + 1
 *   DIVERGENT - ours.maxConc >= orig.maxConc + 2 (extra concurrent body), OR ours
 *               draws actors the original never does AND coverage looks adequate
 *   REVIEW    - ours draws actors the original didn't, but original coverage is
 *               thin (few captures) so it may be an unhit RNG branch -> capture more
 */
import { readFileSync } from 'node:fs';

const arg = (f, d) => {
    const i = process.argv.indexOf(f);
    return i !== -1 ? process.argv[i + 1] : d;
};
const has = (f) => process.argv.includes(f);

const orig = JSON.parse(readFileSync(arg('--orig'), 'utf8'));
const ours = JSON.parse(readFileSync(arg('--ours'), 'utf8'));
const name = arg('--name', '');

const origActors = new Set(orig.actors);
const oursOnly = ours.actors.filter((a) => !origActors.has(a));
const concFlag = ours.maxConc >= orig.maxConc + 2;

// The concurrency flag (ours draws >= 2 more concurrent actors than the original
// EVER does) is the RELIABLE, coverage-INDEPENDENT divergence signal -- it is the
// double-Johnny / extra-body signature and cannot be explained by an unhit RANDOM
// branch (a branch adds ALTERNATE actors, not MORE simultaneous ones).
//
// An actor-vocabulary mismatch (ours draws a slot:tag no original run showed) is
// coverage-DEPENDENT: a single/few forced captures under-cover the gag's RANDOM
// branches (the boot-routine + retry picks), so ours-only actors are usually just
// branches the capture didn't hit. Only trust a vocab mismatch as DIVERGENT once
// the ORIGINAL side has adequate coverage: many independent captures. Distinct
// states within one capture do NOT prove branch coverage (a looped capture racks
// up states while still missing an 11%-weight branch). So gate on capture COUNT.
const ORIG_COVERAGE_MIN = 5; // independent forced captures unioned into orig vocab
const origAdequate = (orig.inputs ?? 1) >= ORIG_COVERAGE_MIN;

let verdict;
if (concFlag) verdict = 'DIVERGENT'; // extra body -- reliable regardless of coverage
else if (oursOnly.length === 0) verdict = 'FAITHFUL'; // ours' vocab ⊆ original's
else if (origAdequate) verdict = 'DIVERGENT'; // ours draws actors NO well-covered original run does
else verdict = 'REVIEW'; // vocab gap, but original coverage too thin -- capture more

const result = {
    name,
    verdict,
    oursOnlyActors: oursOnly,
    origMaxConc: orig.maxConc,
    oursMaxConc: ours.maxConc,
    concurrencyFlag: concFlag,
    origCoverage: { inputs: orig.inputs, states: orig.states, ticks: orig.ticks },
    oursCoverage: { inputs: ours.inputs, states: ours.states, ticks: ours.ticks },
};

if (has('--json')) {
    console.log(JSON.stringify(result));
} else {
    console.log(`${name ? name + ': ' : ''}${verdict}  (maxConc orig=${orig.maxConc} ours=${ours.maxConc}; orig cov ${orig.inputs}cap/${orig.states}states, ours cov ${ours.inputs}seed/${ours.states}states)`);
    if (oursOnly.length) console.log(`  ours-only actors: ${oursOnly.join('  ')}`);
    if (concFlag) console.log(`  !! ours maxConc ${ours.maxConc} >= orig ${orig.maxConc}+2 -- EXTRA BODY candidate`);
}
// non-zero exit on DIVERGENT so a sweep can gate
process.exit(verdict === 'DIVERGENT' ? 1 : 0);
