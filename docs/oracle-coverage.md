# Oracle coverage report

This is a **generated** per-gag alignment/fidelity report for the differential
faithfulness oracle (`test/faithfulness-diff.mjs`). It drives OUR engine against
each of the committed original-binary reference fingerprints in
`test/faithfulness-refs/` and reports, per gag: maxConc alignment, vocabulary
overlap, and (where lifespan data exists) duration in-band coverage.

Regenerate with:

```
node tools/faithfulness-oracle/coverage-report.mjs
```

Reflects HEAD `803e0d1`, generated 2026-09-03.

## Summary

Catalogue: 66 gags · concurrency-covered: 64/64 · duration-covered (lifespans): 21/64 · hard divergences: 0 · unisolable: 2 (explained).

## Per-gag table

| Gag | Ref data | maxConc (ours/ref) | Vocab overlap | Duration in-band | Status |
|-----|----------|---------------------|---------------|-------------------|--------|
| ACTIVITY:1 | +lifespans | 2/1 +1 | 100% | 0/4 in-band (2/4 within 3x) | Review |
| ACTIVITY:4 | maxConc-only | 1/1 = | 100% | — | No-duration-data |
| ACTIVITY:5 | maxConc-only | 2/2 = | 100% | — | No-duration-data |
| ACTIVITY:6 | maxConc-only | 2/2 = | 100% | — | No-duration-data |
| ACTIVITY:7 | +lifespans | 2/1 +1 | 100% | 0/9 in-band (8/9 within 3x) | Review |
| ACTIVITY:8 | +lifespans | 3/2 +1 | 100% | 0/13 in-band (6/13 within 3x) | Review |
| ACTIVITY:9 | maxConc-only | 2/2 = | 100% | — | No-duration-data |
| ACTIVITY:10 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| ACTIVITY:11 | +lifespans | 6/5 +1 | 100% | 4/28 in-band (24/28 within 3x) | Review |
| ACTIVITY:12 | maxConc-only | 2/2 = | 100% | — | No-duration-data |
| BUILDING:1 | maxConc-only | 2/2 = | 100% | — | No-duration-data |
| BUILDING:2 | +lifespans | 6/7 -1 | 100% | 2/33 in-band (25/33 within 3x) | Review |
| BUILDING:3 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| BUILDING:4 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| BUILDING:5 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| BUILDING:6 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| BUILDING:7 | maxConc-only | 3/3 = | 88% | — | No-duration-data |
| BUILDING:8 | maxConc-only | 3/3 = | 86% | — | No-duration-data |
| BUILDING:9 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| FISHING:1 | +lifespans | 2/1 +1 | 100% | 1/13 in-band (10/13 within 3x) | Review |
| FISHING:2 | +lifespans | 2/1 +1 | 100% | 3/13 in-band (9/13 within 3x) | Review |
| FISHING:3 | maxConc-only | 2/2 = | 100% | — | No-duration-data |
| FISHING:4 | +lifespans | 2/1 +1 | 100% | 0/3 in-band (0/3 within 3x) | Review |
| FISHING:5 | maxConc-only | 1/1 = | 100% | — | No-duration-data |
| FISHING:6 | +lifespans | 2/1 +1 | 100% | 1/5 in-band (5/5 within 3x) | Aligned |
| FISHING:7 | +lifespans | 2/1 +1 | 100% | 5/17 in-band (13/17 within 3x) | Review |
| FISHING:8 | +lifespans | 2/1 +1 | 100% | 0/11 in-band (6/11 within 3x) | Review |
| JOHNNY:1 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| JOHNNY:2 | +lifespans | 3/3 = | 100% | 1/14 in-band (14/14 within 3x) | Aligned |
| JOHNNY:3 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| JOHNNY:4 | +lifespans | 2/1 +1 | 100% | 7/7 in-band (7/7 within 3x) | Aligned |
| JOHNNY:5 | maxConc-only | 2/2 = | 100% | — | No-duration-data |
| JOHNNY:6 | +lifespans | 2/1 +1 | 100% | 0/4 in-band (4/4 within 3x) | Aligned |
| MARY:1 | maxConc-only | 1/1 = | 100% | — | No-duration-data |
| MARY:2 | maxConc-only | 2/2 = | 100% | — | No-duration-data |
| MARY:3 | maxConc-only | 5/5 = | 100% | — | No-duration-data |
| MARY:4 | maxConc-only | 2/2 = | 88% | — | No-duration-data |
| MARY:5 | maxConc-only | 2/2 = | 100% | — | No-duration-data |
| MISCGAG:1 | maxConc-only | 1/1 = | 100% | — | No-duration-data |
| MISCGAG:2 | maxConc-only | 1/1 = | 100% | — | No-duration-data |
| STAND:1 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:2 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:3 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:4 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:5 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:6 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:7 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:8 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:9 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:10 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:11 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:12 | maxConc-only | 1/1 = | 0% | — | Review |
| STAND:14 | — | — | — | — | Unisolable (init macro, transitively covered) |
| STAND:15 | +lifespans | 2/1 +1 | 100% | 0/7 in-band (7/7 within 3x) | Aligned |
| STAND:16 | +lifespans | 2/1 +1 | 100% | 2/7 in-band (7/7 within 3x) | Aligned |
| SUZY:1 | +lifespans | 2/1 +1 | 100% | 0/10 in-band (9/10 within 3x) | Review |
| SUZY:2 | +lifespans | 2/1 +1 | 100% | 0/4 in-band (3/4 within 3x) | Review |
| VISITOR:1 | +lifespans | 2/1 +1 | 100% | 4/10 in-band (8/10 within 3x) | Review |
| VISITOR:3 | — | — | — | — | Unisolable (sibling-covered) |
| VISITOR:4 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| VISITOR:5 | maxConc-only | 2/2 = | 100% | — | No-duration-data |
| VISITOR:6 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| VISITOR:7 | maxConc-only | 3/3 = | 100% | — | No-duration-data |
| WALKSTUF:1 | +lifespans | 3/2 +1 | 100% | 0/12 in-band (12/12 within 3x) | Aligned |
| WALKSTUF:2 | +lifespans | 2/1 +1 | 100% | 0/6 in-band (3/6 within 3x) | Review |
| WALKSTUF:3 | maxConc-only | 1/1 = | 100% | — | No-duration-data |

