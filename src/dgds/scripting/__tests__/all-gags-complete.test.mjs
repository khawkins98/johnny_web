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

// Every gag must run to completion. The content-addressed ADS handoff dispatch fires a
// scene's IF_PLAYED chunk the tick it finishes, decoupled from the completion decision
// (which stays on #runAdsController's `blockers` check). This guard catches the failure
// a naive coupling caused: gag 7's ambient rearm loop (scene 4:24, running<->waiting
// forever) blocking completion. SCRANTIC.SCR is proprietary + gitignored (absent in CI),
// so this runs locally and skips in CI, like the golden harness.
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/data');
const hasData = existsSync(path.join(dataDir, johnnyCastaway.resources.map)) &&
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
          return { archive, data: archive.loadEntry(johnnyCastaway.resources.activity) };
      })()
    : null;

const gagIds = hasData
    ? [...new Set(game.data.scenes.map((s) => s.tagId?.id).filter((id) => id != null))]
    : [];

describe.skipIf(!hasData)('every ADS gag runs to completion', () => {
    for (const gag of gagIds) {
        it(`gag ${gag} completes within 5000 ticks (no stall / infinite loop)`, () => {
            const runtime = new DgdsRuntime({
                type: 'ADS',
                data: game.data,
                game: johnnyCastaway,
                resourceProvider: createEntryResourceProvider(game.archive.entries),
                surfaceFactory: createSoftwareSurface,
                timingCompatibility: createTimingCompatibility(),
                random: seededRandom(0x4a430000 + gag),
            });
            expect(runtime.jumpToScene(gag)).toBe(true);
            const startedAt = runtime.state.currentScene;
            let completed = false;
            for (let tick = 1; tick <= 5000; tick++) {
                runtime.tick(DGDS_TICK_MS);
                if (runtime.state.currentScene !== startedAt) {
                    completed = true;
                    break;
                }
            }
            expect(completed, `gag ${gag} did not complete within 5000 ticks`).toBe(true);
        });
    }
});
