# Debugging playback

Press `D` to open the developer panel and enable diagnostics. You can also turn diagnostics on in Settings (`S`). Enable them before reproducing a bug: each capture starts at the current engine tick.

## Capture a trace

1. Enable diagnostics, then reproduce the issue.
2. Click **Download JSONL trace** in the developer panel.
3. Attach the file to your bug report with a description of what you saw.

The panel shows the active build ID, which is also included in the trace. The first record identifies the build, browser, display, and engine state; later records describe scene changes, drawing, timing, and audio. See [architecture diagnostics](architecture.md#diagnostics) for event details and capture limits.

To enable diagnostics as the page loads, use:

| URL query | Output |
| --- | --- |
| `?debug` | Structured trace and concise console events |
| `?debug=verbose` | The same trace plus per-sprite console logs |

The panel's **Console detail** control changes log verbosity without a reload. Settings exposes the same Off, On, and Verbose choices.

## Preview calendar behavior

The panel's **Holiday Theme** selector previews Calendar, None, St Patrick's Day, Halloween, Christmas, or New Year without changing your system clock. Calendar is the default.

Story-day controls can advance or set saved progress. The separate preview-day control leaves saved progress alone; see [Johnny's 11-day story](story-over-time.md#viewing-or-changing-the-story-day).

## Inspect the original resources

After [extracting local game data](../CONTRIBUTING.md#local-game-data), run:

```bash
pnpm run dump
```

This regenerates resource indexes, compressed entries, decoded images, ADS/TTM script listings, and audio samples under `dumps/`. That directory is ignored and disposable. Keep findings in tests or the relevant documentation so they survive regeneration.

## Access traces from scripts

The browser exposes the active capture through:

```js
window.__DGDS__.getTrace()     // Read recorded events
window.__DGDS__.saveTrace()    // Download the capture
window.__DGDS__.persistTrace() // Write through the Vite development endpoint
```

During Vite development, runtime stops automatically save a bounded snapshot under the ignored `traces/` directory. Successive scenes in one diagnostic session overwrite the same snapshot. Production builds support explicit downloads but don't automatically post traces.
