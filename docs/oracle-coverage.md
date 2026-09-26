# Faithfulness coverage

This generated report compares each browser-engine gag with recordings from the
original program. `maxConc` is the largest number of actors drawn together;
vocabulary is the set of actor combinations seen; duration compares how long
matching actors remain visible. Original samples are converted to engine ticks
using the measured 2.85x cadence ratio before comparison.
Legacy full-capture totals are marked separately and excluded from duration
comparison because the original capture loops the gag repeatedly.

Regenerate with:

```
node tools/faithfulness-oracle/coverage-report.mjs
```

Generated from the current checkout on 2026-09-26.

## Summary

Catalogue: 66 gags · concurrency-covered: 64/64 · duration-covered (completed gags): 64/64 · duration actor coverage: 651/680 · legacy duration refs: 0 · hard concurrency divergences: 0 · lifespan reviews beyond 3x: 5 (2 short, 3 long) · vocab extras: 0 · unisolable: 2 (explained).

## Gags

| Gag | Ref data | maxConc (ours/ref) | Vocab overlap | Vocab extras | Duration sampling | Duration keys | Duration in-band | Status |
|-----|----------|---------------------|---------------|--------------|-------------------|---------------|-------------------|--------|
| ACTIVITY:1 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 9 seeds | 5/6 | 0/5 in-band (5/5 within 3x) | Aligned |
| ACTIVITY:4 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 3/3 | 0/3 in-band (3/3 within 3x) | Aligned |
| ACTIVITY:5 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 15/15 | 5/15 in-band (15/15 within 3x) | Aligned |
| ACTIVITY:6 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 10/10 | 3/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:7 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 9/9 | 3/9 in-band (9/9 within 3x) | Aligned |
| ACTIVITY:8 | +completed-gag | 2/2 = | 100% | — | 5 episodes / 9 seeds | 13/13 | 9/13 in-band (13/13 within 3x) | Aligned |
| ACTIVITY:9 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 10/10 | 0/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:10 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 14/14 | 4/14 in-band (14/14 within 3x) | Aligned |
| ACTIVITY:11 | +completed-gag | 5/5 = | 100% | — | 2 episodes / 9 seeds | 28/28 | 15/28 in-band (28/28 within 3x) | Aligned |
| ACTIVITY:12 | +completed-gag | 2/2 = | 100% | — | 3 episodes / 9 seeds | 10/10 | 2/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:1 | +completed-gag | 2/2 = | 100% | — | 5 episodes / 9 seeds | 10/10 | 3/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:2 | +completed-gag | 7/7 = | 100% | — | 2 episodes / 9 seeds | 33/33 | 12/33 in-band (33/33 within 3x) | Aligned |
| BUILDING:3 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 14/14 | 1/14 in-band (14/14 within 3x) | Aligned |
| BUILDING:4 | +completed-gag | 3/3 = | 100% | — | 1 episodes / 9 seeds | 17/17 | 1/17 in-band (17/17 within 3x) | Aligned |
| BUILDING:5 | +completed-gag | 3/3 = | 100% | — | 1 episodes / 9 seeds | 22/22 | 1/22 in-band (22/22 within 3x) | Aligned |
| BUILDING:6 | +completed-gag | 3/3 = | 100% | — | 1 episodes / 9 seeds | 16/16 | 0/16 in-band (16/16 within 3x) | Aligned |
| BUILDING:7 | +completed-gag | 3/3 = | 100% | — | 1 episodes / 25 seeds | 27/33 | 1/27 in-band (26/27 within 3x) | Review |
| BUILDING:8 | +completed-gag | 3/3 = | 100% | — | 1 episodes / 26 seeds | 27/33 | 1/27 in-band (26/27 within 3x) | Review |
| BUILDING:9 | +completed-gag | 3/3 = | 100% | — | 1 episodes / 9 seeds | 22/22 | 1/22 in-band (22/22 within 3x) | Aligned |
| FISHING:1 | +completed-gag | 1/1 = | 100% | — | 1 episodes / 17 seeds | 9/17 | 0/9 in-band (9/9 within 3x) | Aligned |
| FISHING:2 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 33 seeds | 12/16 | 3/12 in-band (12/12 within 3x) | Aligned |
| FISHING:3 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 11/11 | 5/11 in-band (11/11 within 3x) | Aligned |
| FISHING:4 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 3/3 | 1/3 in-band (3/3 within 3x) | Aligned |
| FISHING:5 | +completed-gag | 1/1 = | 100% | — | 5 episodes / 9 seeds | 2/2 | 0/2 in-band (2/2 within 3x) | Aligned |
| FISHING:6 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 1/5 in-band (5/5 within 3x) | Aligned |
| FISHING:7 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 17 seeds | 15/17 | 4/15 in-band (14/15 within 3x) | Review |
| FISHING:8 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 17 seeds | 13/13 | 2/13 in-band (12/13 within 3x) | Review |
| JOHNNY:1 | +completed-gag | 3/3 = | 100% | — | 3 episodes / 9 seeds | 7/7 | 0/7 in-band (7/7 within 3x) | Aligned |
| JOHNNY:2 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 14/14 | 1/14 in-band (14/14 within 3x) | Aligned |
| JOHNNY:3 | +completed-gag | 3/3 = | 100% | — | 4 episodes / 9 seeds | 11/11 | 0/11 in-band (11/11 within 3x) | Aligned |
| JOHNNY:4 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 8 seeds | 7/7 | 1/7 in-band (7/7 within 3x) | Aligned |
| JOHNNY:5 | +completed-gag | 2/2 = | 100% | — | 5 episodes / 8 seeds | 8/8 | 1/8 in-band (8/8 within 3x) | Aligned |
| JOHNNY:6 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 5/5 | 1/5 in-band (5/5 within 3x) | Aligned |
| MARY:1 | +completed-gag | 1/1 = | 100% | — | 1 episodes / 9 seeds | 8/10 | 1/8 in-band (8/8 within 3x) | Aligned |
| MARY:2 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 6/6 | 1/6 in-band (6/6 within 3x) | Aligned |
| MARY:3 | +completed-gag | 5/5 = | 100% | — | 1 episodes / 9 seeds | 33/33 | 8/33 in-band (33/33 within 3x) | Aligned |
| MARY:4 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 8/8 | 1/8 in-band (7/8 within 3x) | Review |
| MARY:5 | +completed-gag | 2/2 = | 100% | — | 3 episodes / 9 seeds | 3/3 | 1/3 in-band (3/3 within 3x) | Aligned |
| MISCGAG:1 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 7/7 | 0/7 in-band (7/7 within 3x) | Aligned |
| MISCGAG:2 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 3/3 | 0/3 in-band (3/3 within 3x) | Aligned |
| STAND:1 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 9 seeds | 4/4 | 1/4 in-band (4/4 within 3x) | Aligned |
| STAND:2 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 2/5 in-band (5/5 within 3x) | Aligned |
| STAND:3 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 2/5 in-band (5/5 within 3x) | Aligned |
| STAND:4 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 4/4 | 1/4 in-band (4/4 within 3x) | Aligned |
| STAND:5 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 4/4 | 1/4 in-band (4/4 within 3x) | Aligned |
| STAND:6 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 4/4 | 1/4 in-band (4/4 within 3x) | Aligned |
| STAND:7 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 9 seeds | 5/5 | 2/5 in-band (5/5 within 3x) | Aligned |
| STAND:8 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 1/5 in-band (5/5 within 3x) | Aligned |
| STAND:9 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 2/5 in-band (5/5 within 3x) | Aligned |
| STAND:10 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 2/5 in-band (5/5 within 3x) | Aligned |
| STAND:11 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 2/5 in-band (5/5 within 3x) | Aligned |
| STAND:12 | +completed-gag | 1/1 = | 100% | — | 6 episodes / 9 seeds | 3/3 | 0/3 in-band (3/3 within 3x) | Aligned |
| STAND:14 | — | — | — | — | — | — | — | Unisolable (init macro, transitively covered) |
| STAND:15 | +completed-gag | 1/1 = | 100% | — | 12 episodes / 9 seeds | 7/7 | 1/7 in-band (7/7 within 3x) | Aligned |
| STAND:16 | +completed-gag | 1/1 = | 100% | — | 6 episodes / 9 seeds | 7/7 | 3/7 in-band (7/7 within 3x) | Aligned |
| SUZY:1 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 11/11 | 1/11 in-band (11/11 within 3x) | Aligned |
| SUZY:2 | +completed-gag | 2/2 = | 100% | — | 3 episodes / 9 seeds | 5/5 | 0/5 in-band (5/5 within 3x) | Aligned |
| VISITOR:1 | +completed-gag | 1/1 = | 100% | — | 6 episodes / 9 seeds | 10/10 | 2/10 in-band (10/10 within 3x) | Aligned |
| VISITOR:3 | — | — | — | — | — | — | — | Unisolable (sibling-covered) |
| VISITOR:4 | +completed-gag | 3/3 = | 100% | — | 7 episodes / 9 seeds | 7/7 | 3/7 in-band (7/7 within 3x) | Aligned |
| VISITOR:5 | +completed-gag | 2/2 = | 100% | — | 4 episodes / 9 seeds | 7/7 | 2/7 in-band (7/7 within 3x) | Aligned |
| VISITOR:6 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 9/9 | 2/9 in-band (9/9 within 3x) | Aligned |
| VISITOR:7 | +completed-gag | 3/3 = | 100% | — | 3 episodes / 9 seeds | 8/8 | 3/8 in-band (8/8 within 3x) | Aligned |
| WALKSTUF:1 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 12/12 | 0/12 in-band (12/12 within 3x) | Aligned |
| WALKSTUF:2 | +completed-gag | 1/1 = | 100% | — | 5 episodes / 9 seeds | 6/6 | 2/6 in-band (6/6 within 3x) | Aligned |
| WALKSTUF:3 | +completed-gag | 1/1 = | 100% | — | 1 episodes / 9 seeds | 13/13 | 3/13 in-band (13/13 within 3x) | Aligned |

