# Changelog

All notable changes to this project will be documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions.

## [Unreleased]

### Added
- Runtime-selectable diagnostics with downloadable JSONL traces, pixel
  fingerprints, and session/build/device metadata
- Fixed-step DGDS timing, logical drawing surfaces, per-resource TTM
  environments, and deterministic recording surfaces for tests
- `npm run extract` script (`src/extract.mjs`) — unpacks the Archive.org floppy ZIP, mounts the `.ima` image via `mtools`, and decompresses the TSComp/PKWARE archives to `public/data/`
- `node-pkware` dependency for PKWARE DCL implode decompression
- Full-viewport error overlay (`#data-error`) shown when screensaver data files are missing or unreadable, with per-file status list and download guidance
- GitHub Pages deployment workflow (`.github/workflows/deploy.yml`)
- `npm run dump` script for inspecting extracted game assets

### Changed
- TTM scenes now render to retained scene layers; the foreground composition is
  rebuilt every logical frame in ADS painter order
- Browser settings, wall time, randomness, drawing, and diagnostics are explicit
  host boundaries rather than opcode-interpreter globals
- Diagnostics now present a clear Off/On setting; the legacy verbose URL remains
  available for live console investigation
- Migrated from plain HTTP serving to **Vite** for local dev and production builds
- Error overlay wired to DOM (was attempting canvas drawing); uses `classList.add('visible')` toggle
- `loadResources()` wrapped in try/catch to surface binary parse errors in the overlay
- Vite SPA-fallback 200 response correctly detected via `content-type` check (was silently treated as success)
- `#data-error` overlay uses `position: fixed; inset: 0` for full-viewport coverage

### Fixed
- GET/PUT restoration now overwrites transparent pixels correctly
- Unsaved `CLEAR_SCREEN` slots clear their isolated scene layer instead of
  retaining every animation frame
- Concurrent TTM scenes use private GET/PUT working buffers, preventing one
  scene's saved region from corrupting another scene's animation
- `CLEAR_SCREEN` resets the complete scene layer before restoring a saved
  rectangle, removing sprite trails outside that rectangle
- `PLAY_SCENE` unblocks after an intentional `GOTO` ambient completes its first
  loop while still waiting for finite scenes and their requested retries
- TTM resource prologues finish before sibling scenes can draw or contaminate
  saved regions
- Stopped scenes disappear from the next composition instead of leaving their
  final pixels on a persistent shared canvas
- Layout: removed inline `style="width: 100%"` on `#root` that was overriding the canvas container width
- CSS: restored accidentally dropped `.instruction` selector that left bare properties silently ignored
- Historical attribution: corrected initial release year to 1992 (stable release 1.02 in 1993)

### Docs
- README rewritten: concise getting-started, npm scripts table, roadmap, attribution consolidated in NOTICE
- NOTICE: credits Dynamix/Sierra On-Line/Activision Blizzard as rights holder; Wikipedia link added
- CONTRIBUTING: conventional commits, squash-merge policy, changelog requirement
- Dead code annotated in source with "kept for future adaptation" comments
