# BUILDING:7/8 fire handoff timing

## Calibrated result (#40)

The original requests a 50 ms Windows timer, which resolves to one ~55 ms
PC timer sample. Its negative ADS ADD counts and TTM SET_DELAY counts use the
16 ms game clock. The browser keeps 20 ms fine ticks, rounds each 16 ms
deadline **up** to the next fine tick, and advances frames at the effective
55 ms present cadence. Rounding up prevents an authored deadline from firing
early. This applies to both timed ADD and frame delays, rather than changing
one clock while leaving the other to compensate for it.

Fresh `DBX_DELAY` captures on 2026-09-26 confirm the clock relationship. In a
complete BUILDING:7 episode, `3:82` ran for 115 original samples (about 6.25 s),
its 39 delay-8 frame updates usually occurred about 160 ms apart, and `3:83`
ran for 10 samples (about 0.49 s). The calibrated browser seed 1 runs `3:82`
for 313 fine ticks (6.26 s) and `3:83` for 19 fine ticks (0.38 s). `3:141`
lasts 143 fine ticks (2.86 s), matching the original's 54 samples (2.91 s);
`3:139` lasts 188 fine ticks (3.76 s) against 71 samples (3.83 s). BUILDING:8
uses the same timed handoff and has the same browser seed-1 span.

That original episode took 61.0 s; an earlier complete capture took about
68.4 s because the gag's random branches vary. The calibrated browser seed-1
episode takes 62.7 s, within that observed range. The former browser seed-1
duration was 68.1 s. The new capture makes clear why one original episode's
total duration is not a sufficient timing target by itself.

In a fresh complete MARY:4 capture, `5:37` ran for 14 samples (about 0.70 s).
The calibrated browser seed 1 runs it for 30 fine ticks (0.60 s), with its
ADD occurring before the `5:33` STOP pulse. The prior browser run left it
live for 256 ticks after missing that pulse.

The regenerated [coverage report](oracle-coverage.md) has zero actor spans
beyond the 3× review threshold, zero vocabulary extras, and zero concurrency
failures. Duration and vocabulary remain advisory because 29 reference actor
keys still lack completed-episode span evidence and many branches have only
one or two complete original episodes.

## Earlier diagnosis

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
browser previously counted the raw magnitude in 20 ms fine ticks. `-180` is
therefore 2.88 seconds in the binary but 3.6 seconds in the previous browser timing. This
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

## Why a timed-ADD-only change was insufficient

Scaling all negative ADD lifetimes by 16/20 is justified by the binary clock,
but it is not a standalone BUILDING fix. This gag contains nine timed ADDs.
An isolated implementation changed its seed-1 `3:141` lifetime from 179 to
143 browser ticks and `3:83` from 115 to 78 ticks, but also moved the entire
gag's completion from 3,405 to 3,215 ticks (64.3 seconds), farther from the
original's 68.4 seconds. It moved `3:139`'s finish from tick 3353 to 3163;
the original finish at sample 1183 is about 67.4 seconds into the episode.

Changing the present cadence to 55 ms without calibrating both deadline
classes also shortened the gag. The coordinated conversion above was validated
against fresh per-thread deadline traces and the all-gag coverage report.

The source evidence is `BUILDING.ADS` tag 7/8 and `MJFIRE.TTM` in the local
archive, `scratchpad/lifespan-triage-raw/BUILDING_{7,8}/timeline.jsonl`, the
new local `scratchpad/timing40-{b7,m4}/` timelines and corresponding
`timing40-{b7,m4}-delay.log` clock traces, and the browser's `driveGag`
helper with seed 1.
The original sample duration and 16 ms `now` clock measurements are documented
in [the faithfulness methodology](../tools/faithfulness-oracle/METHODOLOGY.md#trace-sample-cadence-26).
