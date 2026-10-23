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

Generated from the current checkout on 2026-10-22.

## Summary

Catalogue: 66 gags · concurrency-covered: 64/64 · duration-covered (completed gags): 64/64 · duration actor coverage: 651/680 · legacy duration refs: 0 · hard concurrency divergences: 0 · lifespan reviews beyond 3x: 0 (0 short, 0 long) · vocab extras: 0 · unisolable: 2 (explained).

## Gags

| Gag | Ref data | maxConc (ours/ref) | Vocab overlap | Vocab extras | Duration sampling | Duration keys | Duration in-band | Status |
|-----|----------|---------------------|---------------|--------------|-------------------|---------------|-------------------|--------|
| ACTIVITY:1 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 9 seeds | 5/6 | 1/5 in-band (5/5 within 3x) | Aligned |
| ACTIVITY:4 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 3/3 | 0/3 in-band (3/3 within 3x) | Aligned |
| ACTIVITY:5 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 15/15 | 13/15 in-band (15/15 within 3x) | Aligned |
| ACTIVITY:6 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 10/10 | 7/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:7 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 9/9 | 6/9 in-band (9/9 within 3x) | Aligned |
| ACTIVITY:8 | +completed-gag | 2/2 = | 100% | — | 5 episodes / 9 seeds | 13/13 | 8/13 in-band (13/13 within 3x) | Aligned |
| ACTIVITY:9 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 10/10 | 2/10 in-band (10/10 within 3x) | Aligned |
| ACTIVITY:10 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 14/14 | 9/14 in-band (14/14 within 3x) | Aligned |
| ACTIVITY:11 | +completed-gag | 5/5 = | 100% | — | 2 episodes / 9 seeds | 28/28 | 16/28 in-band (28/28 within 3x) | Aligned |
| ACTIVITY:12 | +completed-gag | 2/2 = | 100% | — | 3 episodes / 9 seeds | 10/10 | 6/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:1 | +completed-gag | 2/2 = | 100% | — | 5 episodes / 9 seeds | 10/10 | 4/10 in-band (10/10 within 3x) | Aligned |
| BUILDING:2 | +completed-gag | 7/7 = | 100% | — | 2 episodes / 9 seeds | 33/33 | 20/33 in-band (33/33 within 3x) | Aligned |
| BUILDING:3 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 14/14 | 4/14 in-band (14/14 within 3x) | Aligned |
| BUILDING:4 | +completed-gag | 3/3 = | 100% | — | 1 episode / 9 seeds | 17/17 | 4/17 in-band (17/17 within 3x) | Aligned |
| BUILDING:5 | +completed-gag | 3/3 = | 100% | — | 1 episode / 9 seeds | 22/22 | 4/22 in-band (22/22 within 3x) | Aligned |
| BUILDING:6 | +completed-gag | 3/3 = | 100% | — | 1 episode / 9 seeds | 16/16 | 3/16 in-band (16/16 within 3x) | Aligned |
| BUILDING:7 | +completed-gag | 3/3 = | 100% | — | 1 episode / 25 seeds | 27/33 | 5/27 in-band (27/27 within 3x) | Aligned |
| BUILDING:8 | +completed-gag | 3/3 = | 100% | — | 1 episode / 26 seeds | 27/33 | 5/27 in-band (27/27 within 3x) | Aligned |
| BUILDING:9 | +completed-gag | 3/3 = | 100% | — | 1 episode / 9 seeds | 22/22 | 4/22 in-band (22/22 within 3x) | Aligned |
| FISHING:1 | +completed-gag | 1/1 = | 100% | — | 1 episode / 17 seeds | 9/17 | 3/9 in-band (9/9 within 3x) | Aligned |
| FISHING:2 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 33 seeds | 12/16 | 8/12 in-band (12/12 within 3x) | Aligned |
| FISHING:3 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 11/11 | 8/11 in-band (11/11 within 3x) | Aligned |
| FISHING:4 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 3/3 | 1/3 in-band (3/3 within 3x) | Aligned |
| FISHING:5 | +completed-gag | 1/1 = | 100% | — | 5 episodes / 9 seeds | 2/2 | 1/2 in-band (2/2 within 3x) | Aligned |
| FISHING:6 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 3/5 in-band (5/5 within 3x) | Aligned |
| FISHING:7 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 17 seeds | 15/17 | 13/15 in-band (15/15 within 3x) | Aligned |
| FISHING:8 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 17 seeds | 13/13 | 8/13 in-band (13/13 within 3x) | Aligned |
| JOHNNY:1 | +completed-gag | 3/3 = | 100% | — | 3 episodes / 9 seeds | 7/7 | 1/7 in-band (7/7 within 3x) | Aligned |
| JOHNNY:2 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 14/14 | 7/14 in-band (14/14 within 3x) | Aligned |
| JOHNNY:3 | +completed-gag | 3/3 = | 100% | — | 4 episodes / 9 seeds | 11/11 | 4/11 in-band (11/11 within 3x) | Aligned |
| JOHNNY:4 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 8 seeds | 7/7 | 6/7 in-band (7/7 within 3x) | Aligned |
| JOHNNY:5 | +completed-gag | 2/2 = | 100% | — | 5 episodes / 8 seeds | 8/8 | 4/8 in-band (8/8 within 3x) | Aligned |
| JOHNNY:6 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 5/5 | 1/5 in-band (5/5 within 3x) | Aligned |
| MARY:1 | +completed-gag | 1/1 = | 100% | — | 1 episode / 9 seeds | 8/10 | 6/8 in-band (8/8 within 3x) | Aligned |
| MARY:2 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 6/6 | 5/6 in-band (6/6 within 3x) | Aligned |
| MARY:3 | +completed-gag | 5/5 = | 100% | — | 1 episode / 9 seeds | 33/33 | 15/33 in-band (33/33 within 3x) | Aligned |
| MARY:4 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 8/8 | 4/8 in-band (8/8 within 3x) | Aligned |
| MARY:5 | +completed-gag | 2/2 = | 100% | — | 3 episodes / 9 seeds | 3/3 | 0/3 in-band (3/3 within 3x) | Aligned |
| MISCGAG:1 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 7/7 | 5/7 in-band (7/7 within 3x) | Aligned |
| MISCGAG:2 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 3/3 | 1/3 in-band (3/3 within 3x) | Aligned |
| STAND:1 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 9 seeds | 4/4 | 3/4 in-band (4/4 within 3x) | Aligned |
| STAND:2 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 5/5 in-band (5/5 within 3x) | Aligned |
| STAND:3 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 5/5 in-band (5/5 within 3x) | Aligned |
| STAND:4 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 4/4 | 4/4 in-band (4/4 within 3x) | Aligned |
| STAND:5 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 4/4 | 4/4 in-band (4/4 within 3x) | Aligned |
| STAND:6 | +completed-gag | 1/1 = | 100% | — | 3 episodes / 9 seeds | 4/4 | 4/4 in-band (4/4 within 3x) | Aligned |
| STAND:7 | +completed-gag | 1/1 = | 100% | — | 2 episodes / 9 seeds | 5/5 | 5/5 in-band (5/5 within 3x) | Aligned |
| STAND:8 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 5/5 in-band (5/5 within 3x) | Aligned |
| STAND:9 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 5/5 in-band (5/5 within 3x) | Aligned |
| STAND:10 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 5/5 in-band (5/5 within 3x) | Aligned |
| STAND:11 | +completed-gag | 1/1 = | 100% | — | 4 episodes / 9 seeds | 5/5 | 5/5 in-band (5/5 within 3x) | Aligned |
| STAND:12 | +completed-gag | 1/1 = | 100% | — | 6 episodes / 9 seeds | 3/3 | 3/3 in-band (3/3 within 3x) | Aligned |
| STAND:14 | — | — | — | — | — | — | — | Unisolable (init macro, transitively covered) |
| STAND:15 | +completed-gag | 1/1 = | 100% | — | 12 episodes / 9 seeds | 7/7 | 5/7 in-band (7/7 within 3x) | Aligned |
| STAND:16 | +completed-gag | 1/1 = | 100% | — | 6 episodes / 9 seeds | 7/7 | 7/7 in-band (7/7 within 3x) | Aligned |
| SUZY:1 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 11/11 | 2/11 in-band (11/11 within 3x) | Aligned |
| SUZY:2 | +completed-gag | 2/2 = | 100% | — | 3 episodes / 9 seeds | 5/5 | 0/5 in-band (5/5 within 3x) | Aligned |
| VISITOR:1 | +completed-gag | 1/1 = | 100% | — | 6 episodes / 9 seeds | 10/10 | 6/10 in-band (10/10 within 3x) | Aligned |
| VISITOR:3 | — | — | — | — | — | — | — | Unisolable (sibling-covered) |
| VISITOR:4 | +completed-gag | 3/3 = | 100% | — | 7 episodes / 9 seeds | 7/7 | 4/7 in-band (7/7 within 3x) | Aligned |
| VISITOR:5 | +completed-gag | 2/2 = | 100% | — | 4 episodes / 9 seeds | 7/7 | 1/7 in-band (7/7 within 3x) | Aligned |
| VISITOR:6 | +completed-gag | 3/3 = | 100% | — | 2 episodes / 9 seeds | 9/9 | 5/9 in-band (9/9 within 3x) | Aligned |
| VISITOR:7 | +completed-gag | 3/3 = | 100% | — | 3 episodes / 9 seeds | 8/8 | 6/8 in-band (8/8 within 3x) | Aligned |
| WALKSTUF:1 | +completed-gag | 2/2 = | 100% | — | 2 episodes / 9 seeds | 12/12 | 7/12 in-band (12/12 within 3x) | Aligned |
| WALKSTUF:2 | +completed-gag | 1/1 = | 100% | — | 5 episodes / 9 seeds | 6/6 | 4/6 in-band (6/6 within 3x) | Aligned |
| WALKSTUF:3 | +completed-gag | 1/1 = | 100% | — | 1 episode / 9 seeds | 13/13 | 6/13 in-band (13/13 within 3x) | Aligned |

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
tick window (wider for mid-span samples; the gag's first frame reaches forward
by our first-frame hold, an accepted deviation: see the README). `raw` is as
rendered; `aligned`
moves our foreground by the gag's dominant offset first (see the offset
column). Palette substitutions (Windows static colours) are not counted as
differences.

