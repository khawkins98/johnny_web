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

Catalogue: 66 gags · concurrency-covered: 64/64 · duration-covered (completed gags): 64/64 · duration actor coverage: 651/680 · legacy duration refs: 0 · hard concurrency divergences: 0 · lifespan reviews beyond 3x: 0 (0 short, 0 long) · vocab extras: 0 · unisolable: 2 (explained).

## Gags

| Gag | Ref data | maxConc (ours/ref) | Vocab overlap | Vocab extras | Duration sampling | Duration keys | Duration in-band | Status |
|-----|----------|---------------------|---------------|--------------|-------------------|---------------|-------------------|--------|
| ACTIVITY:1 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 9 seeds | 5/6 | 1/5 in-band (5/5 within 3x) | Aligned |
| ACTIVITY:4 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 3/3 | 0/3 in-band (3/3 within 3x) | Aligned |
| ACTIVITY:5 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 15/15 | 7/15 in-band (15/15 within 3x) | Aligned |
| ACTIVITY:6 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 10/10 | 4/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:7 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 9/9 | 4/9 in-band (9/9 within 3x) | Aligned |
| ACTIVITY:8 | +completed-gag | 2/2 = | 100% | — | 5 episodes / 9 seeds | 13/13 | 11/13 in-band (13/13 within 3x) | Aligned |
| ACTIVITY:9 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 10/10 | 0/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:10 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 14/14 | 6/14 in-band (14/14 within 3x) | Aligned |
| ACTIVITY:11 | +completed-gag | 5/5 = | 100% | — | 2 episodes / 9 seeds | 28/28 | 16/28 in-band (28/28 within 3x) | Aligned |
| ACTIVITY:12 | +completed-gag | 2/2 = | 100% | — | 3 episodes / 9 seeds | 10/10 | 2/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:1 | +completed-gag | 2/2 = | 100% | — | 5 episodes / 9 seeds | 10/10 | 4/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:2 | +completed-gag | 7/7 = | 100% | — | 2 episodes / 9 seeds | 33/33 | 11/33 in-band (33/33 within 3x) | Aligned |
| BUILDING:3 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 14/14 | 3/14 in-band (14/14 within 3x) | Aligned |
| BUILDING:4 | +completed-gag | 3/3 = | 100% | — | 1 episode / 9 seeds | 17/17 | 4/17 in-band (17/17 within 3x) | Aligned |
| BUILDING:5 | +completed-gag | 3/3 = | 100% | — | 1 episode / 9 seeds | 22/22 | 1/22 in-band (22/22 within 3x) | Aligned |
| BUILDING:6 | +completed-gag | 3/3 = | 100% | — | 1 episode / 9 seeds | 16/16 | 3/16 in-band (16/16 within 3x) | Aligned |
| BUILDING:7 | +completed-gag | 3/3 = | 100% | — | 1 episode / 25 seeds | 27/33 | 1/27 in-band (27/27 within 3x) | Aligned |
| BUILDING:8 | +completed-gag | 3/3 = | 100% | — | 1 episode / 26 seeds | 27/33 | 1/27 in-band (27/27 within 3x) | Aligned |
| BUILDING:9 | +completed-gag | 3/3 = | 100% | — | 1 episode / 9 seeds | 22/22 | 1/22 in-band (22/22 within 3x) | Aligned |
| FISHING:1 | +completed-gag | 1/1 = | 100% | — | 1 episode / 17 seeds | 9/17 | 0/9 in-band (9/9 within 3x) | Aligned |
| FISHING:2 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 33 seeds | 12/16 | 2/12 in-band (12/12 within 3x) | Aligned |
| FISHING:3 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 11/11 | 5/11 in-band (11/11 within 3x) | Aligned |
| FISHING:4 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 3/3 | 0/3 in-band (3/3 within 3x) | Aligned |
| FISHING:5 | +completed-gag | 1/1 = | 100% | — | 5 episodes / 9 seeds | 2/2 | 0/2 in-band (2/2 within 3x) | Aligned |
| FISHING:6 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 1/5 in-band (5/5 within 3x) | Aligned |
| FISHING:7 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 17 seeds | 15/17 | 3/15 in-band (15/15 within 3x) | Aligned |
| FISHING:8 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 17 seeds | 13/13 | 4/13 in-band (13/13 within 3x) | Aligned |
| JOHNNY:1 | +completed-gag | 3/3 = | 100% | — | 3 episodes / 9 seeds | 7/7 | 1/7 in-band (7/7 within 3x) | Aligned |
| JOHNNY:2 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 14/14 | 3/14 in-band (14/14 within 3x) | Aligned |
| JOHNNY:3 | +completed-gag | 3/3 = | 100% | — | 4 episodes / 9 seeds | 11/11 | 2/11 in-band (11/11 within 3x) | Aligned |
| JOHNNY:4 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 8 seeds | 7/7 | 2/7 in-band (7/7 within 3x) | Aligned |
| JOHNNY:5 | +completed-gag | 2/2 = | 100% | — | 5 episodes / 8 seeds | 8/8 | 2/8 in-band (8/8 within 3x) | Aligned |
| JOHNNY:6 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 5/5 | 2/5 in-band (5/5 within 3x) | Aligned |
| MARY:1 | +completed-gag | 1/1 = | 100% | — | 1 episode / 9 seeds | 8/10 | 4/8 in-band (8/8 within 3x) | Aligned |
| MARY:2 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 6/6 | 1/6 in-band (6/6 within 3x) | Aligned |
| MARY:3 | +completed-gag | 5/5 = | 100% | — | 1 episode / 9 seeds | 33/33 | 7/33 in-band (33/33 within 3x) | Aligned |
| MARY:4 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 8/8 | 2/8 in-band (8/8 within 3x) | Aligned |
| MARY:5 | +completed-gag | 2/2 = | 100% | — | 3 episodes / 9 seeds | 3/3 | 0/3 in-band (3/3 within 3x) | Aligned |
| MISCGAG:1 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 7/7 | 2/7 in-band (7/7 within 3x) | Aligned |
| MISCGAG:2 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 3/3 | 0/3 in-band (3/3 within 3x) | Aligned |
| STAND:1 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 9 seeds | 4/4 | 2/4 in-band (4/4 within 3x) | Aligned |
| STAND:2 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 5/5 in-band (5/5 within 3x) | Aligned |
| STAND:3 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 5/5 in-band (5/5 within 3x) | Aligned |
| STAND:4 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 4/4 | 3/4 in-band (4/4 within 3x) | Aligned |
| STAND:5 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 4/4 | 4/4 in-band (4/4 within 3x) | Aligned |
| STAND:6 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 4/4 | 3/4 in-band (4/4 within 3x) | Aligned |
| STAND:7 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 9 seeds | 5/5 | 4/5 in-band (5/5 within 3x) | Aligned |
| STAND:8 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 4/5 in-band (5/5 within 3x) | Aligned |
| STAND:9 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 4/5 in-band (5/5 within 3x) | Aligned |
| STAND:10 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 4/5 in-band (5/5 within 3x) | Aligned |
| STAND:11 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 4/5 in-band (5/5 within 3x) | Aligned |
| STAND:12 | +completed-gag | 1/1 = | 100% | — | 6 episodes / 9 seeds | 3/3 | 3/3 in-band (3/3 within 3x) | Aligned |
| STAND:14 | — | — | — | — | — | — | — | Unisolable (init macro, transitively covered) |
| STAND:15 | +completed-gag | 1/1 = | 100% | — | 12 episodes / 9 seeds | 7/7 | 1/7 in-band (7/7 within 3x) | Aligned |
| STAND:16 | +completed-gag | 1/1 = | 100% | — | 6 episodes / 9 seeds | 7/7 | 3/7 in-band (7/7 within 3x) | Aligned |
| SUZY:1 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 11/11 | 4/11 in-band (11/11 within 3x) | Aligned |
| SUZY:2 | +completed-gag | 2/2 = | 100% | — | 3 episodes / 9 seeds | 5/5 | 0/5 in-band (5/5 within 3x) | Aligned |
| VISITOR:1 | +completed-gag | 1/1 = | 100% | — | 6 episodes / 9 seeds | 10/10 | 2/10 in-band (10/10 within 3x) | Aligned |
| VISITOR:3 | — | — | — | — | — | — | — | Unisolable (sibling-covered) |
| VISITOR:4 | +completed-gag | 3/3 = | 100% | — | 7 episodes / 9 seeds | 7/7 | 3/7 in-band (7/7 within 3x) | Aligned |
| VISITOR:5 | +completed-gag | 2/2 = | 100% | — | 4 episodes / 9 seeds | 7/7 | 1/7 in-band (7/7 within 3x) | Aligned |
| VISITOR:6 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 9/9 | 3/9 in-band (9/9 within 3x) | Aligned |
| VISITOR:7 | +completed-gag | 3/3 = | 100% | — | 3 episodes / 9 seeds | 8/8 | 3/8 in-band (8/8 within 3x) | Aligned |
| WALKSTUF:1 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 12/12 | 0/12 in-band (12/12 within 3x) | Aligned |
| WALKSTUF:2 | +completed-gag | 1/1 = | 100% | — | 5 episodes / 9 seeds | 6/6 | 3/6 in-band (6/6 within 3x) | Aligned |
| WALKSTUF:3 | +completed-gag | 1/1 = | 100% | — | 1 episode / 9 seeds | 13/13 | 4/13 in-band (13/13 within 3x) | Aligned |

