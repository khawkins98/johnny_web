# Contributing

Thanks for your interest in contributing to johnny_web! Please follow these guidelines to keep the project clean and easy to navigate.

## Pull Requests

- All changes must come in via a pull request — no direct commits to `main`.
- Keep PRs focused: one logical change per PR. Split unrelated work into separate PRs.
- Provide a clear description of *what* changed and *why*.
- Link any related issues in the PR description.

## Commit Style

- **Squash your commits** before merging. Each PR should land as a single, well-described commit on `main`.
- Write commit messages in the imperative mood: `Add wave animation`, not `Added wave animation`.
- Keep the subject line under 72 characters. Use the body for context if needed.

## Changelog

- Every PR that changes behaviour, adds a feature, or fixes a bug **must** include an entry in [`CHANGELOG.md`](CHANGELOG.md).
- Add your entry under the `## [Unreleased]` section using one of these prefixes:
  - `Added` – new features
  - `Changed` – changes to existing behaviour
  - `Fixed` – bug fixes
  - `Removed` – removed features
- Follow [Keep a Changelog](https://keepachangelog.com) conventions.

## Code Style

- Use ES modules (`.mjs` or `type="module"`) throughout — no CommonJS.
- Prefer native Web APIs over third-party libraries where reasonable.
- Run the project locally and verify your change works before opening a PR.

## Getting Started

```bash
cd src
http-server -c-1
# open http://localhost:8080
```

See the [README](README.md) for full setup instructions.
