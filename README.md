# johnny_web

A web-native reimplementation of the 1992 [Johnny Castaway](https://en.wikipedia.org/wiki/Johnny_Castaway) screensaver, powered by **Bottle DGDS**: an experimental runtime, inspection, and conformance toolkit for DGDS animations.

![Johnny Castaway on his island beneath the screensaver title](castaway.png "Dynamix Johnny Castaway Screen Saver")

**tl;dr**
- Run `pnpm install` and `pnpm run extract -- "<path-to-downloaded.zip>"` to get started.
- This is a hard fork of [xesf/castaway](https://github.com/xesf/castaway) modernized for ES modules and Vite.
- You must supply the original screensaver data files to run the project.

## Getting started

Requirements: Node.js 20.19+ (or 22.12+) and pnpm 10. The original game data is also required and is not included in this repository.

```bash
pnpm install
pnpm run extract -- "<path-to-downloaded.zip>"
pnpm run dev       # http://localhost:5173
```

See [Obtaining the screensaver data files](#obtaining-the-screensaver-data-files) for the download and extractor prerequisites.

## Project goals

- Reimplement the Johnny Castaway screensaver in the browser.
- Learn and document the Dynamix Game Development System (DGDS) file formats.
- Keep faithful script/composition behavior separate from browser compatibility.
- Provide extraction, dump, test, and deterministic rendering-trace tooling.
- Continue extracting Bottle DGDS into reusable codecs, deterministic playback, inspection, and conformance tooling for compatible DGDS data.

## Obtaining the screensaver data files

The screensaver requires three proprietary data files that are not included in this repository. These files originate from the original 1992/1993 Windows 3.1 floppy distribution by Sierra On-Line.

| Source | What you get | Notes |
|--------|-------------|-------|
| [Internet Archive](https://archive.org/details/screen-antics-johnny-castaway-16-color-v1.01-int.-1.4.93-win3.1-1.44m) | Win3.1 floppy `.ima` inside a ZIP | Use `pnpm run extract` below |

### Extracting from the Internet Archive floppy image

The `extract` script handles everything — it unpacks the ZIP, mounts the floppy image, and decompresses the TSComp archives used by the original installer to produce the screensaver data files.

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

The script writes `public/data/RESOURCE.MAP`, `RESOURCE.001`, and `SCRANTIC.SCR` (the screensaver data files) and then cleans up all temporary files.

## Command reference

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

In Enhanced mode, use `←`/`→` to change scenes, `↑`/`↓` to change speed, and `F` to enter or leave full screen. Dismiss the status note with its close button; press `H` to hide or restore it. Every option remains individually adjustable in Settings.

During playback, move the pointer to reveal the Settings cog. Press `S` for Settings at any time, or `R` to stop playback and return to the title screen.

## Diagnostics

Choose **Settings** on the opening screen, or press `S` at any time. Sound can be turned on or off there, and the choice persists across reloads.

Set Diagnostics to **On**. This starts a fresh structured trace from the current engine tick and enables the concise console log. Press `D` to open the developer panel; opening it also enables diagnostics.

| URL | Output |
|-----|--------|
| `?debug` | Diagnostics on at page load |
| `?debug=verbose` | Same trace plus noisy per-sprite console output |

The developer panel's **Download JSONL trace** button downloads the capture. Its first record identifies the build, browser, display, and engine state. Later records include lifecycle, drawing, timing-map, layer, pixel-fingerprint, and audio-sample events.

Headless tools can read `window.__DGDS__.getTrace()`, download with `saveTrace()`, or write under `traces/` through the Vite-only `persistTrace()` endpoint. Old diagnostics URLs remain compatible aliases.

## Documentation

- [Architecture](docs/architecture.md) — current execution model, repository map, host boundaries, and known compatibility gaps
- [Runtime boundaries ADR](docs/adr/0001-runtime-boundaries.md) — the intended separation between the DGDS machine, game package, host, and enhancements
- [DGDS learnings](LEARNINGS.md) — file formats and reverse-engineering notes
- [Resource index](docs/resindex.md) — file formats and reverse-engineering notes
- [Contributing](CONTRIBUTING.md) — verification and change guidelines

## Engine roadmap

Bottle DGDS currently means the reusable DGDS codecs and machine, base package contract, and browser-presentation host under `src/dgds/` and `src/bottle/`. Johnny's manifest and UI live separately under `src/games/johnny/`.

The next portability milestone is to replay an independently sourced, non-interactive DGDS presentation by adding a package without changing the faithful machine. A complete DGDS game would additionally require interaction, dialogue, inventory, save-state, and title-native systems. These exercises should shape the API before it is treated as stable; Bottle does not claim drop-in compatibility today.

## Related projects and references

- [ScummVM DGDS engine](https://github.com/scummvm/scummvm/tree/master/engines/dgds) — the most complete open implementation and an important behavioral reference.
- [ScummVM DGDS detection table](https://github.com/scummvm/scummvm/blob/master/engines/dgds/detection_tables.h) — known DGDS releases, demos, platforms, and resource fingerprints.
- [xesf/castaway](https://github.com/xesf/castaway) — the project from which this repository was originally forked.
- [DGDS resource index](docs/resindex.md) and [reverse-engineering notes](LEARNINGS.md) — this project's current format findings.

## Acknowledgements

See [NOTICE](NOTICE) for full IP attribution, original project credits, and special thanks.
