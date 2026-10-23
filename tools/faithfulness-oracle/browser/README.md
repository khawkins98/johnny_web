# Browser helpers

Playwright scripts that drive **our** build in Chromium to get pictures and state for comparison with captures of the original.

| Script | What it does |
| --- | --- |
| `browse-canvases.mjs <outPrefix> [classic\|enhanced] [shots] [everyMs] [startTime]` | Starts playback and saves page screenshots plus each 640x480 canvas as PNG, logging the host's night, tide, island position and waves. Used for the island-offset and night/tide checks in #53. |
| `play-gag.mjs <outDir> <day> <band> <cardRegex> [tag]` | Picks a gag through the story timeline, plays it, and screenshots it 2, 6 and 12 s in. |
| `playwright.mjs` | Shared loader. |

Playwright is not a repo dependency. Install it in a scratch directory and point the scripts at it:

```sh
(cd scratchpad/pw && npm i playwright && npx playwright install chromium)
pnpm dev &   # http://localhost:5173/
PLAYWRIGHT_FROM=scratchpad/pw node tools/faithfulness-oracle/browser/browse-canvases.mjs scratchpad/shots/night classic 3 4000 21:30
```

`JC_URL` sets the app URL, and `CHROME` sets a browser executable if you don't use Playwright's own Chromium. Screenshots show game graphics, so write them under `scratchpad/`.
