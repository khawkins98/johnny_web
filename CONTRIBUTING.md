# Contributing

A public reference for contributing to johnny_web. Follow these guidelines to keep the project clean and easy to navigate.

## Getting started

```bash
pnpm install
pnpm run dev       # http://localhost:5173
```

The data is proprietary and not committed. See the [README](README.md) for the supported download and extractor prerequisites.

## Pull requests

- All changes must come in via a pull request — no direct commits to `main`.
- Keep PRs focused — one logical change per PR. Split unrelated work into separate PRs.
- Provide a clear description of _what_ changed and _why_.
- Link any related issues in the PR description.

## Commit style

- **Squash your commits** before merging. Each PR should land as a single, well-described commit on `main`.
- Use **[Conventional Commits](https://www.conventionalcommits.org)** format:
    ```
    <type>(<optional scope>): <description>

    [optional body]
    ```
    Common types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`
- Keep the subject line under 72 characters.

Examples:

```
feat(audio): support stereo sample playback
fix(resource): handle missing PAL entries gracefully
docs: update setup instructions for Vite
```



## Code style

- Use ES modules (`.mjs` or `type="module"`) throughout — no CommonJS.
- Prefer native Web APIs over third-party libraries where reasonable.
- Run the project locally and verify your change works before opening a PR.

## Finding your way around

Start with [`docs/architecture.md`](docs/architecture.md), which describes the execution model and links code to responsibilities. The main boundaries are:

- `src/dgds/` — reusable resource parsing and faithful DGDS execution
- `src/dgds/hosts/` — browser scheduling, audio, and presentation adapters
- `src/bottle/` — experimental package and browser-presentation APIs
- `src/games/johnny/` — Johnny-specific resources, startup composition, and UI

Keep DGDS behavior, title-specific compatibility, browser accommodation, and optional enhancements in their respective layers. New compatibility rules should be named, scoped, and covered by a focused test.

## Verification and diagnostics

- Run `pnpm test` and `pnpm run build` before opening a PR.
- Rendering changes also require extracted local data and `pnpm run test:golden`. Use `pnpm run test:golden:update` only after visually reviewing an intentional logical-frame change.
- Use `pnpm run dump` to regenerate ignored inspection output under `dumps/`. Do not commit proprietary files from `public/data/`, derived dumps, asset inventories, or ad hoc root-level extraction scripts.
- Preserve findings that need to survive regeneration in parser/runtime tests and the relevant document under `docs/`.
- Press `S` to open Settings and enable diagnostics, or press `D` to open the developer panel and enable them immediately.
- For rendering bugs, reproduce after enabling diagnostics and attach the downloaded JSONL trace. Use `?debug=verbose` only when live sprite logs help.