## Contiguous-span reviews beyond 3x

| Gag | Actor | Direction | Engine ticks | Original samples | Factor | Sampling |
|-----|-------|-----------|--------------|------------------|--------|----------|
| BUILDING:7 | 3:83 | long | 115 | 10–10 | 3.67x | 1 episodes / 25 seeds |
| BUILDING:8 | 3:83 | long | 115 | 10–10 | 3.67x | 1 episodes / 26 seeds |
| FISHING:7 | 4:44 | short | 2 | 15–17 | 19.95x | 3 episodes / 17 seeds |
| FISHING:8 | 4:44 | short | 2 | 16–18 | 21.38x | 2 episodes / 17 seeds |
| MARY:4 | 5:37 | long | 256 | 12–13 | 6.42x | 2 episodes / 9 seeds |

## Reading the report

- Peak concurrency is the hard check. A difference of one is allowed for capture variation; two or more fails.
- Vocabulary and duration are review aids. Random branches differ between runs, and the reference range comes from a small sample. The duration column compares engine ticks with reference samples scaled by 2.85; the 3x band marks substantial differences for investigation.
- Only completed-gag-v2 contiguous actor spans are comparable. Legacy capture totals and captures without a complete gag are shown without a duration verdict.
- Duration sampling shows complete original gag episodes versus deterministic browser seeds. Each actor's longest browser span is compared with the original span range. Gag occupancy and repeat counts are stored separately for branch frequency review. Duration keys counts actors with measured complete-gag spans against the full reference vocabulary.
- `VISITOR:3` is orphaned content and `STAND:14` is a shared setup macro, so neither can be captured alone. Their callers cover them indirectly.
- The `STAND:1-12` vocabulary comparison is not meaningful. The browser test and original capture reach these idle poses through different paths; matching concurrency does not yet prove that the pose itself is correct.