Regenerate with (local only; needs the patched DOSBox-X and game data):

```
node tools/faithfulness-oracle/pixel-oracle/capture-gags.mjs
node tools/faithfulness-oracle/pixel-oracle/sweep.mjs
```

Generated 2026-10-22; comparator sweep 437s.

Verdicts (aligned median <= 2% = faithful, "outlier keyframe" when one keyframe exceeds 8%; median <= 5% = close; else divergent): faithful 62 · faithful, outlier keyframe 1 · close 1. Foreground offset (ours -> original, dx,dy): 0,0 in 64 gags.

| Gag | Live-set coverage | Seed | Keyframes | Raw median | Aligned median | Aligned max | Offset | Palette subst. | Stale px | Black plate (top) | Verdict |
|-----|------|------|------|------|------|------|------|------|------|------|------|
| ACTIVITY:1 | 100% | 2 | 9 | 0.05% | 0.05% | 0.39% | 0,0 (8/8) | 1.61% | 0 | 53.58% | faithful |
| ACTIVITY:4 | 100% | 1 | 10 | 0.08% | 0.08% | 0.23% | 0,0 (9/9) | 0.25% | 0 | 45.97% | faithful |
| ACTIVITY:5 | 100% | 1 | 36 | 0.02% | 0.02% | 1.42% | 0,0 (32/32) | 0.99% | 0 | 36.88% | faithful |
| ACTIVITY:6 | 100% | 1 | 35 | 0.01% | 0.01% | 0.48% | 0,0 (35/35) | 1.68% | 0 | 17.02% | faithful |
| ACTIVITY:7 | 100% | 1 | 25 | 0.02% | 0.02% | 0.48% | 0,0 (25/25) | 2.16% | 0 | 10.58% | faithful |
| ACTIVITY:8 | 61.2% (low) | 1 | 26 | 0.7% | 0.7% | 1.47% | 0,0 (25/25) | 3.49% | 0 | 27.63% | faithful |
| ACTIVITY:9 | 100% | 1 | 29 | 0.01% | 0.01% | 0.75% | 0,0 (26/26) | 1.08% | 0 | 42.38% | faithful |
| ACTIVITY:10 | 64.4% (low) | 1 | 27 | 0.04% | 0.04% | 4.35% | 0,0 (27/27) | 1.17% | 0 | 35.6% | faithful |
| ACTIVITY:11 | 90.1% | 2 | 46 | 0.32% | 0.32% | 7.19% | 0,0 (46/46) | 0.64% | 0 | 40.24% | faithful |
| ACTIVITY:12 | 80.7% | 1 | 24 | 0.02% | 0.02% | 0.48% | 0,0 (24/24) | 0.71% | 0 | 38.32% | faithful |
| BUILDING:1 | 78.7% (low) | 1 | 19 | 0.03% | 0.03% | 0.27% | 0,0 (19/19) | 5.29% | 0 | 17.16% | faithful |
| BUILDING:2 | 80% | 1 | 52 | 1.24% | 1.24% | 3.1% | 0,0 (52/52) | 6.16% | 192 | 60.2% | faithful |
| BUILDING:3 | 62% (low) | 1 | 31 | 0.01% | 0.01% | 5.01% | 0,0 (31/31) | 0.7% | 0 | 17.48% | faithful |
| BUILDING:4 | 100% | 1 | 48 | 0.18% | 0.18% | 6.47% | 0,0 (48/48) | 3.87% | 192 | 69.35% | faithful |
| BUILDING:5 | 72.3% (low) | 1 | 49 | 0% | 0% | 1.28% | 0,0 (47/47) | 1.52% | 0 | 21.48% | faithful |
| BUILDING:6 | 100% | 1 | 48 | 0.15% | 0.15% | 6.05% | 0,0 (48/48) | 4.29% | 192 | 68.56% | faithful |
| BUILDING:7 | 69.1% (low) | 1 | 49 | 0% | 0% | 5.74% | 0,0 (48/48) | 1.29% | 0 | 21.33% | faithful |
| BUILDING:8 | 69.5% (low) | 11 | 49 | 0.06% | 0.06% | 8.39% | 0,0 (45/45) | 1.25% | 0 | 21.24% | faithful, outlier keyframe |
| BUILDING:9 | 72% (low) | 8 | 49 | 0% | 0% | 1.29% | 0,0 (48/48) | 1.5% | 0 | 21.38% | faithful |
| FISHING:1 | 100% | 3 | 33 | 0.51% | 0.51% | 0.7% | 0,0 (33/33) | 1.02% | 0 | 38.55% | faithful |
| FISHING:2 | 96.2% | 11 | 35 | 0.52% | 0.52% | 4.34% | 0,0 (34/34) | 1.03% | 0 | 36.39% | faithful |
| FISHING:3 | 100% | 1 | 31 | 0.46% | 0.46% | 0.7% | 0,0 (31/31) | 1.12% | 0 | 49.38% | faithful |
| FISHING:4 | 100% | 1 | 11 | 0.16% | 0.16% | 0.45% | 0,0 (10/10) | 1.78% | 0 | 25% | faithful |
| FISHING:5 | 100% | 1 | 8 | 0.11% | 0.11% | 0.24% | 0,0 (7/7) | 0.9% | 0 | 16.52% | faithful |
| FISHING:6 | 100% | 1 | 15 | 0.26% | 0.26% | 3.59% | 0,0 (14/14) | 1.14% | 0 | 36.48% | faithful |
| FISHING:7 | 98.6% | 4 | 46 | 0.17% | 0.17% | 0.3% | 0,0 (46/46) | 1.79% | 0 | 16.66% | faithful |
| FISHING:8 | 85.5% | 11 | 49 | 0.17% | 0.17% | 0.3% | 0,0 (49/49) | 1.87% | 0 | 16.66% | faithful |
| JOHNNY:1 | 100% | 1 | 16 | 0% | 0% | 0.23% | 0,0 (11/11) | 23.09% | 34 | 66.22% | faithful |
| JOHNNY:2 | 69% (low) | 2 | 24 | 0.11% | 0.11% | 0.72% | 0,0 (24/24) | 0.67% | 0 | 33.49% | faithful |
| JOHNNY:3 | 85.5% | 1 | 19 | 0.03% | 0.03% | 0.71% | 0,0 (19/19) | 0.5% | 0 | 32.32% | faithful |
| JOHNNY:4 | 100% | 1 | 20 | 0.08% | 0.08% | 0.64% | 0,0 (20/20) | 0.7% | 0 | 32.84% | faithful |
| JOHNNY:5 | 79.4% (low) | 1 | 12 | 0.1% | 0.1% | 2.31% | 0,0 (12/12) | 0.55% | 0 | 32.32% | faithful |
| JOHNNY:6 | 100% | 1 | 18 | 0.46% | 0.46% | 0.61% | 0,0 (18/18) | 20.27% | 34 | 66.22% | faithful |
| MARY:1 | 100% | 9 | 28 | 0.04% | 0.04% | 0.34% | 0,0 (28/28) | 2.41% | 0 | 52.43% | faithful |
| MARY:2 | 100% | 1 | 17 | 0.17% | 0.17% | 1.53% | 0,0 (17/17) | 1.62% | 0 | 43.71% | faithful |
| MARY:3 | 74% (low) | 1 | 49 | 0.18% | 0.18% | 2.61% | 0,0 (49/49) | 0.77% | 0 | 56.62% | faithful |
| MARY:4 | 100% | 1 | 21 | 0.06% | 0.06% | 1.09% | 0,0 (21/21) | 0.89% | 0 | 34.98% | faithful |
| MARY:5 | 100% | 1 | 10 | 0% | 0% | 0.04% | 0,0 (8/8) | 2.66% | 0 | 18.15% | faithful |
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
| STAND:16 | 90.7% | 16 | 12 | 0.37% | 0.37% | 0.5% | 0,0 (12/12) | 3.87% | 0 | 2.43% | faithful |
| SUZY:1 | 100% | 1 | 30 | 1% | 1% | 1.18% | 0,0 (30/30) | 4.77% | 198 | 66.22% | faithful |
| SUZY:2 | 100% | 1 | 15 | 0.88% | 0.88% | 1.04% | 0,0 (15/15) | 5.7% | 198 | 66.22% | faithful |
| VISITOR:1 | 100% | 1 | 13 | 0.28% | 0.28% | 0.54% | 0,0 (13/13) | 2.3% | 0 | 8.16% | faithful |
| VISITOR:4 | 100% | 3 | 11 | 0.07% | 0.07% | 0.35% | 0,0 (11/11) | 2.6% | 0 | 9.39% | faithful |
| VISITOR:5 | 99.4% | 1 | 17 | 0% | 0% | 0.73% | 0,0 (17/17) | 0.91% | 0 | 23.33% | faithful |
| VISITOR:6 | 100% | 1 | 22 | 0% | 0% | 0.35% | 0,0 (22/22) | 2.32% | 0 | 14.12% | faithful |
| VISITOR:7 | 100% | 1 | 18 | 0.01% | 0.01% | 0.49% | 0,0 (18/18) | 2.58% | 0 | 9.5% | faithful |
| WALKSTUF:1 | 86.1% | 1 | 30 | 0% | 0% | 0.3% | 0,0 (25/25) | 1.09% | 0 | 56.21% | faithful |
| WALKSTUF:2 | 100% | 1 | 13 | 0.11% | 0.11% | 0.22% | 0,0 (13/13) | 0.58% | 0 | 15.31% | faithful |
| WALKSTUF:3 | 100% | 1 | 36 | 0.14% | 0.14% | 0.34% | 0,0 (33/33) | 2.41% | 0 | 22.48% | faithful |