## Contiguous-span reviews beyond 3x

The factor uses a one-sample allowance at each observed span boundary to
account for start/end phase between original samples. The table shows the raw
sample range; the allowance is applied before the 2.85x cadence conversion.

| Gag | Actor | Direction | Engine ticks | Original samples | Factor | Sampling |
|-----|-------|-----------|--------------|------------------|--------|----------|
| — | — | — | — | — | — | — |

## Reading the report

- Peak concurrency is the hard check. A difference of one is allowed for capture variation; two or more fails.
- Vocabulary and duration are review aids. Random branches differ between runs, and the reference range comes from a small sample. The duration column compares engine ticks with reference samples scaled by 2.85 and allows one sample at each span boundary for unknown sample phase; the 3x band marks substantial differences for investigation.
- Only completed-gag-v2 contiguous actor spans are comparable. Legacy capture totals and captures without a complete gag are shown without a duration verdict.
- Duration sampling shows complete original gag episodes versus deterministic browser seeds. Each actor's longest browser span is compared with the original span range. Gag occupancy and repeat counts are stored separately for branch frequency review. Duration keys counts actors with measured complete-gag spans against the full reference vocabulary.
- Duration and vocabulary remain advisory. The original branch sample is small (some gags have only one complete episode), 29 vocabulary keys still lack completed-episode span evidence, and the three remaining long-span reviews need coordinated timing fixes. The fish branch appeared only after 24 earlier original captures, so an unobserved actor key alone cannot justify a failing assertion. Peak concurrency retains its failing check.
- `VISITOR:3` is orphaned content and `STAND:14` is a shared setup macro, so neither can be captured alone. Their callers cover them indirectly.
- The `STAND:1-12` vocabulary comparison is not meaningful. The browser test and original capture reach these idle poses through different paths; matching concurrency does not yet prove that the pose itself is correct.

