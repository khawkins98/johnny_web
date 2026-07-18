# johnny_web

A web-native reimplementation of the [Johnny Castaway](https://en.wikipedia.org/wiki/Johnny_Castaway) screensaver originally created by Dynamix (Sierra On-Line) in 1992. This project was hard forked from [xesf/castaway](https://github.com/xesf/castaway) and considerably revamed with a focus on idiomatic, standards-based web development.

![alt text](castaway.png "Dynamix Johnny Castaway Screen Saver")

## Getting started

```bash
pnpm install
pnpm run dev       # http://localhost:5173
```

Game data files are required — see [Obtaining the Game Data Files](#obtaining-the-game-data-files) below.

## Purpose

- Reimplementation of the Johnny Castaway screensaver in the browser
- Modernize the codebase toward web-native patterns (ES modules, Web APIs, Vite)
- Learn and document the Dynamix Game Development System (DGDS) file formats
- Provide extraction and dump tools via Node.js (for a full desktop asset viewer, see [xesf/dgds-viewer](https://github.com/xesf/dgds-viewer))
- Learn something, play with AI as a helper

## Obtaining the Screensaver Data Files

The screensaver requires three proprietary data files that are not included in
this repository. These files originate from the original 1992/1993 Windows 3.1
floppy distribution by Sierra On-Line.

| Source | What you get | Notes |
|--------|-------------|-------|
| [Internet Archive](https://archive.org/details/screen-antics-johnny-castaway-16-color-v1.01-int.-1.4.93-win3.1-1.44m) | Win3.1 floppy `.ima` inside a ZIP | Use `pnpm run extract` below |
| [My Abandonware](https://www.myabandonware.com/search/q/johnny+castaway) | Likely a pre-extracted installer ZIP |  |

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
| `pnpm run test:coverage` | Run the Vitest test suite with Istanbul coverage |
| `pnpm run dump` | Dump screensaver assets to `dumps/` for inspection |

## Animation traces

For rendering diagnostics, open the development server with tracing enabled:

```text
http://localhost:5173/?trace=1&debug=verbose
```

Press `D`, reproduce the problem, and choose **Save JSONL Trace**. The Vite
development server writes the result under `traces/` (ignored by Git). Each
composition record includes the logical engine tick, ordered active scene
layers, layer revisions, an exact pixel hash, non-transparent bounds, and pixel
count. Sprite and GET/PUT operations are separate structured events.

Headless browser automation can call `window.__DGDS__.saveTrace()` after the
desired run. JSON Lines is the canonical format because it preserves nested
layer data; CSV can be derived from it when useful for analysis.

## Acknowledgements

See [NOTICE](NOTICE) for full IP attribution, original project credits, and special thanks.