<!-- pixel-oracle:end -->

<!-- normal-play:begin -->
## Normal play

Normal-play captures of the original (no forced gag: the planner, the island
bake and the walks run as shipped), from `capture-normal-play.mjs`. They check
what the forced oracle cannot: the host canvas, and which gags the original's
planner picks. Method and limits: [pixel-oracle/README.md](../tools/faithfulness-oracle/pixel-oracle/README.md)
"Normal play". Regenerate with (local only):

```
node tools/faithfulness-oracle/capture-normal-play.mjs scratchpad/normal-play/<run> --secs 1800 [--start-time HHMM] [--story-day N]
node tools/faithfulness-oracle/pixel-oracle/normal-play-report.mjs scratchpad/normal-play
```

### Story mix (generated 2026-10-23)

All runs (18; 10 in turbo mode, story mix only):

150 planned batches (132 played to their ending) over 18 runs; mean queue length 13.75.

| Ending | Batches | Share |
|---|---:|---:|
| MISCGAG#1 | 12 | 8% |
| ACTIVITY#5 | 11 | 7.3% |
| BUILDING#2 | 11 | 7.3% |
| ACTIVITY#9 | 10 | 6.7% |
| FISHING#6 | 10 | 6.7% |
| FISHING#4 | 9 | 6% |
| ACTIVITY#1 | 8 | 5.3% |
| VISITOR#3 | 8 | 5.3% |
| VISITOR#5 | 8 | 5.3% |
| WALKSTUF#1 | 8 | 5.3% |
| FISHING#5 | 7 | 4.7% |
| ACTIVITY#6 | 6 | 4% |
| ACTIVITY#12 | 5 | 3.3% |
| BUILDING#6 | 5 | 3.3% |
| ACTIVITY#11 | 4 | 2.7% |
| BUILDING#4 | 4 | 2.7% |
| FISHING#3 | 4 | 2.7% |
| MARY#2 | 4 | 2.7% |
| MISCGAG#2 | 4 | 2.7% |
| ACTIVITY#10 | 2 | 1.3% |
| JOHNNY#1 | 2 | 1.3% |
| JOHNNY#6 | 2 | 1.3% |
| MARY#5 | 2 | 1.3% |
| SUZY#2 | 2 | 1.3% |
| MARY#3 | 1 | 0.7% |
| MARY#4 | 1 | 0.7% |

