# DGDS learnings

This is the compact reverse-engineering record for `johnny_web`. Current module
ownership and runtime behavior are documented in
[docs/architecture.md](docs/architecture.md).

## Script hierarchy

- ADS is the high-level controller: it sequences tagged segments, manages
  conditionals/random choices, and starts or stops TTM sequences.
- TTM is the drawing/timing program: it loads a resource environment and emits
  frame operations separated by `UPDATE`.
- ADS and TTM need distinct opcode dispatch tables. Values such as `0x2010`,
  `0x4000`, and `0xf010` have format-specific meanings.
- `0x1520` is `END_WHILE`; the following `0x2005` remains a separate `ADD_SCENE`.

## Parsing rules

- ADS arguments come from its static opcode table.
- A TTM opcode's low nibble is its integer argument count; `15` denotes a
  string. Mask with `0xfff0` for the canonical opcode.
- Both parsers must retain the trailing tagged scene after the final boundary.
- ADS resource IDs are sparse. Index TTM resources by their declared binary ID,
  not their position in the RES list.
- Synthetic `END_IF` records are a parser convenience; the source ADS stream is
  flatter than the resulting display indentation suggests.

## Timing

- `UPDATE` is a frame boundary even when delay is zero.
- `SET_DELAY` establishes a persistent cadence for subsequent updates.
- DGDS delay values are logical ticks, not browser milliseconds.
- Fixed-step accumulation with bounded catch-up is stable across 60/120/144 Hz
  displays and avoids replay storms after tab suspension.

## Composition and saved regions

The original engine rebuilds its composition from background/stored buffers and
then executes active sequences in painter order. Treating a browser canvas as
both retained scene state and final composition causes stopped-scene ghosts.

The working model is:

- one retained surface per TTM scene;
- one decoded-asset and saved-area environment per TTM resource;
- private working GET/PUT slots per running TTM scene;
- one freshly rebuilt process composition per logical frame;
- Canvas only as a surface adapter and presenter.

`0x4210` saves a GET/PUT region and `0xa600` draws it back by overwrite. A
source-over Canvas draw is insufficient because transparent saved pixels must
replace destination pixels. Clear the destination rectangle before the saved
blit. In the isolated-layer adapter, `0xa600` also begins a fresh scene frame:
clear the whole prior layer before restoring the saved rectangle. Some sprites
move outside that rectangle and would otherwise leave trails.

`0x4200` stores an area for later frames. `0x4000` clip arguments are inclusive
maximum coordinates, so Canvas width/height require `+1`.

## Resource environment ownership

Running a sibling sequence before its resource setup finishes can capture that
sibling's pixels into the initial GET/PUT background. The first sequence for
each resource therefore owns setup; siblings wait and then share decoded assets.
Their working GET/PUT slots are copied from the initialized template and remain
private, because concurrent scripts frequently reuse the same slot number for
different screen regions.

Execution state and scene surfaces are always fresh per scene. ADS queues,
played history, fades, and condition state are not copied into TTM state.

## Scene lifecycle

- ADS `0x1510` ends a conditional branch and commits its staged scene changes;
  it is not a global wait-for-all-scenes operation.
- `IF_PLAYED` provides dependency-specific synchronization. Unrelated finite
  and GOTO sequences continue concurrently.
- Keep lifecycle policy outside the opcode VM: `runScript()` reports `yielded`,
  `looped`, or `completed`, and ADS conditions express dependencies.
- Completed non-looping scenes retain their last layer until explicitly stopped.
- GOTO scenes remain running until stopped.
- `STOP_SCENE` removal becomes visually effective through the next fresh
  composition, not an ad-hoc canvas clear.
- Played history is required because ADS conditionals may refer to a scene after
  it has been removed.

## Conditionals

- A never-added scene is not equivalent to an unfinished scene.
- OR chains require accumulated truth across their complete condition sequence.
- Matching a synthetic `END_IF` requires nesting-depth scanning; a simple
  `findIndex` can skip to the wrong boundary.

## Browser separation

- Create `AudioContext` synchronously inside the start-button click.
- Keep `Date`, `Math.random`, storage, user-agent metadata, and rAF timestamps
  outside opcode callbacks.
- Cache decoded sprites as offscreen canvases at the Canvas adapter boundary;
  rebuilding `ImageData` in the drawing hot path causes visible lag.
- Compatibility effects such as optional clouds/waves should not change opcode
  semantics.

## Diagnostics

Console text is helpful for live inspection but insufficient for rendering
bugs. A useful trace needs logical ticks, lifecycle changes, sprite/GETPUT
events, ordered layer revisions, and a final composition fingerprint.

JSON Lines is the canonical artifact because composition records contain nested
layer data. CSV can be derived for analysis. A session header records when
capture began, the application/build, current engine state, and client-reported
browser/display context. Runtime activation is important: tracing should begin
when needed without requiring a reload.

## Still unknown or incomplete

- Exact behavior for the remaining stubbed ADS/TTM opcodes.
- Full indexed-palette and buffer-copy fidelity.
- Whether all cross-tag GOTO variants used by DGDS titles behave identically.
- Meanings of several ADS/TTM header fields and absent resource IDs.

For external behavioral comparison, the maintained
[ScummVM DGDS engine](https://github.com/scummvm/scummvm/tree/master/engines/dgds)
is the primary reference; verify Johnny Castaway data against local dumps and
regression traces before adopting behavior wholesale.
