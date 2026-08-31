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

// Honest allow-list of boundary imports that ALREADY exist. These are the diagnostics
// leaks the hooks-refactor will evict (the core should EMIT trace events that a
// listener records, not import the diagnostics modules). The guard passes today but
// fails on any NEW boundary import, and this list is the greppable record of what
// remains to evict.
const ALLOWED_LEAKS = new Set([
    'runtime.mjs -> ./trace.mjs', // TODO(hooks-refactor): evict diagnostics into a listener hook
    'script-runner.mjs -> ./trace.mjs', // TODO(hooks-refactor): evict diagnostics into a listener hook
    'script-runner.mjs -> ./diagnostics.mjs', // TODO(hooks-refactor): evict diagnostics into a listener hook
    'scene-frame.mjs -> ./trace.mjs', // TODO(hooks-refactor): evict diagnostics into a listener hook
]);

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