| Gag (any position) | Batches | Share |
|---|---:|---:|
| POSE | 96 | 64% |
| VISITOR#6 | 66 | 44% |
| VISITOR#4 | 64 | 42.7% |
| ACTIVITY#7 | 61 | 40.7% |
| FISHING#1 | 60 | 40% |
| JOHNNY#5 | 60 | 40% |
| FISHING#2 | 59 | 39.3% |
| FISHING#7 | 59 | 39.3% |
| BUILDING#3 | 58 | 38.7% |
| VISITOR#1 | 58 | 38.7% |
| BUILDING#1 | 57 | 38% |
| STAND#15 | 56 | 37.3% |
| STAND#16 | 56 | 37.3% |
| ACTIVITY#4 | 53 | 35.3% |
| VISITOR#7 | 53 | 35.3% |
| JOHNNY#4 | 52 | 34.7% |
| WALKSTUF#3 | 48 | 32% |
| BUILDING#5 | 45 | 30% |
| FISHING#8 | 42 | 28% |
| WALKSTUF#2 | 38 | 25.3% |

| Island layout | Batches | Share |
|---|---:|---:|
| fixed1 | 74 | 49.3% |
| random | 25 | 16.7% |
| random/q20 | 14 | 9.3% |
| fixed2 | 9 | 6% |
| random/q4 | 8 | 5.3% |
| random/q14 | 7 | 4.7% |
| off-island | 6 | 4% |
| random/q28 | 5 | 3.3% |
| random/qc | 2 | 1.3% |

