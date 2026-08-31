import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CANONICAL_FILES,
    OVERRIDES,
    OVERRIDE_MODULES,
    OVERRIDE_KINDS,
    OVERRIDE_BINDINGS,
} from '../overrides-index.mjs';

// Keeps the OVERRIDES index honest: every documented override is a real module with a
// real reason, the canonical and override sets never overlap, and nothing there is a
// stale name. This is what makes the index documentation-as-code rather than a comment
// that rots -- the boundary guard (canonical-boundary.test.mjs) builds from the same
// lists, so an accurate index is also an accurate CI guard.
const scriptingDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('OVERRIDES index', () => {
    it('OVERRIDE_MODULES mirrors OVERRIDES in order', () => {
        expect(OVERRIDE_MODULES).toEqual(OVERRIDES.map((entry) => entry.module));
    });

    it('has no duplicate module names', () => {
        expect(new Set(OVERRIDE_MODULES).size).toBe(OVERRIDE_MODULES.length);
    });

    for (const entry of OVERRIDES) {
        describe(entry.module, () => {
            it('names a real module under scripting/', () => {
                expect(existsSync(path.join(scriptingDir, entry.module))).toBe(true);
            });

            it('has a valid kind and binding', () => {
                expect(OVERRIDE_KINDS).toContain(entry.kind);
                expect(OVERRIDE_BINDINGS).toContain(entry.binding);
            });

            it('explains why it is an override', () => {
                expect(entry.why.trim().length).toBeGreaterThan(40);
            });
        });
    }

    it('never lists a module as both canonical and override', () => {
        const overlap = OVERRIDE_MODULES.filter((module) => CANONICAL_FILES.includes(module));
        expect(overlap).toEqual([]);
    });

    it('lists only canonical modules that exist on disk', () => {
        const missing = CANONICAL_FILES.filter(
            (module) => !existsSync(path.join(scriptingDir, module)),
        );
        expect(missing).toEqual([]);
    });
});
