import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasData } from './support/drive-gag.mjs';
import { johnnyCastaway } from '../../../games/johnny/manifest.mjs';
import { loadResources } from '../../resource.mjs';
import { createEntryResourceProvider } from '../../resource-provider.mjs';
import { DgdsRuntime } from '../runtime.mjs';
import { DGDS_TICK_MS } from '../timing.mjs';
import { createSoftwareSurface } from '../surface.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { isTtmFinished } from '../ttm-run-state.mjs';

// Regression gate for the BUILDING.ADS fire gags (7 = campfire, low tide; 8 =
// double-Johnny, high tide -- the SAME smoke->fire->sit->walk->boot bytecode,
// see scratchpad/findings/phase13-ground-truth-at-scale.md). That finding
// forced-captured the ORIGINAL binary at scale and proved a naive
// "skip-if-running" fix for IF_NOT_RUNNING (0x1360) truncates these gags in
// FREE-RUN mode (the real screensaver playback path,
// `runtime.jumpToScene(tag, { single: false })`): the gag advances at ~tick
// 810 while only the smoke/fire-retry tags {36,38,51,142} are live and the
// fire (tag 44) never builds. The wait-barrier the naive fix removes is
// load-bearing against exactly this race -- it holds a thread live through
// the retry until the fire lights.
//
// This test drives BUILDING.ADS gags 7 and 8 on the free-run path (mirroring
// test/render-goldens.mjs's captureGag) and asserts the gag never advances
// while only fire-retry tags are active, and that the fire actually lights.

const FIRE_TAG = 44;
const FIRE_RETRY_TAGS = new Set([36, 38, 40, 51, 142, 80, 81]);
const MAX_TICKS = 5000;

// The same LCG render-goldens.mjs / drive-gag.mjs use, so seeds are comparable.
const seededRandom = (seed) => {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 0x100000000);
};

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/data');
const asArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

let cachedArchive = null;
const archive = () => {
    if (!cachedArchive) {
        const resources = loadResources(
            asArrayBuffer(readFileSync(path.join(dataDir, johnnyCastaway.resources.map))),
            asArrayBuffer(readFileSync(path.join(dataDir, johnnyCastaway.resources.archive))),
        );
        cachedArchive = resources.getResource(johnnyCastaway.resources.archive);
    }
    return cachedArchive;
};

const driveFreeRun = (adsName, tag) => {
    const data = archive().loadEntry(adsName);
    const runtime = new DgdsRuntime({
        type: 'ADS',
        data,
        game: johnnyCastaway,
        resourceProvider: createEntryResourceProvider(archive().entries),
        surfaceFactory: createSoftwareSurface,
        timingCompatibility: createTimingCompatibility(),
        random: seededRandom(0x4a430000 + tag),
    });

    if (!runtime.jumpToScene(tag, { single: false })) {
        throw new Error(`Unknown Johnny gag ${tag}`);
    }
    const startedAt = runtime.state.currentScene;

    let fireLit = false;
    let advancedAtRetry = false;
    let advancedAt = null;
    let lastTags = new Set();

    for (let tick = 1; tick <= MAX_TICKS; tick++) {
        runtime.tick(DGDS_TICK_MS);

        const activeTags = new Set(
            runtime.state.scenes
                .filter((scene) => scene.sceneIdx === 3 && !isTtmFinished(scene))
                .map((scene) => scene.tagId),
        );
        lastTags = activeTags;
        if (activeTags.has(FIRE_TAG)) fireLit = true;

        if (runtime.state.currentScene !== startedAt) {
            advancedAt = tick;
            const nonEmptySubsetOfRetry =
                activeTags.size > 0 && [...activeTags].every((t) => FIRE_RETRY_TAGS.has(t));
            if (nonEmptySubsetOfRetry) advancedAtRetry = true;
            break;
        }
    }

    return { fireLit, advancedAtRetry, lastTags, advancedAt };
};

describe.skipIf(!hasData)('BUILDING fire gags build the fire in free-run (no fire-retry truncation)', () => {
    for (const tag of [7, 8]) {
        it(`gag ${tag}: fire lights and the gag never advances mid fire-retry`, () => {
            const { fireLit, advancedAtRetry, lastTags, advancedAt } = driveFreeRun('BUILDING.ADS', tag);

            expect(
                advancedAtRetry,
                `gag ${tag} advanced at tick ${advancedAt} while only fire-retry tags were active ` +
                    `(${[...lastTags].join(',')}) -- the fire-retry race truncated the gag before the fire lit`,
            ).toBe(false);
            expect(fireLit, `gag ${tag} never lit the fire (tag ${FIRE_TAG}) during free-run`).toBe(true);
        });
    }
});
