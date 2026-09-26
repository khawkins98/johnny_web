# BUILDING:7/8 fire handoff timing

The long `3:83` (JUST AMBERS) lifetime is a phase mismatch between two
independent ADS branches. `IF_PLAYED 3:82` starts the looping `3:83` thread;
`IF_PLAYED 3:139` stops it. `3:139` itself starts when timed thread `3:141`
finishes. Thus `3:83` stays live for the interval between `3:82` and `3:139`
completing, regardless of its own frame timing.

The fresh original BUILDING:7 and :8 episodes have the same transitions, offset
by one original sample. For BUILDING:7, a complete 1,200-sample episode takes
about 68.4 seconds. The seed-1 browser episode takes 3,405 fine ticks, about
68.1 seconds. These are the measured active-thread intervals:

| Thread | Original samples | Browser 20 ms ticks | Role |
| --- | ---: | ---: | --- |
| `3:141` | 1060–1112 (53) | 2954–3132 (179) | timed `-180` gate for `3:139` |
| `3:82` | 1060–1173 (114) | 2954–3237 (284) | starts `3:83` on completion |
| `3:139` | 1114–1183 (70) | 3134–3352 (219) | stops `3:83` on completion |
| `3:83` | 1175–1184 (10) | 3239–3353 (115) | looping embers |

In BUILDING:8, the original intervals are exactly one sample later:
`3:141` 1061–1113, `3:82` 1061–1174, `3:139` 1115–1184, and
`3:83` 1176–1185. The seed-1 browser intervals are the same as BUILDING:7.

Using the measured mean original sample interval of about 57 ms, `3:141`
lasts about 3.0 seconds in the original and 3.6 seconds in the browser.
Disassembly of `FUN_1048_0db6` shows that a negative ADD count sets a deadline
on the original game's `now` clock; that clock advances in 16 ms units. The
browser currently counts the raw magnitude in 20 ms fine ticks. `-180` is
therefore 2.88 seconds in the binary but 3.6 seconds in the browser. This
explains why `3:139` starts late relative to `3:82`.

`3:82` has 39 `UPDATE` frames with an authored delay of 8. It runs about
6.5 seconds in the original and 5.7 seconds in the browser. The original
samples a 128 ms deadline on a roughly 55 ms clock, so each frame usually
occupies three samples (about 165 ms). The browser maps delay 8 to six 20 ms
ticks and advances at its 50 ms present gate; the measured average is about
146 ms per frame. This makes `3:82` finish early. `3:139` has 23 frames,
mostly at delay 10; its measured browser lifetime is about 0.4 seconds longer
than the original. These three offsets accumulate into `3:83`'s 2.3-second
browser overlap versus 0.57 seconds in the original.

## Why no scheduler change is included

Scaling all negative ADD lifetimes by 16/20 is justified by the binary clock,
but it is not a standalone BUILDING fix. This gag contains nine timed ADDs.
An isolated implementation changed its seed-1 `3:141` lifetime from 179 to
143 browser ticks and `3:83` from 115 to 78 ticks, but also moved the entire
gag's completion from 3,405 to 3,215 ticks (64.3 seconds), farther from the
original's 68.4 seconds. It moved `3:139`'s finish from tick 3353 to 3163;
the original finish at sample 1183 is about 67.4 seconds into the episode.

Changing the present cadence to 55 ms, with or without a one-tick increase
for delay 8, shortened the gag further in the same probe. The two clock errors
currently compensate in the overall duration. A production correction needs
both timed ADD deadlines and frame advancement calibrated together against
original per-frame traces, then a full-gag comparison across the other timed
ADD users. No thread-specific timing patch is supported by this evidence.

The source evidence is `BUILDING.ADS` tag 7/8 and `MJFIRE.TTM` in the local
archive, `scratchpad/lifespan-triage-refs/.work/BUILDING_{7,8}_r1/timeline.jsonl`
from fresh original captures, and the browser's `driveGag` helper with seed 1.
The original sample duration and 16 ms `now` clock measurements are documented
in [the faithfulness methodology](../tools/faithfulness-oracle/METHODOLOGY.md#trace-sample-cadence-26).
