# Contributing

Follow the [README setup](README.md#run-locally) to get the app running. You can run the unit tests and build without the original game data; playback and fidelity checks need it.

## Finding your way around

| Path | What lives here |
| --- | --- |
| `src/games/johnny/` | Johnny's scene selection, story, settings, and UI |
| `src/dgds/` | Resource parsers and the DGDS script runtime |
| `src/dgds/hosts/` | Browser scheduling, audio, and frame presentation |
| `src/bottle/` | Shared application startup, package APIs, and developer panel |
| `test/` | Rendering goldens and comparisons with the original program |

Unit tests also live alongside the source in `__tests__/` directories. Read the [architecture guide](docs/architecture.md) when working on execution or rendering, and use the [diagnostics guide](docs/diagnostics.md) to investigate playback bugs.

## Local game data

Browser imports stay in IndexedDB. To make the data available to tests and command-line tools, extract the downloaded floppy ZIP into `public/data/`:

```bash
pnpm run extract "<path-to-zip>"
```

The extractor requires `unzip` and `mcopy` on your PATH. On macOS, `unzip` is built in and `brew install mtools` provides `mcopy`. On Debian/Ubuntu, install both with `apt install unzip mtools`.

This creates `RESOURCE.MAP`, `RESOURCE.001`, and `SCRANTIC.SCR`. Keep these proprietary files out of Git. The output directories `public/data/`, `dumps/`, and `traces/` are ignored; save lasting reverse-engineering findings in tests or documentation instead of committing generated asset dumps or inventories.

To test the first-run import screen, use `pnpm run dev:empty`. It hides local assets and opens `/?reset`, which clears the browser's imported data.

## Making changes

Use ES modules and prefer native Web APIs where practical. Keep script behavior in the DGDS runtime, browser adaptations in the host modules, and Johnny-specific behavior in `src/games/johnny/`. Give compatibility fixes a descriptive name and a focused test.

If you consult another implementation, record the upstream file and the behavior you checked in a test or document. ScummVM's DGDS engine is a GPL-3.0-or-later reference; see [NOTICE](NOTICE). Copying or adapting its source into this MIT-licensed project requires identifying its provenance and satisfying the applicable license and copyright requirements.

## Checking your work

Before opening a PR, run:

```bash
pnpm test
pnpm run build
```

For app changes, also check the affected behavior in the browser. Use `pnpm run test:watch` while developing, or `pnpm run test:coverage` for a coverage report.

For rendering or scheduling changes, extract the game data first, then run:

```bash
pnpm test
pnpm run test:golden
```

**CI has no game data.** It runs the test suite and build, but skips data-dependent gag, faithfulness, and rendering checks. A green CI run therefore doesn't establish fidelity to the original. Run those checks locally with data present; `test:golden` also skips when data is absent.

Only run `pnpm run test:golden:update` after visually reviewing an intentional rendering change. To run just the comparison with the original program, use `pnpm run test:faithful`. Regenerating its reference recordings requires a patched DOSBox-X build; see the [oracle methodology](tools/faithfulness-oracle/METHODOLOGY.md).

For rendering bugs, enable [diagnostics](docs/diagnostics.md), reproduce the issue, and attach a downloaded JSONL trace.

## Pull requests

Keep each PR to one logical change. Describe what changed, why, and how you checked it; link related issues. All changes go through a PR rather than directly to `main`, and each PR should be squash-merged as one commit.

Use [Conventional Commits](https://www.conventionalcommits.org) with a subject under 72 characters, for example:

```text
feat(audio): support stereo sample playback
fix(resource): handle missing PAL entries gracefully
docs: clarify local setup
```
