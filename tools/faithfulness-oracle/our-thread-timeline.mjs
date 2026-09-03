#!/usr/bin/env node
// Per-tick "thread timeline" extractor for our JS engine, in a SHARED diff format
// so it can be compared against a timeline produced from the original binary (a
// separate tool, same format).
//
// Emits one JSONL line per engine tick that composes/presents a frame:
//   {"t": <int, 0-based index over emitted snapshots>, "live": ["<slot>:<tag>", ...]}
// where "live" is the SORTED list of currently DRAWING ADS scene instances --
// scenes in `runtime.state.scenes` that composeTtmFrame would actually paint this
// tick. Each entry is `${scene.sceneIdx}:${scene.tagId}`.
//
// "Drawing" predicate: `!isTtmFinished(scene) || scene.agedOut === false`.
// This is the EXACT skip-check composeTtmFrame uses (src/dgds/scripting/composition.mjs,
// "if (isTtmFinished(scene) && scene.agedOut !== false) continue;" -- i.e. draw unless
// finished-and-aged-out) and is the same predicate the building8-double-johnny
// regression test uses to detect the two-Johnny overlap
// (src/dgds/scripting/__tests__/building8-double-johnny.test.mjs).
//
// Usage:
//   node tools/faithfulness-oracle/our-thread-timeline.mjs <ADS.NAME> <tag> [seed] [--free-run] [--out <file>]
//
// Modes:
//   default     -- drives the gag on the real single-gag completion path via the
//                  sanctioned driveGag() helper (drive-gag.mjs), same path the
//                  building8 test and sequencing-sweep use.
//   --free-run  -- builds a runtime directly and free-runs via jumpToScene(tag,
//                  { single: false }) until state.currentScene advances, matching
//                  test/render-goldens.mjs's captureGag(). Useful because a trace
//                  captured from the original binary is itself a free-run/forced
//                  capture, not bounded by our single-gag completion semantics.

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const { driveGag, hasData, loadAds, seededRandom } = await import(
    path.join(repoRoot, 'src/dgds/scripting/__tests__/support/drive-gag.mjs')
);
const { isTtmFinished } = await import(path.join(repoRoot, 'src/dgds/scripting/ttm-run-state.mjs'));
const { DGDS_TICK_MS } = await import(path.join(repoRoot, 'src/dgds/scripting/timing.mjs'));

// -- CLI parsing --------------------------------------------------------------

const args = process.argv.slice(2);
const outArgIdx = args.indexOf('--out');
const positional = args.filter((a, i) => !a.startsWith('--') && (outArgIdx === -1 || i !== outArgIdx + 1));
const freeRun = args.includes('--free-run');
const outIdx = args.indexOf('--out');
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

const [adsName, tagRaw, seedRaw] = positional;

if (!adsName || tagRaw === undefined) {
    console.error(
        'Usage: node our-thread-timeline.mjs <ADS.NAME> <tag> [seed] [--free-run] [--out <file>]',
    );
    process.exit(1);
}

const tag = Number(tagRaw);
const seed = seedRaw !== undefined ? Number(seedRaw) : 1;

// -- Shared "drawing" predicate -----------------------------------------------
// A scene draws unless it is finished-and-aged-out. (composeTtmFrame also skips
// empty-frameOps scenes, but frameOps is a per-tick transient not reliably set at
// sample time -- testing it here regressed real gags; the preload-exclusion fix
// needs a scene-level "ever drew" flag instead. See johnny6-activity11-rootcause.md.)
const isDrawing = (scene) => !isTtmFinished(scene) || scene.agedOut === false;

const liveKeysFor = (runtime) =>
    [...runtime.state.scenes]
        .filter(isDrawing)
        .map((scene) => `${scene.sceneIdx}:${scene.tagId}`)
        .sort();

// -- Output sink ---------------------------------------------------------------

const lines = [];
const emit = (t, live) => lines.push(JSON.stringify({ t, live }));

// -- Drive modes ----------------------------------------------------------------

const runSingleGagPath = () => {
    if (!hasData) {
        console.log('# no game data available (public/data missing) -- nothing to drive.');
        return;
    }
    let snapIdx = 0;
    driveGag({
        adsName,
        tag,
        seed,
        onTick: (runtime) => {
            emit(snapIdx++, liveKeysFor(runtime));
        },
    });
};

const runFreeRunPath = async () => {
    if (!hasData) {
        console.log('# no game data available (public/data missing) -- nothing to drive.');
        return;
    }
    const { johnnyCastaway } = await import(path.join(repoRoot, 'src/games/johnny/manifest.mjs'));
    const { createEntryResourceProvider } = await import(path.join(repoRoot, 'src/dgds/resource-provider.mjs'));
    const { DgdsRuntime } = await import(path.join(repoRoot, 'src/dgds/scripting/runtime.mjs'));
    const { createSoftwareSurface } = await import(path.join(repoRoot, 'src/dgds/scripting/surface.mjs'));
    const { createTimingCompatibility } = await import(
        path.join(repoRoot, 'src/dgds/scripting/timing-compatibility.mjs')
    );
    const { loadResources } = await import(path.join(repoRoot, 'src/dgds/resource.mjs'));
    const { readFileSync } = await import('node:fs');

    // Mirrors test/render-goldens.mjs's setup (same archive-loading recipe as
    // drive-gag.mjs's cached archive()), but jumpToScene's free-run needs the
    // resource provider's `entries`, so the archive object is kept here rather
    // than only its loadEntry() result.
    const dataDir = path.join(repoRoot, 'public/data');
    const asArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    const resources = loadResources(
        asArrayBuffer(readFileSync(path.join(dataDir, johnnyCastaway.resources.map))),
        asArrayBuffer(readFileSync(path.join(dataDir, johnnyCastaway.resources.archive))),
    );
    const archive = resources.getResource(johnnyCastaway.resources.archive);
    const data = archive.loadEntry(adsName);

    const runtime = new DgdsRuntime({
        type: 'ADS',
        data,
        game: johnnyCastaway,
        resourceProvider: createEntryResourceProvider(archive.entries),
        surfaceFactory: createSoftwareSurface,
        timingCompatibility: createTimingCompatibility(),
        random: seededRandom(seed),
    });

    if (!runtime.jumpToScene(tag, { single: false })) {
        console.error(`Unknown Johnny gag tag ${tag} in ${adsName}`);
        process.exit(1);
    }

    const startedAt = runtime.state.currentScene;
    let snapIdx = 0;
    for (let tick = 1; tick <= 5000; tick++) {
        const result = runtime.tick(DGDS_TICK_MS);
        if (result.presentation.compose) {
            emit(snapIdx++, liveKeysFor(runtime));
        }
        if (runtime.state.currentScene !== startedAt) return;
    }
    console.error(`# warning: gag ${tag} did not complete within 5000 ticks (free-run)`);
};

if (freeRun) {
    await runFreeRunPath();
} else {
    runSingleGagPath();
}

// -- Output ---------------------------------------------------------------------

const payload = lines.join('\n') + (lines.length ? '\n' : '');
if (outFile) {
    mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    writeFileSync(outFile, payload);
} else {
    process.stdout.write(payload);
}
