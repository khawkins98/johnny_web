import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Structural guard for the canonical / override boundary.
//
// The CANONICAL execution path is the pure, deterministic DGDS engine: it runs the
// original bytecode and must import ONLY other canonical modules, never the
// override/host layer. Keeping this a test (not just a doc convention) is what makes
// the boundary structural -- a new cross-boundary import fails CI immediately.
//
// NOTE: process.mjs is the host SESSION LOOP, currently mislocated under scripting/.
// It is NOT canonical (it wires hosts) and is deliberately excluded here; a later
// increment should move it to a host/session location.
const scriptingDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CANONICAL_FILES = [
    'runtime.mjs',
    'script-runner.mjs',
    'scene-frame.mjs',
    'scene-factory.mjs',
    'composition.mjs',
    'surface.mjs',
    'surface-frame-presenter.mjs',
    'frame-operation.mjs',
    'frame-timing.mjs',
    'ttm-run-state.mjs',
    'ttm-sequence-order.mjs',
    'execution-outcome.mjs',
    'timing.mjs',
    'background-resources.mjs',
    'trace-event.mjs',
    'log.mjs',
];

// The override/host layer the canonical path must not import: anything under hosts/
// or games/, plus the override modules that currently live in scripting/ (diagnostics
// + trace = observability; frame-renderer = enhancement rendering; process = host
// session loop; timing-compatibility is INJECTED, never imported -- listed so a
// future direct import is caught too).
const isBoundaryImport = (specifier) =>
    /(^|\/)hosts\//.test(specifier) ||
    /(^|\/)games\//.test(specifier) ||
    /(^|\/)(trace|diagnostics|frame-renderer|process|timing-compatibility)\.mjs$/.test(specifier);

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
