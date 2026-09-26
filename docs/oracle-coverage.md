# Faithfulness coverage

This generated report compares each browser-engine gag with recordings from the
original program. `maxConc` is the largest number of actors drawn together;
vocabulary is the set of actor combinations seen; duration compares how long
matching actors remain visible. Original samples are converted to engine ticks
using the measured 2.85x cadence ratio before comparison.

Regenerate with:

```
node tools/faithfulness-oracle/coverage-report.mjs
```

Generated from the current checkout on 2026-09-26.

## Summary

Catalogue: 66 gags · concurrency-covered: 64/64 · duration-covered (lifespans): 64/64 · hard concurrency divergences: 0 · lifespan reviews beyond 3x: 136 (130 short, 6 long) · vocab extras: 3 · unisolable: 2 (explained).

## Gags

| Gag | Ref data | maxConc (ours/ref) | Vocab overlap | Vocab extras | Duration in-band | Status |
|-----|----------|---------------------|---------------|--------------|-------------------|--------|
| ACTIVITY:1 | +lifespans | 1/1 = | 100% | — | 0/6 in-band (6/6 within 3x) | Aligned |
| ACTIVITY:4 | +lifespans | 1/1 = | 100% | — | 0/3 in-band (0/3 within 3x) | Review |
| ACTIVITY:5 | +lifespans | 2/2 = | 100% | — | 0/15 in-band (15/15 within 3x) | Aligned |
| ACTIVITY:6 | +lifespans | 2/2 = | 100% | — | 1/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:7 | +lifespans | 1/1 = | 100% | — | 0/9 in-band (2/9 within 3x) | Review |
| ACTIVITY:8 | +lifespans | 2/2 = | 100% | — | 0/13 in-band (0/13 within 3x) | Review |
| ACTIVITY:9 | +lifespans | 2/2 = | 100% | — | 0/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:10 | +lifespans | 3/3 = | 100% | — | 0/14 in-band (12/14 within 3x) | Review |
| ACTIVITY:11 | +lifespans | 5/5 = | 100% | — | 0/28 in-band (28/28 within 3x) | Aligned |
| ACTIVITY:12 | +lifespans | 2/2 = | 100% | — | 0/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:1 | +lifespans | 2/2 = | 100% | — | 0/10 in-band (0/10 within 3x) | Review |
| BUILDING:2 | +lifespans | 7/7 = | 100% | — | 0/33 in-band (33/33 within 3x) | Aligned |
| BUILDING:3 | +lifespans | 3/3 = | 100% | — | 5/14 in-band (14/14 within 3x) | Aligned |
| BUILDING:4 | +lifespans | 3/3 = | 100% | — | 5/17 in-band (17/17 within 3x) | Aligned |
| BUILDING:5 | +lifespans | 3/3 = | 100% | — | 1/22 in-band (22/22 within 3x) | Aligned |
| BUILDING:6 | +lifespans | 3/3 = | 100% | — | 1/16 in-band (16/16 within 3x) | Aligned |
| BUILDING:7 | +lifespans | 3/3 = | 100% | — | 12/33 in-band (32/33 within 3x) | Review |
| BUILDING:8 | +lifespans | 3/3 = | 100% | 3 | 10/30 in-band (29/30 within 3x) | Review |
| BUILDING:9 | +lifespans | 3/3 = | 100% | — | 0/22 in-band (22/22 within 3x) | Aligned |
| FISHING:1 | +lifespans | 1/1 = | 100% | — | 2/17 in-band (17/17 within 3x) | Aligned |
| FISHING:2 | +lifespans | 1/1 = | 100% | — | 3/16 in-band (15/16 within 3x) | Review |
| FISHING:3 | +lifespans | 2/2 = | 100% | — | 0/11 in-band (11/11 within 3x) | Aligned |
| FISHING:4 | +lifespans | 1/1 = | 100% | — | 0/3 in-band (0/3 within 3x) | Review |
| FISHING:5 | +lifespans | 1/1 = | 100% | — | 0/2 in-band (0/2 within 3x) | Review |
| FISHING:6 | +lifespans | 1/1 = | 100% | — | 0/5 in-band (0/5 within 3x) | Review |
| FISHING:7 | +lifespans | 1/1 = | 100% | — | 4/17 in-band (15/17 within 3x) | Review |
| FISHING:8 | +lifespans | 1/1 = | 100% | — | 2/13 in-band (12/13 within 3x) | Review |
| JOHNNY:1 | +lifespans | 3/3 = | 100% | — | 0/7 in-band (1/7 within 3x) | Review |
| JOHNNY:2 | +lifespans | 3/3 = | 100% | — | 0/14 in-band (13/14 within 3x) | Review |
| JOHNNY:3 | +lifespans | 3/3 = | 100% | — | 0/11 in-band (8/11 within 3x) | Review |
| JOHNNY:4 | +lifespans | 1/1 = | 100% | — | 0/7 in-band (5/7 within 3x) | Review |
| JOHNNY:5 | +lifespans | 2/2 = | 100% | — | 0/8 in-band (0/8 within 3x) | Review |
| JOHNNY:6 | +lifespans | 1/1 = | 100% | — | 0/5 in-band (3/5 within 3x) | Review |
| MARY:1 | +lifespans | 1/1 = | 100% | — | 1/10 in-band (8/10 within 3x) | Review |
| MARY:2 | +lifespans | 2/2 = | 100% | — | 0/6 in-band (6/6 within 3x) | Aligned |
| MARY:3 | +lifespans | 5/5 = | 100% | — | 1/33 in-band (33/33 within 3x) | Aligned |
| MARY:4 | +lifespans | 2/2 = | 100% | — | 0/8 in-band (5/8 within 3x) | Review |
| MARY:5 | +lifespans | 2/2 = | 100% | — | 0/3 in-band (3/3 within 3x) | Aligned |
| MISCGAG:1 | +lifespans | 1/1 = | 100% | — | 0/7 in-band (3/7 within 3x) | Review |
| MISCGAG:2 | +lifespans | 1/1 = | 100% | — | 0/3 in-band (0/3 within 3x) | Review |
| STAND:1 | +lifespans | 1/1 = | 100% | — | 1/4 in-band (4/4 within 3x) | Aligned |
| STAND:2 | +lifespans | 1/1 = | 100% | — | 0/5 in-band (5/5 within 3x) | Aligned |
| STAND:3 | +lifespans | 1/1 = | 100% | — | 1/5 in-band (5/5 within 3x) | Aligned |
| STAND:4 | +lifespans | 1/1 = | 100% | — | 1/4 in-band (4/4 within 3x) | Aligned |
| STAND:5 | +lifespans | 1/1 = | 100% | — | 0/4 in-band (4/4 within 3x) | Aligned |
| STAND:6 | +lifespans | 1/1 = | 100% | — | 0/4 in-band (4/4 within 3x) | Aligned |
| STAND:7 | +lifespans | 1/1 = | 100% | — | 0/5 in-band (5/5 within 3x) | Aligned |
| STAND:8 | +lifespans | 1/1 = | 100% | — | 1/5 in-band (5/5 within 3x) | Aligned |
| STAND:9 | +lifespans | 1/1 = | 100% | — | 0/5 in-band (5/5 within 3x) | Aligned |
| STAND:10 | +lifespans | 1/1 = | 100% | — | 1/5 in-band (5/5 within 3x) | Aligned |
| STAND:11 | +lifespans | 1/1 = | 100% | — | 0/5 in-band (5/5 within 3x) | Aligned |
| STAND:12 | +lifespans | 1/1 = | 100% | — | 0/3 in-band (2/3 within 3x) | Review |
| STAND:14 | — | — | — | — | — | Unisolable (init macro, transitively covered) |
| STAND:15 | +lifespans | 1/1 = | 100% | — | 0/7 in-band (2/7 within 3x) | Review |
| STAND:16 | +lifespans | 1/1 = | 100% | — | 1/7 in-band (3/7 within 3x) | Review |
| SUZY:1 | +lifespans | 2/2 = | 100% | — | 0/11 in-band (7/11 within 3x) | Review |
| SUZY:2 | +lifespans | 2/2 = | 100% | — | 0/5 in-band (1/5 within 3x) | Review |
| VISITOR:1 | +lifespans | 1/1 = | 100% | — | 2/10 in-band (6/10 within 3x) | Review |
| VISITOR:3 | — | — | — | — | — | Unisolable (sibling-covered) |
| VISITOR:4 | +lifespans | 3/3 = | 100% | — | 0/7 in-band (0/7 within 3x) | Review |
| VISITOR:5 | +lifespans | 2/2 = | 100% | — | 0/7 in-band (1/7 within 3x) | Review |
| VISITOR:6 | +lifespans | 3/3 = | 100% | — | 0/9 in-band (5/9 within 3x) | Review |
| VISITOR:7 | +lifespans | 3/3 = | 100% | — | 0/8 in-band (3/8 within 3x) | Review |
| WALKSTUF:1 | +lifespans | 2/2 = | 100% | — | 0/12 in-band (11/12 within 3x) | Review |
| WALKSTUF:2 | +lifespans | 1/1 = | 100% | — | 0/6 in-band (0/6 within 3x) | Review |
| WALKSTUF:3 | +lifespans | 1/1 = | 100% | — | 0/13 in-band (13/13 within 3x) | Aligned |

## Reading the report

- Peak concurrency is the hard check. A difference of one is allowed for capture variation; two or more fails.
- Vocabulary and duration are review aids. Random branches differ between runs, and the reference range comes from a small sample. The duration column compares engine ticks with reference samples scaled by 2.85; the 3x band marks substantial differences for investigation.
- `VISITOR:3` is orphaned content and `STAND:14` is a shared setup macro, so neither can be captured alone. Their callers cover them indirectly.
- The `STAND:1-12` vocabulary comparison is not meaningful. The browser test and original capture reach these idle poses through different paths; matching concurrency does not yet prove that the pose itself is correct.