Low tide: 9/144 island batches (6.3%); phases 0-11: 0/106; phases 12-15: 9/38.
Night sky: 38/150 batches (40 at phase >= 12, 0 forced by 0x800). Still waves: 28. Off-island: 6.
VISITOR#1: 58/150 batches (38.7%), island layer 0 at fixed1 289/299 (58).
ACTIVITY#11: 6 batches (4 as the ending, 4 of them solo; 2 as an intermediate).
Anti-repeat: 0/132 endings equal to the previous batch's; 8/114 equal to the one two batches back (and not the previous).

| Day-locked gag | Its day | Batch day | Phase | Position | Run |
|---|---:|---:|---:|---|---|
| JOHNNY#6 | 10 | 10 | 1 | ending | d10-st900 |
| JOHNNY#6 | 10 | 10 | 1 | ending | d10-st900 |
| SUZY#2 | 9 | 9 | 12 | ending | d9-st330-night |
| SUZY#2 | 9 | 9 | 12 | ending | d9-st330-night |
| MARY#2 | 1 | 1 | 2 | ending | t-d1-a |
| MARY#2 | 1 | 1 | 12 | ending | t-d1-b |
| MARY#2 | 1 | 1 | 11 | ending | t-d1-c |
| MARY#2 | 1 | 1 | 12 | ending | t-d1-c |
| JOHNNY#1 | 11 | 11 | 3 | ending | t-d11 |
| JOHNNY#1 | 11 | 11 | 4 | ending | t-d11 |
| JOHNNY#2 | 2 | 2 | 4 | #1 | t-d2 |
| MARY#3 | 4 | 4 | 5 | ending | t-d4 |
| JOHNNY#3 | 6 | 6 | 11 | #1 | t-d6 |
| MARY#4 | 7 | 7 | 3 | ending | t-d7 |
| MARY#5 | 8 | 8 | 11 | ending | t-d8 |
| MARY#5 | 8 | 8 | 12 | ending | t-d8 |

