# johnny_web

A web-native reimplementation of the 1992
[Johnny Castaway](https://en.wikipedia.org/wiki/Johnny_Castaway) screensaver by
Dynamix/Sierra On-Line. It is a hard fork of
[xesf/castaway](https://github.com/xesf/castaway), modernized around ES modules,
Web APIs, Vite, and a testable DGDS engine.

![Johnny Castaway on his island beneath the screensaver title](castaway.png "Dynamix Johnny Castaway Screen Saver")

## Getting started

Requirements: Node.js 20.19+ (or 22.12+) and pnpm 10. The original game data is
also required and is not included in this repository.

```bash
pnpm install
pnpm run extract -- "<path-to-downloaded.zip>"
pnpm run dev       # http://localhost:5173
```

See [Obtaining the Screensaver Data Files](#obtaining-the-screensaver-data-files)
for the download and extractor prerequisites.

## Project goals

- Reimplementation of the Johnny Castaway screensaver in the browser
- Learn and document the Dynamix Game Development System (DGDS) file formats
- Keep faithful script/composition behavior separate from browser compatibility
- Provide extraction, dump, test, and deterministic rendering-trace tooling

## Obtaining the Screensaver Data Files

The screensaver requires three proprietary data files that are not included in
this repository. These files originate from the original 1992/1993 Windows 3.1
floppy distribution by Sierra On-Line.

| Source | What you get | Notes |
|--------|-------------|-------|
| [Internet Archive](https://archive.org/details/screen-antics-johnny-castaway-16-color-v1.01-int.-1.4.93-win3.1-1.44m) | Win3.1 floppy `.ima` inside a ZIP | Use `pnpm run extract` below |

### Extracting from the Internet Archive floppy image

The `extract` script handles everything: it unpacks the ZIP, mounts the floppy
image, and decompresses the TSComp archives used by the original installer to
produce the screensaver data files.

**Prerequisites** (one-time setup):

```bash
# macOS
brew install mtools

# Linux (Debian/Ubuntu)
apt install mtools unzip
```

**Run the extractor:**

```bash
# 1. Download the ZIP from Internet Archive (~1.4 MB)
curl -L -O "https://archive.org/download/screen-antics-johnny-castaway-16-color-v1.01-int.-1.4.93-win3.1-1.44m/Screen%20Antics%20-%20Johnny%20Castaway%20(16%20Color)%20(v1.01%2C%20Int.%201.4.93)%20(Win3.1)%20(1.44M).zip"

# 2. Extract the game data files into public/data/
pnpm run extract -- "<path-to-downloaded.zip>"
```

The script writes `public/data/RESOURCE.MAP`, `RESOURCE.001`, and
`SCRANTIC.SCR` (the screensaver data files) and then cleans up all temporary
files.

## pnpm scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start Vite dev server at http://localhost:5173 |
| `pnpm run build` | Production build to `dist/` |
| `pnpm run preview` | Serve the `dist/` build locally |
| `pnpm run extract -- "<zip>"` | Extract screensaver data from Archive.org ZIP |
| `pnpm test` | Run the Vitest test suite |
| `pnpm run test:watch` | Run Vitest in watch mode while developing |
| `pnpm run test:coverage` | Run the Vitest suite with V8 coverage |
| `pnpm run test:golden` | Replay known rendering sequences against committed logical/pixel fingerprints (requires extracted data) |
| `pnpm run test:golden:update` | Regenerate rendering fingerprints after reviewing an intentional change (requires extracted data) |
| `pnpm run dump` | Dump screensaver assets to `dumps/` for inspection (requires extracted data) |

## Playback modes

The opening screen leaves the original Sierra artwork unobstructed and offers:

- **Classic** — native scale, static clouds and waves, and original presentation.
- **Enhanced** — responsive scaling, moving clouds and waves, plus a small HUD.

In Enhanced mode, use `←`/`→` to change scenes, `↑`/`↓` to change speed, and
`F` to enter or leave full screen. Every option remains individually adjustable
in Settings.

## Diagnostics

Choose **Settings** on the opening screen, or press `S` at any time. Sound can
be turned on or off there and the choice persists across reloads.

Set Diagnostics to **On**. This starts a fresh structured trace from the current
engine tick and enables the concise console log. Press `D` to open the developer
panel; opening it also enables diagnostics.

| URL | Output |
|-----|--------|
| `?debug` | Diagnostics on at page load |
| `?debug=verbose` | Same trace plus noisy per-sprite console output |

The `D` panel's **Download JSONL Trace** button downloads the capture. Its first
record identifies the build, browser, display, and engine state; later records
include lifecycle, drawing, timing-map, layer, pixel-fingerprint, and audio-sample
request/playback events. Headless tools can read `window.__DGDS__.getTrace()`,
download with `saveTrace()`, or write under `traces/` through the Vite-only
`persistTrace()` endpoint. Old diagnostics URLs remain compatible aliases.

## Documentation

- [Architecture](docs/architecture.md) — current execution model, repository map,
  host boundaries, and known compatibility gaps
- [Runtime boundaries ADR](docs/adr/0001-runtime-boundaries.md) — the intended
  separation between the DGDS machine, game package, host, and enhancements
- [DGDS learnings](LEARNINGS.md) and [resource index](docs/resindex.md) — file
  formats and reverse-engineering notes
- [Contributing](CONTRIBUTING.md) — verification and change guidelines

## Acknowledgements

See [NOTICE](NOTICE) for full IP attribution, original project credits, and special thanks.