<!-- pixel-oracle:begin -->
## Pixel oracle

Keyframe pixel comparison of the browser render with tick-aligned framebuffer
captures of the original (forced, one episode per gag). Method, masks and
limitations: [pixel-oracle/README.md](../tools/faithfulness-oracle/pixel-oracle/README.md).
Scores are the percentage of masked pixels that differ, per keyframe; the gag
figure is the median over keyframes (live-set transitions, mid-span samples,
and the tick after each LOAD_SCREEN / STORE_AREA), best-aligned within a small
tick window. `raw` is as rendered; `aligned` moves our foreground by the
gag's dominant offset first (see the offset column). Palette substitutions
(Windows static colours) are not counted as differences.

Regenerate with (local only; needs the patched DOSBox-X and game data):

```
node tools/faithfulness-oracle/pixel-oracle/capture-gags.mjs
node tools/faithfulness-oracle/pixel-oracle/sweep.mjs
```

Generated 2026-10-22; comparator sweep 377s.

Verdicts (aligned median <= 2% = faithful, "outlier keyframe" when one keyframe exceeds 8%; median <= 5% = close; else divergent): faithful, outlier keyframe 26 · faithful 35 · divergent 1 · close 2. Foreground offset (ours -> original, dx,dy): 1,0 in 64 gags.