Timing-faithful runs only (8): 45 batches, endings WALKSTUF#1 5, ACTIVITY#6 4, MISCGAG#1 4, ACTIVITY#5 3, BUILDING#2 3, BUILDING#6 3, ACTIVITY#1 2, ACTIVITY#10 2.

### Host canvas (generated 2026-10-23)

41 island batches checked (4 skipped: off-island or no dump). Verdicts (island and ocean "never matched" <= 0.5%, waves matched >= 90%): faithful 16 · divergent: ocean 25.

| Run | Batch | Ending | Layout | Layer 0 | Sky | Tide | Frames | Island never | Island persistent | Ocean never | Sky never / some | Waves matched | Verdict |
|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---:|---|
| d1-st230-night | 0 | ACTIVITY#10 | random | 273/327 | night | high | 11 | 0.01% | 20.51% | 0% | 1.88% / 0% | 100% | faithful |
| d1-st230-night | 1 | FISHING#6 | fixed1 | 289/299 | night | low | 11 | 0% | 18.22% | 0% | 16.78% / 0% | 100% | faithful |
| d1-st230-night | 2 | ACTIVITY#6 | fixed1 | 289/299 | night | high | 11 | 0.01% | 13.05% | 0% | 3.81% / 0% | 100% | faithful |
| d1-st230-night | 3 | BUILDING#6 | fixed1 | 289/299 | night | high (still) | 11 | 0.01% | 24.19% | 0% | 8.97% / 0.42% | 100% | faithful |
| d1-st900-a | 0 | ACTIVITY#6 | fixed1 | 289/299 | ocean 1 | high | 11 | 0.01% | 14.16% | 2.97% | 2.5% / 0% | 100% | divergent: ocean |
| d1-st900-a | 1 | MISCGAG#1 | fixed1 | 289/299 | ocean 0 | high | 11 | 0.01% | 17.77% | 3.3% | 5.01% / 4.02% | 100% | divergent: ocean |
| d1-st900-a | 2 | ACTIVITY#9 | fixed1 | 289/299 | ocean 0 | high | 11 | 0.01% | 24.57% | 3.29% | 0% / 0% | 100% | divergent: ocean |
| d1-st900-a | 3 | MISCGAG#1 | random | 242/337 | ocean 1 | high | 11 | 0.01% | 16.07% | 3.4% | 11.16% / 0% | 100% | divergent: ocean |
| d1-st900-a | 4 | ACTIVITY#9 | fixed1 | 289/299 | ocean 1 | high | 10 | 0.01% | 13.71% | 3.09% | 0% / 0% | 100% | divergent: ocean |
| d1-st900-b | 0 | ACTIVITY#5 | fixed1 | 289/299 | ocean 2 | high | 11 | 0.01% | 7.97% | 3.55% | 2.5% / 0% | 100% | divergent: ocean |
| d1-st900-b | 1 | MISCGAG#2 | random | 253/262 | ocean 2 | high | 11 | 0.01% | 25.24% | 3.22% | 0% / 0.07% | 100% | divergent: ocean |
| d1-st900-b | 2 | WALKSTUF#1 | fixed1 | 289/299 | ocean 2 | high | 11 | 0.01% | 27.58% | 3.5% | 0% / 0% | 100% | divergent: ocean |
| d1-st900-b | 3 | ACTIVITY#12 | fixed1 | 289/299 | ocean 2 | high | 11 | 0.01% | 11.91% | 3.56% | 0% / 0% | 100% | divergent: ocean |
| d10-st900 | 0 | ACTIVITY#6 | fixed1 | 289/299 | ocean 1 | high | 11 | 0.01% | 13.9% | 2.94% | 2.5% / 0% | 100% | divergent: ocean |
| d10-st900 | 1 | MISCGAG#1 | random | 275/361 | ocean 1 | high | 11 | 0.01% | 18.21% | 4.04% | 0% / 0% | 100% | divergent: ocean |
| d10-st900 | 3 | ACTIVITY#11 | random/q28 | 269/361 | ocean 0 | high | 11 | 0.01% | 1.67% | 4.61% | 0% / 0.02% | 100% | divergent: ocean |
| d10-st900 | 5 | VISITOR#3 | fixed1 | 289/299 | ocean 1 | high (still) | 11 | 0.01% | 8.02% | 2.89% | 5.01% / 0% | 100% | divergent: ocean |
| d10-st900 | 6 | FISHING#4 | fixed2 | 17/309 | ocean 2 | high | 11 | 0.01% | 8.98% | 4.17% | 17.06% / 0% | 100% | divergent: ocean |
| d10-st900 | 7 | WALKSTUF#1 | fixed1 | 289/299 | ocean 2 | high | 12 | 0.01% | 16.36% | 3.44% | 0% / 0% | 100% | divergent: ocean |
| d2-st500 | 0 | FISHING#6 | fixed1 | 289/299 | ocean 1 | high | 11 | 0.01% | 22.98% | 2.98% | 2.5% / 0% | 100% | divergent: ocean |
| d2-st500 | 1 | ACTIVITY#5 | fixed1 | 289/299 | ocean 1 | high | 11 | 0.01% | 17.06% | 2.94% | 14.41% / 0% | 100% | divergent: ocean |
| d2-st500 | 2 | WALKSTUF#1 | fixed1 | 289/299 | ocean 1 | high | 11 | 0.01% | 14.5% | 3.04% | 0% / 0% | 100% | divergent: ocean |
| d2-st500 | 3 | BUILDING#2 | fixed1 | 289/299 | ocean 1 | high (still) | 11 | 0.01% | 15.43% | 2.85% | 6.21% / 3.7% | 93.94% | divergent: ocean |
| d2-st500 | 4 | WALKSTUF#1 | fixed1 | 289/299 | ocean 1 | high | 11 | 0.01% | 22.83% | 3.04% | 8.71% / 11.58% | 100% | divergent: ocean |
| d5-st300-night | 0 | ACTIVITY#1 | random | 275/320 | night | high | 11 | 0.01% | 16.31% | 0% | 1.89% / 0% | 100% | faithful |
| d5-st300-night | 1 | ACTIVITY#11 | random/q28 | 203/275 | night | high | 11 | 0.01% | 1.82% | 0.18% | 6.38% / 1.12% | 100% | faithful |
| d5-st300-night | 2 | MISCGAG#1 | fixed1 | 289/299 | night | low | 11 | 0% | 16.55% | 0% | 1.91% / 0.26% | 100% | faithful |
| d5-st300-night | 3 | VISITOR#3 | fixed1 | 289/299 | night | high (still) | 11 | 0.01% | 18.69% | 0% | 0% / 0% | 100% | faithful |
| d5-st300-night | 4 | FISHING#3 | fixed1 | 289/299 | night | low | 11 | 0% | 15.65% | 0% | 0% / 2.9% | 100% | faithful |
| d5-st300-night | 5 | VISITOR#5 | random/q4 | 172/282 | night | high | 11 | 0.01% | 19.15% | 0% | 5.73% / 0% | 100% | faithful |
| d6-st700 | 0 | ACTIVITY#6 | fixed1 | 289/299 | ocean 1 | high | 11 | 0.01% | 20.33% | 2.96% | 2.5% / 0% | 100% | divergent: ocean |
| d6-st700 | 1 | BUILDING#2 | random/q20 | 286/349 | ocean 1 | high (still) | 11 | 0.01% | 21.78% | 3.77% | 12.36% / 0.63% | 93.94% | divergent: ocean |
| d6-st700 | 2 | BUILDING#4 | fixed1 | 289/299 | ocean 2 | high (still) | 11 | 0.01% | 20.15% | 3.65% | 11.77% / 0% | 100% | divergent: ocean |
| d6-st700 | 3 | FISHING#3 | fixed1 | 289/299 | ocean 0 | high | 11 | 0.01% | 16.72% | 3.26% | 7.51% / 0% | 100% | divergent: ocean |
| d6-st700 | 4 | ACTIVITY#10 | fixed1 | 289/299 | ocean 1 | high | 11 | 0.01% | 12.48% | 2.85% | 6.21% / 0% | 100% | divergent: ocean |
| d9-st330-night | 0 | ACTIVITY#1 | random | 275/320 | night | high | 11 | 0.01% | 12.69% | 0% | 1.89% / 0% | 100% | faithful |
| d9-st330-night | 1 | BUILDING#6 | random/q20 | 291/339 | night | high (still) | 11 | 0.01% | 23.74% | 0% | 13.68% / 0% | 100% | faithful |
| d9-st330-night | 3 | BUILDING#2 | random/q20 | 235/353 | night | high (still) | 11 | 0.01% | 19.88% | 0% | 1.83% / 3.4% | 90.91% | faithful |
| d9-st330-night | 5 | ACTIVITY#5 | random | 202/347 | night | high | 11 | 0.01% | 22.36% | 0% | 6.25% / 0% | 100% | faithful |
| d9-st330-night | 6 | BUILDING#6 | fixed1 | 289/299 | night | high (still) | 11 | 0.01% | 17.74% | 0% | 0% / 7.1% | 100% | faithful |
| d9-st330-night | 7 | WALKSTUF#1 | fixed1 | 289/299 | night | high | 11 | 0.01% | 11.99% | 0% | 4.74% / 0% | 100% | faithful |

<!-- normal-play:end -->