## Caveats

- **Duration is a gross-divergence signal, not fine duration matching.**
  Absolute lifespan tick-counts carry roughly ±3x reference-capture noise: the
  original binary's capture sessions ran under `cycles=max` / `GetTickCount`
  pacing, where the DOSBox director's real invocation rate varies session to
  session (see `scratchpad/findings/delay-calibration-rootcause.md` and
  `scratchpad/findings/global-timing-ratio.md`). The "within 3x" duration band
  is deliberately loose so it only catches egregious divergences -- a stuck-on
  or dropped-early actor (e.g. the JOHNNY:2 0x2020 flash/stuck-hold bug this
  oracle caught) -- not subtle timing drift. Exact-duration ground truth would
  need a deterministic LFG-seeded capture of the original binary, which is
  tracked separately in `tools/faithfulness-oracle/rng-port.md`.
- **43 of the 64 committed refs lack lifespan data** (`maxConc-only`), which is
  a known duration-coverage gap, not a fidelity problem -- those refs predate
  the lifespans field. They are enrichable by regenerating with
  `node tools/faithfulness-oracle/gen-refs.mjs --gags NAME:tag,... --runs 8`.
- **Vocab overlap** is computed against the reference union (an RNG-tolerant
  lower bound over `ref.runs` original-binary runs), so it is the more
  reliable coverage metric here; a gag can show less than 100% overlap simply
  because our single seed-union run didn't happen to hit every RNG branch the
  binary's multi-run union did -- see `test/faithfulness-diff.mjs` for why
  vocab diffs are review-only, not a hard gate.
- **VISITOR:3** and **STAND:14** cannot be driven in isolation by `driveGag`
  (VISITOR:3 only ever runs as a sibling of another VISITOR gag; STAND:14 is an
  init-only macro tag with no independent draw path) -- they are covered
  transitively through the gags that invoke them, and are listed here as
  explicit catalogue rows rather than silently omitted.