| Gag | Live-set coverage | Seed | Keyframes | Raw median | Aligned median | Aligned max | Offset | Palette subst. | Stale px | Black plate (top) | Verdict |
|-----|------|------|------|------|------|------|------|------|------|------|------|
| ACTIVITY:1 | 100% | 2 | 9 | 7.7% | 0.09% | 12.33% | 1,0 (5/5) | 0% | 0 | 53.51% | faithful, outlier keyframe |
| ACTIVITY:4 | 100% | 1 | 10 | 3.12% | 0.11% | 4.67% | 1,0 (8/9) | 0% | 0 | 45.93% | faithful |
| ACTIVITY:5 | 100% | 1 | 36 | 6.37% | 0.05% | 1.42% | 1,0 (32/32) | 0% | 0 | 37.37% | faithful |
| ACTIVITY:6 | 100% | 1 | 35 | 7.73% | 0.02% | 9.16% | 1,0 (34/35) | 0% | 0 | 17.03% | faithful, outlier keyframe |
| ACTIVITY:7 | 100% | 1 | 25 | 8.22% | 0.02% | 9.16% | 1,0 (24/25) | 0% | 0 | 10.6% | faithful, outlier keyframe |
| ACTIVITY:8 | 61.2% (low) | 1 | 26 | 16.65% | 0.82% | 12.7% | 1,0 (24/25) | 0% | 0 | 27.62% | faithful, outlier keyframe |
| ACTIVITY:9 | 100% | 1 | 29 | 5.92% | 0.01% | 3.31% | 1,0 (25/26) | 0% | 0 | 42.29% | faithful |
| ACTIVITY:10 | 64.4% (low) | 1 | 27 | 4.34% | 0.04% | 9.16% | 1,0 (26/27) | 0% | 0 | 35.93% | faithful, outlier keyframe |
| ACTIVITY:11 | 90.1% | 2 | 46 | 7.4% | 0.34% | 10.57% | 1,0 (44/44) | 0% | 0 | 40.16% | faithful, outlier keyframe |
| ACTIVITY:12 | 80.7% | 1 | 24 | 3.83% | 0.06% | 15.91% | 1,0 (20/22) | 0% | 0 | 38.33% | faithful, outlier keyframe |
| BUILDING:1 | 78.7% (low) | 1 | 19 | 13.42% | 0.19% | 13.42% | 1,0 (14/14) | 0% | 0 | 17.19% | faithful, outlier keyframe |
| BUILDING:2 | 65.9% (low) | 1 | 50 | 16.16% | 12.59% | 30.34% | 1,0 (37/37) | 0% | 181 | 62.78% | divergent |
| BUILDING:3 | 62% (low) | 1 | 31 | 5.56% | 0.03% | 5.01% | 1,0 (31/31) | 0% | 0 | 17.48% | faithful |
| BUILDING:4 | 100% | 1 | 48 | 13.34% | 0.92% | 20.21% | 1,0 (41/41) | 0% | 181 | 62.46% | faithful, outlier keyframe |
| BUILDING:5 | 71.3% (low) | 1 | 49 | 5.59% | 0% | 5.13% | 1,0 (46/47) | 0.15% | 0 | 21.48% | faithful |
| BUILDING:6 | 100% | 1 | 48 | 13.36% | 0.95% | 15.9% | 1,0 (43/43) | 0% | 181 | 61.28% | faithful, outlier keyframe |
| BUILDING:7 | 68.7% (low) | 1 | 49 | 5.9% | 0% | 6.07% | 1,0 (48/48) | 0.15% | 0 | 21.54% | faithful |
| BUILDING:8 | 66.7% (low) | 11 | 49 | 6.72% | 0.25% | 8.05% | 1,0 (41/42) | 0.15% | 0 | 21.69% | faithful, outlier keyframe |
| BUILDING:9 | 70.4% (low) | 8 | 49 | 5.61% | 0% | 10.96% | 1,0 (46/47) | 0.15% | 0 | 21.4% | faithful, outlier keyframe |
| FISHING:1 | 100% | 3 | 33 | 3.63% | 0.52% | 11.36% | 1,0 (29/32) | 0% | 0 | 38.5% | faithful, outlier keyframe |
| FISHING:2 | 96.2% | 11 | 35 | 3.75% | 0.52% | 11.36% | 1,0 (34/34) | 0% | 0 | 36.31% | faithful, outlier keyframe |
| FISHING:3 | 100% | 1 | 31 | 3.74% | 0.47% | 11.36% | 1,0 (29/29) | 0% | 0 | 49.48% | faithful, outlier keyframe |
| FISHING:4 | 100% | 1 | 11 | 6.22% | 0.18% | 17.4% | 1,0 (6/6) | 0% | 0 | 25.01% | faithful, outlier keyframe |
| FISHING:5 | 100% | 1 | 8 | 10.1% | 0.16% | 12.72% | 1,0 (4/4) | 0% | 0 | 16.47% | faithful, outlier keyframe |
| FISHING:6 | 100% | 1 | 15 | 3.7% | 0.46% | 4.02% | 1,0 (14/14) | 0% | 0 | 36.39% | faithful |
| FISHING:7 | 98.6% | 4 | 46 | 6.16% | 0.17% | 0.62% | 1,0 (46/46) | 0% | 0 | 16.61% | faithful |
| FISHING:8 | 85.5% | 11 | 49 | 5.96% | 0.18% | 5.36% | 1,0 (48/49) | 0% | 0 | 16.61% | faithful |
| JOHNNY:1 | 100% | 1 | 16 | 0.92% | 0% | 0.68% | 1,0 (11/11) | 23.08% | 32 | 66.2% | faithful |
| JOHNNY:2 | 69% (low) | 1 | 24 | 6.13% | 0.14% | 10.89% | 1,0 (22/22) | 0% | 0 | 32.88% | faithful, outlier keyframe |
| JOHNNY:3 | 85.5% | 1 | 19 | 3.06% | 0.13% | 5.32% | 1,0 (18/19) | 0% | 0 | 31.75% | faithful |
| JOHNNY:4 | 100% | 1 | 20 | 6.17% | 0.15% | 5.71% | 1,0 (19/20) | 0% | 0 | 32.8% | faithful |
| JOHNNY:5 | 79.4% (low) | 1 | 12 | 3.14% | 0.18% | 5.32% | 1,0 (11/12) | 0% | 0 | 31.75% | faithful |
| JOHNNY:6 | 100% | 1 | 18 | 1.17% | 0.47% | 1.41% | 1,0 (18/18) | 20.2% | 32 | 66.2% | faithful |
| MARY:1 | 100% | 1 | 28 | 7.28% | 3.6% | 11.47% | 1,0 (24/24) | 0% | 0 | 52.71% | close |
| MARY:2 | 100% | 1 | 17 | 5.72% | 0.17% | 3.8% | 1,0 (17/17) | 0% | 0 | 43.62% | faithful |
| MARY:3 | 74% (low) | 1 | 49 | 5.7% | 0.25% | 8.11% | 1,0 (47/49) | 0% | 0 | 56.57% | faithful, outlier keyframe |
| MARY:4 | 100% | 1 | 21 | 7.23% | 0.41% | 10.87% | 1,0 (18/21) | 0% | 0 | 34.87% | faithful, outlier keyframe |
| MARY:5 | 100% | 1 | 10 | 8.68% | 0.01% | 2.84% | 1,0 (7/7) | 0% | 0 | 18.15% | faithful |
| MISCGAG:1 | 79.6% (low) | 11 | 29 | 5.88% | 0.03% | 0.73% | 1,0 (29/29) | 0% | 0 | 18.51% | faithful |
| MISCGAG:2 | 100% | 1 | 12 | 4.41% | 0.16% | 6% | 1,0 (10/12) | 0% | 0 | 37.27% | faithful |
| STAND:1 | 100% | 5 | 9 | 21.9% | 0.03% | 1.99% | 1,0 (9/9) | 0% | 0 | 2.42% | faithful |
| STAND:2 | 97.2% | 16 | 24 | 38.85% | 0.56% | 5.41% | 1,0 (24/24) | 0% | 0 | 1.05% | faithful |
| STAND:3 | 97.3% | 16 | 22 | 33.3% | 0.35% | 3.02% | 1,0 (22/22) | 0% | 0 | 0.95% | faithful |
| STAND:4 | 79% (low) | 15 | 41 | 13.04% | 0.78% | 7.88% | 1,0 (41/41) | 0% | 0 | 5.04% | faithful |
| STAND:5 | 100% | 14 | 20 | 23.51% | 0.82% | 6.94% | 1,0 (20/20) | 0% | 0 | 1.65% | faithful |
| STAND:6 | 100% | 14 | 22 | 12.35% | 0.73% | 1.87% | 1,0 (22/22) | 0% | 0 | 4.75% | faithful |
| STAND:7 | 96.1% | 10 | 21 | 31.85% | 2.75% | 4.18% | 1,0 (21/21) | 0% | 0 | 0.7% | close |
| STAND:8 | 96% | 10 | 22 | 27.52% | 1.7% | 5.19% | 1,0 (22/22) | 0% | 0 | 1.23% | faithful |
| STAND:9 | 100% | 1 | 19 | 16.85% | 1.05% | 2.27% | 1,0 (19/19) | 0% | 0 | 2.24% | faithful |
| STAND:10 | 100% | 1 | 15 | 11.18% | 0.06% | 3.58% | 1,0 (15/15) | 0% | 0 | 4.28% | faithful |
| STAND:11 | 100% | 1 | 13 | 11.12% | 0.05% | 1% | 1,0 (13/13) | 0% | 0 | 4.44% | faithful |
| STAND:12 | 100% | 7 | 13 | 16.61% | 0.46% | 1.97% | 1,0 (13/13) | 0% | 0 | 3.19% | faithful |
| STAND:15 | 78.5% (low) | 2 | 12 | 11.44% | 0.24% | 7.27% | 1,0 (12/12) | 0% | 0 | 6.23% | faithful |
| STAND:16 | 90.7% | 16 | 12 | 22.87% | 0.5% | 34.58% | 1,0 (12/12) | 0% | 0 | 2.43% | faithful, outlier keyframe |
| SUZY:1 | 100% | 1 | 30 | 3.12% | 1.03% | 2.65% | 1,0 (30/30) | 4.33% | 186 | 66.2% | faithful |
| SUZY:2 | 100% | 1 | 15 | 5.14% | 0.88% | 3.25% | 1,0 (14/14) | 3.84% | 186 | 66.2% | faithful |
| VISITOR:1 | 100% | 1 | 13 | 14.86% | 0.31% | 31.7% | 1,0 (12/12) | 0% | 0 | 8.2% | faithful, outlier keyframe |
| VISITOR:4 | 100% | 3 | 11 | 16.81% | 0.08% | 3.25% | 1,0 (11/11) | 0% | 0 | 9.35% | faithful |
| VISITOR:5 | 99.4% | 1 | 17 | 4.68% | 0.01% | 10.42% | 1,0 (15/15) | 0% | 0 | 23.28% | faithful, outlier keyframe |
| VISITOR:6 | 100% | 1 | 22 | 9.36% | 0% | 3.25% | 1,0 (22/22) | 0% | 0 | 14.09% | faithful |
| VISITOR:7 | 100% | 1 | 18 | 11.05% | 0.04% | 3.25% | 1,0 (18/18) | 0% | 0 | 9.47% | faithful |
| WALKSTUF:1 | 86.1% | 1 | 30 | 6.7% | 0% | 30.5% | 1,0 (24/24) | 0% | 0 | 56.21% | faithful, outlier keyframe |
| WALKSTUF:2 | 100% | 1 | 13 | 6.01% | 0.19% | 15.13% | 1,0 (13/13) | 0% | 0 | 15.28% | faithful, outlier keyframe |
| WALKSTUF:3 | 100% | 1 | 36 | 5.31% | 0.15% | 18.21% | 1,0 (31/31) | 0% | 0 | 22.5% | faithful, outlier keyframe |

<!-- pixel-oracle:end -->
