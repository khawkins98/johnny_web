# Changelog

All notable changes to this project will be documented here.

This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions.

## [Unreleased]

### Added
- Bottle DGDS namespace with a validated game-package contract and reusable
  browser-host entry point
- Runtime-selectable diagnostics with downloadable JSONL traces, pixel
  fingerprints, and session/build/device metadata
- Fixed-step DGDS timing, logical drawing surfaces, per-resource TTM
  environments, and deterministic recording surfaces for tests
- Deterministic RGBA software framebuffer and golden logical-frame checks for
  bathing, dive/walk-out, gull-landing, and concurrent-layer sequences
- `pnpm run extract` command to unpack the floppy image and decompress its
  archives into `public/data/`
- `node-pkware` dependency for PKWARE DCL implode decompression
- Full-viewport error overlay for missing or unreadable game data
- GitHub Pages deployment workflow (`.github/workflows/deploy.yml`)
- `pnpm run dump` command for inspecting extracted game assets

### Changed
- Johnny startup, settings, and Enhanced UI now live under its game namespace;
  generic palette data now lives under DGDS
- TTM interpretation now reports structured execution outcomes to the ADS
  scheduler, and logical frame reset/restore behavior has its own engine boundary
- TTM scenes now render to retained software layers; foreground composition is
  rebuilt in ADS painter order only when retained layer revisions change
- Browser settings, wall time, randomness, drawing, and diagnostics are explicit
  host boundaries rather than opcode-interpreter globals
- Diagnostics now present a clear Off/On setting; the legacy verbose URL remains
  available for live console investigation
- The Enhanced-mode HUD now matches the parchment UI and can be dismissed or
  restored with `H`
- Pointer movement now reveals a temporary Settings cog; Settings includes a
  compact shortcut guide and a return-to-title action (`R`)
- Migrated local development and production builds to Vite
- Resource loading now reports binary parse failures and detects Vite fallback
  responses in the error overlay

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
- Corrected canvas layout styles and restored the `.instruction` selector
- Historical attribution: corrected initial release year to 1992 (stable release 1.02 in 1993)

### Docs
- README rewritten: concise getting-started, npm scripts table, roadmap, attribution consolidated in NOTICE
- NOTICE: credits Dynamix/Sierra On-Line/Activision Blizzard as rights holder; Wikipedia link added
- CONTRIBUTING: conventional commits, squash-merge policy, changelog requirement
- Dead code annotated in source with "kept for future adaptation" comments
