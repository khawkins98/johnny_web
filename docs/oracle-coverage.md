# Faithfulness coverage

This generated report compares each browser-engine gag with recordings from the
original program. `maxConc` is the largest number of actors drawn together;
vocabulary is the set of actor combinations seen; duration compares how long
matching actors remain visible.

Regenerate with:

```
node tools/faithfulness-oracle/coverage-report.mjs
```

Reflects HEAD `74311be`, generated 2026-09-25.

## Summary

Catalogue: 66 gags · concurrency-covered: 64/64 · duration-covered (lifespans): 64/64 · hard divergences: 0 · unisolable: 2 (explained).

## Gags

| Gag | Ref data | maxConc (ours/ref) | Vocab overlap | Duration in-band | Status |
|-----|----------|---------------------|---------------|-------------------|--------|
| ACTIVITY:1 | +lifespans | 1/1 = | 100% | 0/6 in-band (1/6 within 3x) | Review |
| ACTIVITY:4 | +lifespans | 1/1 = | 100% | 0/3 in-band (3/3 within 3x) | Aligned |
| ACTIVITY:5 | +lifespans | 2/2 = | 100% | 1/15 in-band (15/15 within 3x) | Aligned |
| ACTIVITY:6 | +lifespans | 2/2 = | 100% | 0/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:7 | +lifespans | 1/1 = | 100% | 2/9 in-band (9/9 within 3x) | Aligned |
| ACTIVITY:8 | +lifespans | 2/2 = | 100% | 0/13 in-band (13/13 within 3x) | Aligned |
| ACTIVITY:9 | +lifespans | 2/2 = | 100% | 0/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:10 | +lifespans | 3/3 = | 100% | 0/14 in-band (14/14 within 3x) | Aligned |
| ACTIVITY:11 | +lifespans | 5/5 = | 100% | 2/28 in-band (28/28 within 3x) | Aligned |
| ACTIVITY:12 | +lifespans | 2/2 = | 100% | 1/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:1 | +lifespans | 2/2 = | 100% | 0/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:2 | +lifespans | 7/7 = | 100% | 1/33 in-band (33/33 within 3x) | Aligned |
| BUILDING:3 | +lifespans | 3/3 = | 100% | 0/14 in-band (13/14 within 3x) | Review |
| BUILDING:4 | +lifespans | 3/3 = | 100% | 0/17 in-band (12/17 within 3x) | Review |
| BUILDING:5 | +lifespans | 3/3 = | 100% | 0/22 in-band (12/22 within 3x) | Review |
| BUILDING:6 | +lifespans | 3/3 = | 100% | 0/16 in-band (11/16 within 3x) | Review |
| BUILDING:7 | +lifespans | 3/3 = | 100% | 0/31 in-band (23/31 within 3x) | Review |
| BUILDING:8 | +lifespans | 3/3 = | 100% | 0/27 in-band (13/27 within 3x) | Review |
| BUILDING:9 | +lifespans | 3/3 = | 100% | 0/22 in-band (6/22 within 3x) | Review |
| FISHING:1 | +lifespans | 1/1 = | 100% | 0/17 in-band (5/17 within 3x) | Review |
| FISHING:2 | +lifespans | 1/1 = | 100% | 1/13 in-band (7/13 within 3x) | Review |
| FISHING:3 | +lifespans | 2/2 = | 100% | 0/11 in-band (11/11 within 3x) | Aligned |
| FISHING:4 | +lifespans | 1/1 = | 100% | 0/3 in-band (3/3 within 3x) | Aligned |
| FISHING:5 | +lifespans | 1/1 = | 100% | 0/2 in-band (2/2 within 3x) | Aligned |
| FISHING:6 | +lifespans | 1/1 = | 100% | 0/5 in-band (5/5 within 3x) | Aligned |
| FISHING:7 | +lifespans | 1/1 = | 100% | 0/17 in-band (10/17 within 3x) | Review |
| FISHING:8 | +lifespans | 1/1 = | 100% | 2/12 in-band (10/12 within 3x) | Review |
| JOHNNY:1 | +lifespans | 3/3 = | 100% | 0/7 in-band (7/7 within 3x) | Aligned |
| JOHNNY:2 | +lifespans | 3/3 = | 100% | 1/14 in-band (14/14 within 3x) | Aligned |
| JOHNNY:3 | +lifespans | 3/3 = | 100% | 3/11 in-band (11/11 within 3x) | Aligned |
| JOHNNY:4 | +lifespans | 1/1 = | 100% | 0/7 in-band (7/7 within 3x) | Aligned |
| JOHNNY:5 | +lifespans | 2/2 = | 100% | 0/8 in-band (8/8 within 3x) | Aligned |
| JOHNNY:6 | +lifespans | 1/1 = | 100% | 0/5 in-band (5/5 within 3x) | Aligned |
| MARY:1 | +lifespans | 1/1 = | 100% | 0/10 in-band (6/10 within 3x) | Review |
| MARY:2 | +lifespans | 2/2 = | 100% | 0/6 in-band (6/6 within 3x) | Aligned |
| MARY:3 | +lifespans | 5/5 = | 100% | 0/33 in-band (30/33 within 3x) | Review |
| MARY:4 | +lifespans | 2/2 = | 100% | 1/8 in-band (7/8 within 3x) | Review |
| MARY:5 | +lifespans | 2/2 = | 100% | 0/3 in-band (3/3 within 3x) | Aligned |
| MISCGAG:1 | +lifespans | 1/1 = | 100% | 0/7 in-band (7/7 within 3x) | Aligned |
| MISCGAG:2 | +lifespans | 1/1 = | 100% | 0/3 in-band (3/3 within 3x) | Aligned |
| STAND:1 | +lifespans | 1/1 = | 100% | 0/4 in-band (3/4 within 3x) | Review |
| STAND:2 | +lifespans | 1/1 = | 100% | 0/5 in-band (3/5 within 3x) | Review |
| STAND:3 | +lifespans | 1/1 = | 100% | 0/5 in-band (5/5 within 3x) | Aligned |
| STAND:4 | +lifespans | 1/1 = | 100% | 0/4 in-band (4/4 within 3x) | Aligned |
| STAND:5 | +lifespans | 1/1 = | 100% | 0/4 in-band (2/4 within 3x) | Review |
| STAND:6 | +lifespans | 1/1 = | 100% | 0/4 in-band (4/4 within 3x) | Aligned |
| STAND:7 | +lifespans | 1/1 = | 100% | 1/5 in-band (5/5 within 3x) | Aligned |
| STAND:8 | +lifespans | 1/1 = | 100% | 1/5 in-band (5/5 within 3x) | Aligned |
| STAND:9 | +lifespans | 1/1 = | 100% | 0/5 in-band (5/5 within 3x) | Aligned |
| STAND:10 | +lifespans | 1/1 = | 100% | 0/5 in-band (5/5 within 3x) | Aligned |
| STAND:11 | +lifespans | 1/1 = | 100% | 0/5 in-band (5/5 within 3x) | Aligned |
| STAND:12 | +lifespans | 1/1 = | 100% | 2/3 in-band (3/3 within 3x) | Aligned |
| STAND:14 | — | — | — | — | Unisolable (init macro, transitively covered) |
| STAND:15 | +lifespans | 1/1 = | 100% | 1/7 in-band (7/7 within 3x) | Aligned |
| STAND:16 | +lifespans | 1/1 = | 100% | 1/7 in-band (7/7 within 3x) | Aligned |
| SUZY:1 | +lifespans | 2/2 = | 100% | 2/11 in-band (11/11 within 3x) | Aligned |
| SUZY:2 | +lifespans | 2/2 = | 100% | 0/5 in-band (5/5 within 3x) | Aligned |
| VISITOR:1 | +lifespans | 1/1 = | 100% | 1/10 in-band (10/10 within 3x) | Aligned |
| VISITOR:3 | — | — | — | — | Unisolable (sibling-covered) |
| VISITOR:4 | +lifespans | 3/3 = | 100% | 0/7 in-band (5/7 within 3x) | Review |
| VISITOR:5 | +lifespans | 2/2 = | 100% | 0/7 in-band (7/7 within 3x) | Aligned |
| VISITOR:6 | +lifespans | 3/3 = | 100% | 1/9 in-band (9/9 within 3x) | Aligned |
| VISITOR:7 | +lifespans | 3/3 = | 100% | 3/8 in-band (8/8 within 3x) | Aligned |
| WALKSTUF:1 | +lifespans | 2/2 = | 100% | 0/12 in-band (12/12 within 3x) | Aligned |
| WALKSTUF:2 | +lifespans | 1/1 = | 100% | 0/6 in-band (5/6 within 3x) | Review |
| WALKSTUF:3 | +lifespans | 1/1 = | 100% | 0/13 in-band (12/13 within 3x) | Review |

## Reading the report

- Peak concurrency is the hard check. A difference of one is allowed for capture variation; two or more fails.
- Vocabulary and duration are review aids. Random branches differ between runs, and DOSBox timing makes precise duration comparisons unreliable. The 3x band is intended to catch actors that vanish early or remain stuck on screen.
- `VISITOR:3` is orphaned content and `STAND:14` is a shared setup macro, so neither can be captured alone. Their callers cover them indirectly.
- The `STAND:1-12` vocabulary comparison is not meaningful. The browser test and original capture reach these idle poses through different paths; matching concurrency does not yet prove that the pose itself is correct.
