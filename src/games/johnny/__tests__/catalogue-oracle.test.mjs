import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOHNNY_SCENES, SceneFlags } from '../story-controller.mjs';
import { decodeJohnnyCatalogue } from './catalogue-decoder.mjs';

// The shipped catalogue is a hand-maintained port of the binary's 79-record scene
// table. This oracle decodes the binary and asserts the hand array matches it on the
// unambiguous fields (script/tag, spots, headings, day, tide window, pose). The
// selection FLAGS (FINAL/FIRST/ISLAND/...) are a derived abstraction, not a bit-copy
// of the binary flagsB, so they are validated by behavior tests, not here.
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/data');
const archive = readFileSync(path.join(dataDir, 'SCRANTIC.SCR'));
const decoded = decodeJohnnyCatalogue(
    archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength),
);

const isPose = (s) => (s.flags & SceneFlags.POSE) !== 0;
// Match key: non-pose scenes by script+tag; poses (all binary adsTag 1) by position.
const key = (s) => (s.script === 'POSE' || s.pose || isPose(s) ? `POSE@${s.startSpot},${s.startHeading}` : `${s.script}#${s.tagId ?? s.adsTag}`);

describe('catalogue matches the binary 79-record table', () => {
    it('decodes exactly 79 real records from SCRANTIC.SCR', () => {
        expect(decoded).toHaveLength(79);
    });

    it('JOHNNY_SCENES has 79 records', () => {
        expect(JOHNNY_SCENES).toHaveLength(79);
    });

    const jsByKey = new Map(JOHNNY_SCENES.map((s) => [key(s), s]));

    for (const rec of decoded) {
        const label = rec.pose ? `POSE@${rec.startSpot},${rec.startHeading}` : `${rec.script}#${rec.adsTag}`;
        it(`matches ${label}`, () => {
            const js = jsByKey.get(key(rec));
            expect(js, `no JOHNNY_SCENES record for ${label}`).toBeDefined();
            expect(isPose(js)).toBe(rec.pose);
            if (!rec.pose) {
                expect(js.script).toBe(rec.script);
                expect(js.tagId).toBe(rec.adsTag);
            }
            expect(js.startSpot ?? null).toBe(rec.startSpot);
            expect(js.endSpot ?? null).toBe(rec.endSpot);
            // Headings are only meaningful when a spot exists.
            if (rec.startSpot !== null) expect(js.startHeading).toBe(rec.startHeading);
            if (rec.endSpot !== null) expect(js.endHeading).toBe(rec.endHeading);
            expect(js.day).toBe(rec.day);
            expect(js.tideMin).toBe(rec.tideMin);
            expect(js.tideMax).toBe(rec.tideMax);
            // Budget metrics (byte@0x07 width, byte@0x02 weight) must match the binary too.
            expect(js.width).toBe(rec.width);
            expect(js.weight).toBe(rec.weight);
        });
    }
});
