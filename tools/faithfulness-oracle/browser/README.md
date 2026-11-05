# Legacy browser capture helpers

These Playwright helpers were used during the #53 island-offset, night/tide and gag investigations. **Their launch steps predate the single Play UI and do not work against the current page without updating the scripts.** `browse-canvases.mjs` targets removed `#start-classic-btn` / `#start-enhanced-btn` controls and writes the retired `jc-start-time` key; `play-gag.mjs` looks for “Play Classic”. The current UI uses `#start-play-btn`, and its normalized clock offset uses `jc-start-time-hhmm`.

For current manual playback captures, use the [playback guide](../../../docs/playback-toolbar.md) and [story timeline](../../../docs/story-timeline-guide.md). For traces, use [Debugging playback](../../../docs/diagnostics.md). To capture the original program for comparison, start with the [oracle methodology](../METHODOLOGY.md).

| Script | Historical purpose |
| --- | --- |
| `browse-canvases.mjs <outPrefix> [classic\|enhanced] [shots] [everyMs] [startTime]` | Save page screenshots and each 640×480 canvas, logging night, tide, island position and waves. |
| `play-gag.mjs <outDir> <day> <band> <cardRegex> [tag]` | Select a timeline gag and capture it 2, 6 and 12 seconds in. |
| `playwright.mjs` | Shared Playwright loader; `PLAYWRIGHT_FROM` locates a separate installation, `CHROME` optionally selects its executable, and `JC_URL` sets the app URL. |

If maintaining these helpers, install Playwright separately in a scratch directory; it is not a project dependency. Update the launch/storage assumptions before running them, create output directories first, and keep all game-derived screenshots under ignored `scratchpad/`.
