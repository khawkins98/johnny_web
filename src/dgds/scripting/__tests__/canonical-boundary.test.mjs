import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_FILES, OVERRIDE_MODULES } from '../overrides-index.mjs';

// Structural guard for the canonical / override boundary.
//
// The CANONICAL execution path is the pure, deterministic DGDS engine: it runs the
// original bytecode and must import ONLY other canonical modules, never the
// override/host layer. Keeping this a test (not just a doc convention) is what makes
// the boundary structural -- a new cross-boundary import fails CI immediately.
//
// The canonical list and the override module set both come from overrides-index.mjs
// (the OVERRIDES index), so the boundary guard and its documented rationale share one
// source of truth and cannot drift. NOTE: process.mjs is the host SESSION LOOP,
// currently mislocated under scripting/; it is an override (see the index), so a
// canonical module importing it fails here.
const scriptingDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A canonical module must not import anything under hosts/ or games/, nor any override
// module named in the OVERRIDES index (timing-compatibility is INJECTED, never
// imported -- listing it here catches a future direct import too). The `.mjs`-anchored
// match means `trace.mjs` never matches the canonical `trace-event.mjs`.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const overrideModulePattern = new RegExp(`(^|/)(${OVERRIDE_MODULES.map(escapeRegExp).join('|')})$`);
const isBoundaryImport = (specifier) =>
    /(^|\/)hosts\//.test(specifier) ||
    /(^|\/)games\//.test(specifier) ||
    overrideModulePattern.test(specifier);

// Allow-list of boundary imports that are permitted for now. Empty: the diagnostics
// leaks that used to live here have been evicted -- the core now EMITS trace events
// through the canonical trace-event.mjs sink and logs through the canonical log.mjs
// config the host pushes into, so no canonical module imports the observability layer.
const ALLOWED_LEAKS = new Set([]);

const importSpecifiers = (source) =>
    [...source.matchAll(/(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);

describe('canonical execution-path import boundary', () => {
    for (const file of CANONICAL_FILES) {
        it(`${file} imports only canonical modules (documented leaks excepted)`, () => {
            const source = readFileSync(path.join(scriptingDir, file), 'utf8');
            const violations = importSpecifiers(source)
                .filter(isBoundaryImport)
                .map((specifier) => `${file} -> ${specifier}`)
                .filter((entry) => !ALLOWED_LEAKS.has(entry));
            expect(violations).toEqual([]);
        });
    }
});
