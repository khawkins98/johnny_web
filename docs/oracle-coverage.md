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

Generated 2026-10-22; comparator sweep 240s.

Verdicts (aligned median <= 2% = faithful, "outlier keyframe" when one keyframe exceeds 8%; median <= 5% = close; else divergent): faithful, outlier keyframe 15 · faithful 48 · close 1. Foreground offset (ours -> original, dx,dy): 0,0 in 64 gags.

| Gag | Live-set coverage | Seed | Keyframes | Raw median | Aligned median | Aligned max | Offset | Palette subst. | Stale px | Black plate (top) | Verdict |
|-----|------|------|------|------|------|------|------|------|------|------|------|
| ACTIVITY:1 | 100% | 2 | 9 | 0.09% | 0.09% | 12.31% | 0,0 (8/8) | 1.93% | 0 | 53.58% | faithful, outlier keyframe |
| ACTIVITY:4 | 100% | 1 | 10 | 0.08% | 0.08% | 0.23% | 0,0 (9/9) | 0.68% | 0 | 45.97% | faithful |
| ACTIVITY:5 | 100% | 1 | 36 | 0.02% | 0.02% | 1.42% | 0,0 (32/32) | 0.99% | 0 | 36.88% | faithful |
| ACTIVITY:6 | 100% | 1 | 35 | 0.01% | 0.01% | 0.65% | 0,0 (35/35) | 2.08% | 0 | 17.02% | faithful |
| ACTIVITY:7 | 100% | 1 | 25 | 0.02% | 0.02% | 0.65% | 0,0 (25/25) | 2.16% | 0 | 10.58% | faithful |
| ACTIVITY:8 | 61.2% (low) | 1 | 26 | 0.73% | 0.73% | 7.5% | 0,0 (24/25) | 3.49% | 0 | 27.63% | faithful |
| ACTIVITY:9 | 100% | 1 | 29 | 0.01% | 0.01% | 0.75% | 0,0 (26/26) | 1.08% | 0 | 42.38% | faithful |
| ACTIVITY:10 | 64.4% (low) | 1 | 27 | 0.04% | 0.04% | 5.15% | 0,0 (27/27) | 1.16% | 0 | 35.6% | faithful |
| ACTIVITY:11 | 90.1% | 2 | 46 | 0.32% | 0.32% | 7.19% | 0,0 (46/46) | 0.65% | 0 | 40.24% | faithful |
| ACTIVITY:12 | 80.7% | 1 | 24 | 0.02% | 0.02% | 0.78% | 0,0 (24/24) | 0.86% | 0 | 38.32% | faithful |
| BUILDING:1 | 78.7% (low) | 1 | 19 | 0.03% | 0.03% | 14.85% | 0,0 (17/17) | 5.29% | 0 | 17.16% | faithful, outlier keyframe |
| BUILDING:2 | 65.9% (low) | 1 | 50 | 0.04% | 0.04% | 29.84% | 0,0 (45/45) | 6.9% | 192 | 59.56% | faithful, outlier keyframe |
| BUILDING:3 | 62% (low) | 1 | 31 | 0.03% | 0.03% | 5.01% | 0,0 (31/31) | 0.67% | 0 | 17.48% | faithful |
| BUILDING:4 | 100% | 1 | 48 | 0.19% | 0.19% | 16.65% | 0,0 (47/47) | 3.76% | 192 | 69.35% | faithful, outlier keyframe |
| BUILDING:5 | 71.3% (low) | 1 | 49 | 0% | 0% | 1.28% | 0,0 (47/47) | 1.51% | 0 | 21.48% | faithful |
| BUILDING:6 | 100% | 1 | 48 | 0.16% | 0.16% | 6.05% | 0,0 (48/48) | 4.1% | 192 | 68.56% | faithful |
| BUILDING:7 | 68.7% (low) | 1 | 49 | 0% | 0% | 6.07% | 0,0 (48/48) | 1.44% | 0 | 21.33% | faithful |
| BUILDING:8 | 66.7% (low) | 11 | 49 | 0.07% | 0.07% | 8.06% | 0,0 (42/42) | 1.22% | 0 | 21.28% | faithful, outlier keyframe |
| BUILDING:9 | 70.4% (low) | 8 | 49 | 0% | 0% | 1.29% | 0,0 (48/48) | 1.49% | 0 | 21.38% | faithful |
| FISHING:1 | 100% | 3 | 33 | 0.52% | 0.52% | 11.17% | 0,0 (33/33) | 0.98% | 0 | 38.55% | faithful, outlier keyframe |
| FISHING:2 | 96.2% | 11 | 35 | 0.52% | 0.52% | 11.17% | 0,0 (34/34) | 1.03% | 0 | 36.39% | faithful, outlier keyframe |
| FISHING:3 | 100% | 1 | 31 | 0.46% | 0.46% | 11.17% | 0,0 (29/29) | 1.11% | 0 | 49.38% | faithful, outlier keyframe |
| FISHING:4 | 100% | 1 | 11 | 0.18% | 0.18% | 17.37% | 0,0 (7/7) | 1.78% | 0 | 24.62% | faithful, outlier keyframe |
| FISHING:5 | 100% | 1 | 8 | 0.14% | 0.14% | 13.44% | 0,0 (5/5) | 0.9% | 0 | 16.52% | faithful, outlier keyframe |
| FISHING:6 | 100% | 1 | 15 | 0.26% | 0.26% | 4.02% | 0,0 (14/14) | 1.14% | 0 | 36.48% | faithful |
| FISHING:7 | 98.6% | 4 | 46 | 0.17% | 0.17% | 0.3% | 0,0 (46/46) | 1.81% | 0 | 16.66% | faithful |
| FISHING:8 | 85.5% | 11 | 49 | 0.17% | 0.17% | 0.3% | 0,0 (49/49) | 1.87% | 0 | 16.66% | faithful |
| JOHNNY:1 | 100% | 1 | 16 | 0% | 0% | 0.23% | 0,0 (11/11) | 23.09% | 34 | 66.22% | faithful |
| JOHNNY:2 | 69% (low) | 1 | 24 | 0.13% | 0.13% | 12.42% | 0,0 (22/22) | 0.63% | 0 | 33.49% | faithful, outlier keyframe |
| JOHNNY:3 | 85.5% | 1 | 19 | 0.06% | 0.06% | 0.71% | 0,0 (19/19) | 0.6% | 0 | 32.32% | faithful |
| JOHNNY:4 | 100% | 1 | 20 | 0.15% | 0.15% | 3.41% | 0,0 (20/20) | 0.71% | 0 | 32.84% | faithful |
| JOHNNY:5 | 79.4% (low) | 1 | 12 | 0.17% | 0.17% | 0.46% | 0,0 (12/12) | 0.75% | 0 | 32.32% | faithful |
| JOHNNY:6 | 100% | 1 | 18 | 0.46% | 0.46% | 1.41% | 0,0 (18/18) | 20.27% | 34 | 66.22% | faithful |
| MARY:1 | 100% | 1 | 28 | 0.05% | 0.05% | 5.24% | 0,0 (28/28) | 2.41% | 0 | 52.43% | faithful |
| MARY:2 | 100% | 1 | 17 | 0.17% | 0.17% | 1.35% | 0,0 (17/17) | 1.54% | 0 | 43.71% | faithful |
| MARY:3 | 74% (low) | 1 | 49 | 0.18% | 0.18% | 8.11% | 0,0 (49/49) | 0.83% | 0 | 56.62% | faithful, outlier keyframe |
| MARY:4 | 100% | 1 | 21 | 0.1% | 0.1% | 6.6% | 0,0 (18/21) | 0.71% | 0 | 34.9% | faithful |
| MARY:5 | 100% | 1 | 10 | 0% | 0% | 2.84% | 0,0 (8/8) | 2.66% | 0 | 18.15% | faithful |
| MISCGAG:1 | 79.6% (low) | 11 | 29 | 0.02% | 0.02% | 0.73% | 0,0 (29/29) | 1% | 0 | 18.51% | faithful |
| MISCGAG:2 | 100% | 1 | 12 | 0.09% | 0.09% | 0.19% | 0,0 (12/12) | 1.2% | 0 | 37.31% | faithful |
| STAND:1 | 100% | 5 | 9 | 0.03% | 0.03% | 0.24% | 0,0 (9/9) | 3.69% | 0 | 2.48% | faithful |
| STAND:2 | 97.2% | 16 | 24 | 0.56% | 0.56% | 0.59% | 0,0 (24/24) | 6.07% | 0 | 1.05% | faithful |
| STAND:3 | 97.3% | 16 | 22 | 0.35% | 0.35% | 0.86% | 0,0 (22/22) | 8.64% | 0 | 0.96% | faithful |
| STAND:4 | 79% (low) | 15 | 41 | 0.78% | 0.78% | 0.92% | 0,0 (41/41) | 0% | 0 | 5.04% | faithful |
| STAND:5 | 100% | 14 | 20 | 0.82% | 0.82% | 0.98% | 0,0 (20/20) | 1.43% | 0 | 1.65% | faithful |
| STAND:6 | 100% | 14 | 22 | 0.73% | 0.73% | 1.87% | 0,0 (22/22) | 0% | 0 | 4.75% | faithful |
| STAND:7 | 96.1% | 10 | 21 | 2.8% | 2.8% | 4.24% | 0,0 (21/21) | 0% | 0 | 0.7% | close |
| STAND:8 | 96% | 10 | 22 | 1.7% | 1.7% | 1.7% | 0,0 (22/22) | 0% | 0 | 1.23% | faithful |
| STAND:9 | 100% | 1 | 19 | 1.05% | 1.05% | 1.15% | 0,0 (19/19) | 0% | 0 | 2.26% | faithful |
| STAND:10 | 100% | 1 | 15 | 0.06% | 0.06% | 1.26% | 0,0 (15/15) | 1.62% | 0 | 4.34% | faithful |
| STAND:11 | 100% | 1 | 13 | 0.05% | 0.05% | 1% | 0,0 (13/13) | 0% | 0 | 4.44% | faithful |
| STAND:12 | 100% | 7 | 13 | 0.41% | 0.41% | 0.7% | 0,0 (13/13) | 1.22% | 0 | 3.21% | faithful |
| STAND:15 | 78.5% (low) | 2 | 12 | 0.21% | 0.21% | 0.54% | 0,0 (12/12) | 2.46% | 0 | 6.23% | faithful |
| STAND:16 | 90.7% | 16 | 12 | 0.41% | 0.41% | 0.5% | 0,0 (12/12) | 4.47% | 0 | 2.43% | faithful |
| SUZY:1 | 100% | 1 | 30 | 1% | 1% | 1.18% | 0,0 (30/30) | 4.77% | 198 | 66.22% | faithful |
| SUZY:2 | 100% | 1 | 15 | 0.88% | 0.88% | 3.25% | 0,0 (14/14) | 5.7% | 198 | 66.22% | faithful |
| VISITOR:1 | 100% | 1 | 13 | 0.31% | 0.31% | 31.7% | 0,0 (12/12) | 2.04% | 0 | 8.16% | faithful, outlier keyframe |
| VISITOR:4 | 100% | 3 | 11 | 0.07% | 0.07% | 0.35% | 0,0 (11/11) | 2.6% | 0 | 9.39% | faithful |
| VISITOR:5 | 99.4% | 1 | 17 | 0.01% | 0.01% | 11.95% | 0,0 (15/15) | 0.91% | 0 | 23.33% | faithful, outlier keyframe |
| VISITOR:6 | 100% | 1 | 22 | 0% | 0% | 0.35% | 0,0 (22/22) | 2.32% | 0 | 14.12% | faithful |
| VISITOR:7 | 100% | 1 | 18 | 0.01% | 0.01% | 0.99% | 0,0 (18/18) | 2.58% | 0 | 9.5% | faithful |
| WALKSTUF:1 | 86.1% | 1 | 30 | 0% | 0% | 30.5% | 0,0 (24/24) | 0.6% | 0 | 56.21% | faithful, outlier keyframe |
| WALKSTUF:2 | 100% | 1 | 13 | 0.11% | 0.11% | 0.22% | 0,0 (13/13) | 0.58% | 0 | 15.31% | faithful |
| WALKSTUF:3 | 100% | 1 | 36 | 0.14% | 0.14% | 0.34% | 0,0 (33/33) | 2.16% | 0 | 22.48% | faithful |

<!-- pixel-oracle:end -->
