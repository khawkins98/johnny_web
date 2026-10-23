#!/usr/bin/env node
// normal-play-report.mjs -- from a directory of normal-play captures
// (capture-normal-play.mjs runs), write the committable summaries and refresh the
// "Normal play" section of docs/oracle-coverage.md:
//
//   normal-play-batches.json  every planned batch of every run: names, ticks, flags
//                             (no pixels, no game data), plus the story-mix markdown
//   normal-play-scores.json   host-canvas scores per batch (host-check.mjs)
//
// Usage:
//   node normal-play-report.mjs <runsDir> [--frames 12] [--dump dir] [--no-host]
//        [--only-turbo-mix]
//
// Runs whose summary.json says `turbo: true` count for the story mix only (their
// pacing is not the original's), never for the host canvas.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkRun, hasData, loadRun } from './host-check.mjs';
import { renderHostScores, renderStoryMix, storyMix } from './normal-play.mjs';
import { NP_BATCHES_PATH, NP_SCORES_PATH, replacePixelSection } from './report.mjs';

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

/** Load every run under `root` (a directory with host.log counts as a run). */
export const loadRuns = (root) => {
    const dirs = existsSync(path.join(root, 'host.log'))
        ? [root]
        : readdirSync(root)
              .map((d) => path.join(root, d))
              .filter((d) => existsSync(path.join(d, 'host.log')))
              .sort();
    return dirs.map((dir) => {
        const run = loadRun(dir);
        const summaryPath = path.join(dir, 'summary.json');
        const summary = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : {};
        return { ...run, summary };
    });
};

/** The compact, committable batch record of one run. */
export const compactRun = (run) => ({
    name: run.name,
    settings: {
        secs: run.summary.secs ?? null,
        turbo: Boolean(run.summary.turbo),
        startTime: run.summary.startTime ?? 900,
        storyDay: run.summary.storyDay ?? null,
        dosTime: run.summary.dosTime ?? null,
        dosDate: run.summary.dosDate ?? null,
    },
    ticks: run.ticks,
    dumps: run.frames.size,
    batches: run.batches.map((b) => ({
        startTick: b.startTick,
        endTick: b.endTick,
        clk: b.clk,
        day: b.day,
        dayCur: b.dayCur,
        phase: b.phase,
        night: b.night,
        forcedNight: b.forcedNight,
        lowTide: b.lowTide,
        wavesOff: b.wavesOff,
        offIsland: b.offIsland,
        layout: b.layout,
        layoutBits: b.layoutBits,
        layer0: { x: b.origin.x + 289, y: b.origin.y + 279 },
        holiday: b.holiday,
        complete: b.complete,
        queue: b.queue,
        gags: b.gags.map((g) => ({ key: g.key, startTick: g.startTick, clk: g.clk })),
    })),
});

if (isMain) {
    const argv = process.argv.slice(2);
    const flag = (f, d) => {
        const i = argv.indexOf(f);
        return i === -1 ? d : argv[i + 1];
    };
    const target = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
    if (!target) {
        console.error('usage: normal-play-report.mjs <runsDir> [--frames 12] [--dump dir] [--no-host]');
        process.exit(2);
    }
    if (!hasData) {
        console.log('# no game data (public/data) -- nothing to report');
        process.exit(0);
    }
    const runs = loadRuns(path.resolve(target));
    if (runs.length === 0) {
        console.log('# no runs (directories with host.log) found');
        process.exit(0);
    }
    const generated = new Date().toISOString().slice(0, 10);
    const mix = storyMix(runs.map((r) => ({ name: r.name, batches: r.batches })));
    const faithfulRuns = runs.filter((r) => !r.summary.turbo);
    const mixFaithful = storyMix(faithfulRuns.map((r) => ({ name: r.name, batches: r.batches })));
    const storyMixMarkdown = [
        `All runs (${runs.length}; ${runs.length - faithfulRuns.length} in turbo mode, story mix only):`,
        '',
        renderStoryMix(mix),
        '',
        `Timing-faithful runs only (${faithfulRuns.length}): ${mixFaithful.batches} batches, ` +
            `endings ${mixFaithful.endings
                .slice(0, 8)
                .map((e) => `${e.key} ${e.count}`)
                .join(', ')}.`,
    ].join('\n');
    // the mix itself is recomputable from the runs; only its markdown is kept
    const batches = { generated, runs: runs.map(compactRun), storyMixMarkdown };
    writeFileSync(NP_BATCHES_PATH, JSON.stringify(batches, null, 1));
    console.log(storyMixMarkdown);
    console.error(`[normal-play-report] ${runs.length} runs, ${mix.batches} batches -> ${NP_BATCHES_PATH}`);

    if (!argv.includes('--no-host')) {
        const results = [];
        for (const run of faithfulRuns) {
            if (run.frames.size === 0) continue;
            const started = Date.now();
            results.push(...checkRun({ dir: run.dir, frames: Number(flag('--frames', '12')), dumpDir: flag('--dump', null) }));
            console.error(`[host-check] ${run.name}: ${((Date.now() - started) / 1000).toFixed(1)}s`);
        }
        const markdown = renderHostScores(results);
        writeFileSync(NP_SCORES_PATH, JSON.stringify({ generated, results, markdown }, null, 1));
        console.log('\n' + markdown);
        console.error(`[normal-play-report] host scores -> ${NP_SCORES_PATH}`);
    }
    replacePixelSection(null);
    console.error('[normal-play-report] docs/oracle-coverage.md refreshed');
}
