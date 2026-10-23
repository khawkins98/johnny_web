import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    DEFAULT_RUNS_DIR,
    faithfulRunDirs,
    replayRun,
} from '../../../../tools/faithfulness-oracle/pixel-oracle/align-planner.mjs';

// The first-batch oracle (#68): a headless DOSBox-X boot of the original is
// deterministic, so each normal-play capture's FIRST batch can be replayed by
// skipping the traced number of RNG draws and running our planner on the faithful
// RNG. The queues must then be identical, record for record. Needs the game data
// and the maintainer's normal-play captures (both local only; skipped in CI). Set
// JOHNNY_NORMAL_PLAY_RUNS to point at another runs directory.
const archivePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/data/SCRANTIC.SCR');
const runs = existsSync(archivePath) ? faithfulRunDirs(DEFAULT_RUNS_DIR) : [];

describe.skipIf(runs.length === 0)(
    'normal-play first batches replay exactly at the boot offset (local captures)',
    () => {
        const archive = existsSync(archivePath) ? readFileSync(archivePath) : null;
        const results = runs.map((dir) => replayRun(dir, { archive }));

        it('covers the eight timing-faithful runs', () => {
            expect(results.length).toBeGreaterThanOrEqual(8);
        });

        it.each(results.map((r) => [r.name, r]))('%s', (_name, r) => {
            expect(r.replayed, `day ${r.day} phase ${r.phase} skip ${r.skip}`).toEqual(r.captured);
            expect(r.layoutMatches).toBe(true);
        });
    },
);
