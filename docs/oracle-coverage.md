# Faithfulness coverage

This generated report compares each browser-engine gag with recordings from the
original program. `maxConc` is the largest number of actors drawn together;
vocabulary is the set of actor combinations seen; duration compares how long
matching actors remain visible.

Regenerate with:

```
node tools/faithfulness-oracle/coverage-report.mjs
```

Reflects HEAD `083301f`, generated 2026-09-04.

## Summary

Catalogue: 66 gags · concurrency-covered: 64/64 · duration-covered (lifespans): 52/64 · hard divergences: 0 · unisolable: 2 (explained).

## Gags

| Gag | Ref data | maxConc (ours/ref) | Vocab overlap | Duration in-band | Status |
|-----|----------|---------------------|---------------|-------------------|--------|
| ACTIVITY:1 | +lifespans | 2/1 +1 | 100% | 0/4 in-band (2/4 within 3x) | Review |
| ACTIVITY:4 | +lifespans | 1/1 = | 100% | 0/3 in-band (3/3 within 3x) | Aligned |
| ACTIVITY:5 | +lifespans | 2/2 = | 100% | 0/15 in-band (15/15 within 3x) | Aligned |
| ACTIVITY:6 | +lifespans | 2/2 = | 100% | 2/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:7 | +lifespans | 2/1 +1 | 100% | 0/9 in-band (8/9 within 3x) | Review |
| ACTIVITY:8 | +lifespans | 3/2 +1 | 100% | 0/13 in-band (6/13 within 3x) | Review |
| ACTIVITY:9 | +lifespans | 2/2 = | 100% | 1/8 in-band (8/8 within 3x) | Aligned |
| ACTIVITY:10 | +lifespans | 3/3 = | 100% | 6/14 in-band (14/14 within 3x) | Aligned |
| ACTIVITY:11 | +lifespans | 6/5 +1 | 100% | 4/28 in-band (24/28 within 3x) | Review |
| ACTIVITY:12 | +lifespans | 2/2 = | 100% | 2/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:1 | +lifespans | 2/2 = | 100% | 0/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:2 | +lifespans | 6/7 -1 | 100% | 2/33 in-band (25/33 within 3x) | Review |
| BUILDING:3 | +lifespans | 3/3 = | 100% | 0/13 in-band (12/13 within 3x) | Review |
| BUILDING:4 | +lifespans | 3/3 = | 100% | 0/17 in-band (12/17 within 3x) | Review |
| BUILDING:5 | +lifespans | 3/3 = | 100% | 3/22 in-band (19/22 within 3x) | Review |
| BUILDING:6 | +lifespans | 3/3 = | 100% | 0/16 in-band (13/16 within 3x) | Review |
| BUILDING:7 | +lifespans | 3/3 = | 100% | 0/30 in-band (21/30 within 3x) | Review |
| BUILDING:8 | +lifespans | 3/3 = | 100% | 2/27 in-band (19/27 within 3x) | Review |
| BUILDING:9 | +lifespans | 3/3 = | 100% | 0/22 in-band (18/22 within 3x) | Review |
| FISHING:1 | +lifespans | 2/1 +1 | 100% | 1/13 in-band (10/13 within 3x) | Review |
| FISHING:2 | +lifespans | 2/1 +1 | 100% | 3/13 in-band (9/13 within 3x) | Review |
| FISHING:3 | +lifespans | 2/2 = | 100% | 1/9 in-band (6/9 within 3x) | Review |
| FISHING:4 | +lifespans | 2/1 +1 | 100% | 0/3 in-band (0/3 within 3x) | Review |
| FISHING:5 | +lifespans | 1/1 = | 100% | 0/1 in-band (1/1 within 3x) | Aligned |
| FISHING:6 | +lifespans | 2/1 +1 | 100% | 1/5 in-band (5/5 within 3x) | Aligned |
| FISHING:7 | +lifespans | 2/1 +1 | 100% | 5/17 in-band (13/17 within 3x) | Review |
| FISHING:8 | +lifespans | 2/1 +1 | 100% | 0/11 in-band (6/11 within 3x) | Review |
| JOHNNY:1 | +lifespans | 3/3 = | 100% | 0/6 in-band (6/6 within 3x) | Aligned |
| JOHNNY:2 | +lifespans | 3/3 = | 100% | 1/14 in-band (14/14 within 3x) | Aligned |
| JOHNNY:3 | +lifespans | 3/3 = | 100% | 3/11 in-band (10/11 within 3x) | Review |
| JOHNNY:4 | +lifespans | 2/1 +1 | 100% | 7/7 in-band (7/7 within 3x) | Aligned |
| JOHNNY:5 | +lifespans | 2/2 = | 100% | 0/8 in-band (8/8 within 3x) | Aligned |
| JOHNNY:6 | +lifespans | 2/1 +1 | 100% | 0/4 in-band (4/4 within 3x) | Aligned |
| MARY:1 | +lifespans | 1/1 = | 100% | 2/10 in-band (10/10 within 3x) | Aligned |
| MARY:2 | +lifespans | 2/2 = | 100% | 0/6 in-band (6/6 within 3x) | Aligned |
| MARY:3 | +lifespans | 5/5 = | 100% | 0/33 in-band (30/33 within 3x) | Review |
| MARY:4 | +lifespans | 2/2 = | 88% | 1/7 in-band (7/7 within 3x) | Aligned |
| MARY:5 | +lifespans | 2/2 = | 100% | 3/3 in-band (3/3 within 3x) | Aligned |
| MISCGAG:1 | +lifespans | 1/1 = | 100% | 0/7 in-band (7/7 within 3x) | Aligned |
| MISCGAG:2 | +lifespans | 1/1 = | 100% | 0/3 in-band (3/3 within 3x) | Aligned |
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
| VISITOR:4 | +lifespans | 3/3 = | 100% | 0/7 in-band (5/7 within 3x) | Review |
| VISITOR:5 | +lifespans | 2/2 = | 100% | 0/7 in-band (7/7 within 3x) | Aligned |
| VISITOR:6 | +lifespans | 3/3 = | 100% | 3/9 in-band (9/9 within 3x) | Aligned |
| VISITOR:7 | +lifespans | 3/3 = | 100% | 2/8 in-band (8/8 within 3x) | Aligned |
| WALKSTUF:1 | +lifespans | 3/2 +1 | 100% | 0/12 in-band (12/12 within 3x) | Aligned |
| WALKSTUF:2 | +lifespans | 2/1 +1 | 100% | 0/6 in-band (3/6 within 3x) | Review |
| WALKSTUF:3 | +lifespans | 1/1 = | 100% | 0/13 in-band (12/13 within 3x) | Review |

## Reading the report

- Peak concurrency is the hard check. A difference of one is allowed for capture variation; two or more fails.
- Vocabulary and duration are review aids. Random branches differ between runs, and DOSBox timing makes precise duration comparisons unreliable. The 3x band is intended to catch actors that vanish early or remain stuck on screen.
- `VISITOR:3` is orphaned content and `STAND:14` is a shared setup macro, so neither can be captured alone. Their callers cover them indirectly.
- The `STAND:1-12` vocabulary comparison is not meaningful. The browser test and original capture reach these idle poses through different paths; matching concurrency does not yet prove that the pose itself is correct.
