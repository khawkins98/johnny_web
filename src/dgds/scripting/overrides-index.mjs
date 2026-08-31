/**
 * OVERRIDES index — the single, greppable record of the canonical / override boundary
 * for the DGDS scripting layer, plus WHY each override exists.
 *
 * Two sets of modules live under `scripting/`:
 *
 *  - The CANONICAL execution path (`CANONICAL_FILES`): the pure, deterministic engine
 *    that runs the original 1991 bytecode. Given the same script and the same authored
 *    values it produces the same ops in the same order — no wall clock, no host, no
 *    diagnostics. These modules import ONLY each other.
 *
 *  - The OVERRIDE layer (`OVERRIDES`): everything that adapts that pure engine to a
 *    real machine and a real browser — machine-timing correction, observability,
 *    presentation enhancement, and the host session loop. The canonical core never
 *    imports these; they reach it by injection or wrap it from the host side.
 *
 * This file is documentation-as-code: `overrides-index.test.mjs` asserts every entry
 * names a real module with a real reason, that canonical and override never overlap,
 * and `canonical-boundary.test.mjs` builds its import guard from `OVERRIDE_MODULES`
 * here — so the boundary and its rationale are one source of truth that cannot drift.
 * It is pure data and imports nothing; the engine does not load it at runtime.
 */

/**
 * `kind` — what an override adapts:
 *   timing-correction  recovers the original cadence on machine time
 *   diagnostics        observability; off in a normal run
 *   enhancement        host presentation beyond the faithful raster
 *   host-loop          the session loop that wires the core to a host
 *
 * `binding` — how it reaches the core WITHOUT the core importing it:
 *   injected  handed to the runtime as a constructor dependency
 *   host      imported by the host/session layer, which wraps the core
 */
export const OVERRIDES = [
    {
        module: 'timing-compatibility.mjs',
        kind: 'timing-correction',
        binding: 'injected',
        why:
            "Recovers the original's two-clock cadence on machine time: maps authored " +
            '16ms-unit delays onto the port fine-tick grid and gates frame advance to the ' +
            '50ms WM_TIMER present cadence. Injected as `timingCompatibility`; the core never ' +
            'imports it, so a build without it runs the raw authored values.',
    },
    {
        module: 'trace.mjs',
        kind: 'diagnostics',
        binding: 'host',
        why:
            'The observability recorder — buffers, serializes, downloads and POSTs the ' +
            'per-tick event trace. The core only EMITS into an injected `state.trace` sink ' +
            '(see the canonical trace-event.mjs); this recorder is wired by the host.',
    },
    {
        module: 'diagnostics.mjs',
        kind: 'diagnostics',
        binding: 'host',
        why:
            'Runtime diagnostics mode and console-log gating, driven by URL query and ' +
            'subscribed by the host. The core logs through the injected log.mjs config the ' +
            'host pushes flags into; it never reads this singleton.',
    },
    {
        module: 'frame-renderer.mjs',
        kind: 'enhancement',
        binding: 'host',
        why:
            'Browser background renderer (island, clouds, waves, time-of-day) driven by an ' +
            'injected presentation policy. Faithful script execution never reads these ' +
            'settings or wall time; this is host presentation layered on the raster.',
    },
    {
        module: 'process.mjs',
        kind: 'host-loop',
        binding: 'host',
        why:
            'The browser session loop: constructs the runtime, wires browser services ' +
            '(surface, scheduler, audio, presenter, resources), and pushes diagnostics/log ' +
            'config in. Not canonical; currently mislocated under scripting/ and slated to ' +
            'move to a host/session location.',
    },
];

/** Bare module names of the override layer, in index order. */
export const OVERRIDE_MODULES = OVERRIDES.map((entry) => entry.module);

/**
 * The canonical execution path: pure engine modules that import only each other.
 * `canonical-boundary.test.mjs` iterates this list and fails CI if any of them
 * imports an override/host module.
 */
export const CANONICAL_FILES = [
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

/** Allowed `kind` / `binding` vocab — the index test rejects anything else. */
export const OVERRIDE_KINDS = ['timing-correction', 'diagnostics', 'enhancement', 'host-loop'];
export const OVERRIDE_BINDINGS = ['injected', 'host'];
