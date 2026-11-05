# Debugging playback

Press `D` to open the developer panel and enable diagnostics. You can also turn diagnostics on in Settings (`S`). Enable them before reproducing a bug: each capture starts at the current engine tick.

## Capture a trace

1. Enable diagnostics, then reproduce the issue.
2. Click **Download JSONL Trace** in the developer panel.
3. Attach the file to your bug report with a description of what you saw.

The panel shows the active build ID, which is also included in the trace. The first record identifies the build, browser, display, and engine state; later records describe scene changes, drawing, timing, and audio. See the [trace reference](#trace-reference) for event details and capture limits.

To enable diagnostics as the page loads, use:

| URL query | Output |
| --- | --- |
| `?debug` | Structured trace and concise console events |
| `?debug=verbose` | The same trace plus per-sprite console logs |

The panel's **Console detail** control changes log verbosity without a reload. Settings exposes the same Off, On, and Verbose choices.

## Preview calendar behavior

The panel's **Holiday Theme** selector previews Calendar, None, St Patrick's Day, Halloween, Christmas, or New Year without changing your system clock. Calendar is the default.

**Saved day for normal playback** sets or advances saved story progress. **Simulated day for this run** applies only to a debug run and leaves saved progress alone; see [developer panel runs](johnny-host-behavior.md#developer-panel-runs). For the visitor-facing day exploration and explicit **Play selected day/time** control, see the [story timeline guide](story-timeline-guide.md); for automatic day progression, see [Johnny's 11-day story](story-over-time.md#viewing-or-changing-the-story-day).

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

## Trace reference

| Setting | Output |
| --- | --- |
| Off | No diagnostics |
| On | Concise console events, structured events and pixel fingerprints |
| Verbose | The same, plus per-sprite console logs |

A capture holds at most 50,000 events and spans successive ADS runtimes, including host selections, walking interludes, transitions and relevant settings/debug actions. It records named controls and values rather than arbitrary pointer movement, typing or page content. When full, it drops the oldest events and reports the dropped count.

| Event | Details |
| --- | --- |
| `session-start` | Application/build, engine, timing profile, page, browser-reported capability and display metadata |
| `frame-timing-map` | Authored and mapped delays, with applied patch names |
| `browser-presentation` | Foreground clear/upload/reuse decisions, retained-composition identity, pixel fingerprints, fades and cloud count |
| `audio-sample` | Sample requests and whether audio playback started |

The Vite development endpoint `/__dgds_trace` writes one bounded snapshot per diagnostic session to ignored `traces/`. Runtime stops overwrite that session's snapshot; disabling diagnostics writes a stop record and persists again. A new session uses a new file. Production builds have explicit downloads and no automatic trace posts.

The developer panel shows the same build identifier as `session-start` so you can spot a stale server before downloading. Its Console detail selector stays synchronized with Settings and the debug URL mode. The panel can be dragged and resized; on short windows its outer scroll keeps the controls and resize corner reachable.
