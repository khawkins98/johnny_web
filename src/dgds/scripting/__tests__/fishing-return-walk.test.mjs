import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { johnnyCastaway } from '../../../games/johnny/manifest.mjs';
import { loadResources } from '../../resource.mjs';
import { createEntryResourceProvider } from '../../resource-provider.mjs';
import { DgdsRuntime } from '../runtime.mjs';
import { DGDS_TICK_MS } from '../timing.mjs';
import { createSoftwareSurface } from '../surface.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';

// FISHING.ADS #2 is a random ambient-fishing loop that MUST wind down through its
// authored return-walk `1:39` ("TREE 2 D") so Johnny ends the gag standing at spot
// D -- otherwise the between-gag walk interlude (which starts from the catalogue
// endSpot D) snaps him ~160px from the water back to D ("teleport ~5s after start").
//
// The loop sustains via the OR-chain handoff dispatch: `IF_PLAYED 10 OR 21 OR 22 OR
// 23 OR 38 -> RANDOM{...,15}` and `IF_PLAYED 34 OR 35 OR 30 OR 36 OR 37 -> ADD 39`.
// indexAdsChunks must map EVERY OR-clause to the shared body so a finish on ANY
// clause re-fires the RANDOM / adds 39 -- not just the last-in-file clause. Before
// that fix only ~4% of seeds reached 39 (Johnny stuck at the water); after, ~100%.
//
// Driven in singleAdsScene mode (adsSceneTag), the real browser path -- NOT
// jumpToScene, whose non-singleAdsScene completion path diverges. SCRANTIC data is
// proprietary + gitignored (absent in CI), so this runs locally and skips in CI.
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/data');
const hasData =
    existsSync(path.join(dataDir, johnnyCastaway.resources.map)) &&
    existsSync(path.join(dataDir, johnnyCastaway.resources.archive));

const asArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const seededRandom = (seed) => {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 0x100000000);
};

const game = hasData
    ? (() => {
          const resources = loadResources(
              asArrayBuffer(readFileSync(path.join(dataDir, johnnyCastaway.resources.map))),
              asArrayBuffer(readFileSync(path.join(dataDir, johnnyCastaway.resources.archive))),
          );
          const archive = resources.getResource(johnnyCastaway.resources.archive);
          return { archive, data: archive.loadEntry('FISHING.ADS') };
      })()
    : null;

describe.skipIf(!hasData)('FISHING #2 winds down through its return-walk (no teleport)', () => {
    const runToCompletion = (seed) => {
        const runtime = new DgdsRuntime({
            type: 'ADS',
            data: game.data,
            game: johnnyCastaway,
            resourceProvider: createEntryResourceProvider(game.archive.entries),
            surfaceFactory: createSoftwareSurface,
            timingCompatibility: createTimingCompatibility(),
            random: seededRandom(seed),
            singleAdsScene: true,
            adsSceneTag: 2,
        });
        const seen = new Set();
        let completed = false;
        for (let tick = 1; tick <= 5000; tick++) {
            const result = runtime.tick(DGDS_TICK_MS);
            for (const scene of runtime.state.scenes) seen.add(scene.tagId);
            if (result.completed) {
                completed = true;
                break;
            }
        }
        return { completed, seen };
    };

    // 12 seeds keep the suite fast under parallel load; a local sweep of 300 seeds
    // reaches tag 39 ~100% (was ~4% before the OR-chain handoff-index fix). Explicit
    // timeout since each seed ticks a full gag to completion.
    it('reaches the break tag 15 and the return-walk tag 39 for every seed 1..12', { timeout: 30000 }, () => {
        for (let seed = 1; seed <= 12; seed++) {
            const { completed, seen } = runToCompletion(seed);
            expect(completed, `seed ${seed} did not complete`).toBe(true);
            expect(seen.has(15), `seed ${seed} never broke the ambient loop (tag 15)`).toBe(true);
            expect(seen.has(39), `seed ${seed} never played the return-walk (tag 39)`).toBe(true);
        }
    });
});
