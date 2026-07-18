# ADR 0001: DGDS runtime boundaries

Status: accepted for incremental migration

## Context

The first implementation grew around Johnny Castaway and correctly prioritized
discovering DGDS behavior. As a result, `process.mjs` came to own interpreter
coordination, mutable process state, browser scheduling, presentation, audio,
diagnostics, and developer controls. Those responsibilities make behavioral
fixes harder to classify and prevent the engine from being reused by another
DGDS title.

Passing tests protect observed behavior, but do not by themselves distinguish
faithful DGDS semantics from Johnny-specific data, browser accommodation, or an
optional enhancement.

## Decision

The implementation will move incrementally toward four explicit layers:

1. **DGDS machine** — deterministic script and scene state transitions. It
   consumes logical ticks and input, and emits logical frame, audio, and
   lifecycle operations.
2. **Game package** — resource fingerprints, entry points, audio maps, and
   evidence-backed quirks for a particular title and version.
3. **Host adapters** — scheduling, Canvas presentation, Web Audio, storage,
   input, full screen, and trace persistence.
4. **Enhancements** — optional clouds, waves, scaling, interactions, navigation,
   and HUD behavior layered above the faithful machine.

Classic and enhanced playback must use the same DGDS machine. Enhancements may
change presentation or provide additional input, but may not silently change
opcode or scene scheduling semantics.

Compatibility rules must be named, scoped, and testable. A game-specific rule
must identify the applicable resource/version fingerprint, its evidence, and a
focused regression or conformance test.

## Migration constraints

- This is an extraction, not a rewrite. Each step must preserve characterized
  runtime behavior and keep the application runnable.
- The first step introduces an instance-owned `DgdsRuntime` and separates the
  browser animation-frame host. It is intentionally an interim boundary: until
  drawing and audio become logical operations, the runtime still has presenter
  dependencies and must not be advertised as the final pure machine API.
- Module-global state may exist only as a legacy façade for the single active
  browser session and developer UI. It must not own engine semantics.
- The original implementation, resource traces, and reference engines are
  evidence. Tests are classified as decoder, conformance, compatibility, host,
  or enhancement tests as the migration proceeds.
- A second DGDS/Screen Antics title is required before stabilizing a reusable
  public engine API.

## Intended dependency direction

```text
application / enhancements ──► game package ──► DGDS machine
          │                                         ▲
          └──────────────► host adapters ────────────┘
```

The DGDS machine must not import browser APIs, Johnny-specific settings, or
enhancement code.

