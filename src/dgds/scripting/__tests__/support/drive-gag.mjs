import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { johnnyCastaway } from '../../../../games/johnny/manifest.mjs';
import { loadResources } from '../../../resource.mjs';
import { createEntryResourceProvider } from '../../../resource-provider.mjs';
import { DgdsRuntime } from '../../runtime.mjs';
import { DGDS_TICK_MS } from '../../timing.mjs';
import { createSoftwareSurface } from '../../surface.mjs';
import { createTimingCompatibility } from '../../timing-compatibility.mjs';

// Shared gag-driver for tests and ad-hoc probes. The ONE sanctioned way to start
// an ADS gag headless: it drives the gag through the browser's REAL single-gag
// completion path (`singleAdsScene` via `adsSceneTag`), NOT `jumpToScene`'s legacy
// free-run, whose divergent completion path caused a long mis-diagnosis this
// project. If you are writing a gag probe, use this -- do not hand-roll `jumpToScene`.
//
// SCRANTIC data is proprietary + gitignored (absent in CI), so callers guard with
// `describe.skipIf(!hasData)`.

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../public/data');

export const hasData =
    existsSync(path.join(dataDir, johnnyCastaway.resources.map)) &&
    existsSync(path.join(dataDir, johnnyCastaway.resources.archive));

const asArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

// The same LCG the golden harness / other suites use, so seeds are comparable.
export const seededRandom = (seed) => {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 0x100000000);
};

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

/** Load a parsed ADS entry (e.g. 'FISHING.ADS', 'ACTIVITY.ADS'). */
export const loadAds = (adsName) => archive().loadEntry(adsName);

/**
 * Drive one ADS gag to completion on the real single-gag path.
 * @param {object} o
 * @param {string} o.adsName  ADS resource, e.g. 'FISHING.ADS'.
 * @param {number} o.tag      the gag's ADS scene tagId (adsSceneTag).
 * @param {number} [o.seed]   RNG seed (default 1).
 * @param {number} [o.maxTicks] tick cap (default 5000).
 * @param {(runtime, result, tick) => void} [o.onTick] per-tick observer.
 * @returns {{completed:boolean, ticks:number, seen:Set<number>, runtime:DgdsRuntime}}
 *   `seen` = every TTM tagId that was ever active (reachability of terminal tags,
 *   e.g. FISHING 1:39 / ACTIVITY 4:23, is the general "teleport-class" / drain check).
 */
export const driveGag = ({ adsName, tag, seed = 1, maxTicks = 5000, onTick = null }) => {
    const data = loadAds(adsName);
    const runtime = new DgdsRuntime({
        type: 'ADS',
        data,
        game: johnnyCastaway,
        resourceProvider: createEntryResourceProvider(archive().entries),
        surfaceFactory: createSoftwareSurface,
        timingCompatibility: createTimingCompatibility(),
        random: seededRandom(seed),
        singleAdsScene: true,
        adsSceneTag: tag,
    });
    const seen = new Set();
    let completed = false;
    let ticks = 0;
    for (let tick = 1; tick <= maxTicks; tick++) {
        const result = runtime.tick(DGDS_TICK_MS);
        for (const scene of runtime.state.scenes) seen.add(scene.tagId);
        onTick?.(runtime, result, tick);
        ticks = tick;
        if (result.completed) {
            completed = true;
            break;
        }
    }
    return { completed, ticks, seen, runtime };
};
