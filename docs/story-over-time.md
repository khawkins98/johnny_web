# The story, over time

How Johnny's screensaver tells one continuous 11-day story across many separate runs, without ever restarting it — and how to see or change where you are in it. All mechanics described here live in `src/games/johnny/story-controller.mjs`; see [Johnny host behavior](johnny-host-behavior.md) for the surrounding sequence-planning and presentation pipeline, and [Architecture](architecture.md) for the host/engine split this controller sits on top of. This doc covers the arc *across* gags; [Scene flows](scene-flows/README.md) covers the scripted flow *within* each individual gag, generated from the authored ADS bytecode.

## Two levels of randomness

Johnny's story is built from two independent layers:

**Within a day**, which gag plays next is weighted-random. `chooseFinalScene` picks the sequence's ending: a 10%-gated day-locked keyframe first (if one is eligible and hasn't just played), otherwise a **weight-roulette** — `weightedPick` sums each candidate's authored weight (`byte@0x02` in the original binary) and rolls within that total, so heavier-weighted endings come up more often without ever being guaranteed. The same weight-roulette fills in the ordinary "intermediate" scenes leading up to that ending, spending a 300-unit walk-span budget (`createPlan`) until it runs out. This is what makes two runs on the same story day still feel different from each other.

**Across days**, an 11-day keyframe arc is calendar-driven, not random. Certain scenes are tagged with a fixed `day` (1–11) in the scene catalogue; a scene is only eligible when `candidate.day === 0` (any day) or `candidate.day === storyDay` (`eligible`, line ~380). Day-locked keyframes carry the ongoing plot beats — Johnny finding the message, digging up the coconut treasure, and so on, building to the day-11 finale — while the untagged (`day === 0`) scenes are the general ambient gag pool available every day. This is the layer that makes the screensaver a *story* rather than just a gag reel: it advances once per real calendar day, whether or not you're watching.

## The dual-counter day advance

The day-11 arc is driven by two persisted counters, recovered from the original binary (`FUN_1018_0ba5`) and implemented in `updateStoryDay`:

- **`jc-story-target`** — the day that has been *unlocked*. `unlockKeyframeDay` bumps it by one whenever a day-locked keyframe scene actually plays (and the calendar has caught up: `target <= cur`).
- **`jc-story-day`** — the day the calendar is currently *chasing* the target to, one step at a time.

Each time the real calendar date changes (`jc-story-date`, a full year-month-day key so a run exactly a year later still counts as a new day), `cur` advances toward `target` by exactly one — never more, and never without a date change. Once `cur` would exceed 11, the whole story wraps back to day 1 (`target = 1, cur = 1`), and the arc starts over.

The practical effect: leaving the screensaver running (or just letting the days pass) advances the story one keyframe day at a time, at the real-world pace the original screensaver was designed for. There is no way to "binge" the arc by mashing through gags in one sitting — the calendar itself is the pacing mechanism.

## Tide-by-clock

A separate persisted value, `jc-start-time` (`month*100 + day`, captured on first run via `getStartTime`), anchors the tide clock. `tidePhaseFor` derives the current tide phase from the wall clock's half-hour bucket relative to that anchor, so the tide is deterministic given the time of day and the anchor date — not randomized per run.

## How the original told a whole story without restarting

None of this state lives in a save file the player manages, and none of it resets when the screensaver stops and starts again — that's the point. `jc-start-time`, `jc-story-day`, `jc-story-target`, and `jc-story-date` are read and written directly against the host's persistent storage (`localStorage` in the browser port) on every sequence build (`buildSequence`, `getStartTime`). A user who leaves their computer idle every afternoon for two weeks sees the arc unfold exactly as the original Sierra screensaver did: a few minutes of gags today, a few more tomorrow, and every so often — gated by the real calendar — the next chapter.

All of the persistence here is best-effort: every read and write is wrapped in `try/catch` (`getStartTime`, `updateStoryDay`, and the tooling described below), so a host with storage unavailable (private browsing, quota exceeded) degrades to "always day 1, re-anchored each run" rather than throwing.

## Seeing and controlling it

Because the arc advances on real calendar days, watching it unfold naturally takes up to 11 days. Two controls make it visible and adjustable sooner:

**Settings** (the in-game, player-facing panel) shows a small Story section: "Day *N* of 11", when the story started (from `getStartTime()`), and a **Restart story** button. Restarting calls `resetStory()` — it sets the day back to 1 *and* re-anchors `jc-start-time` to today, so the tide clock and the day arc both start fresh together.

The **developer panel** (`D`) exposes the same persisted counter directly for testing: a "Story day" number input (1–11) with a **Set** button (`setStoryDay(n)`) and a **+1 day** button (`advanceStoryDay()`, wrapping 11 → 1). This is distinct from the panel's separate "Story chapter to simulate" selector, which only supplies a one-off day value to the `preview`/`planFrom` debug actions for trying a specific scene — it does not touch persisted state. A change to the persisted Story day control takes effect starting with the next gag, since the currently queued sequence was already planned against the old day.

## API surface

`createJohnnyStoryController` (`src/games/johnny/story-controller.mjs`) exposes, alongside the existing sequencing API (`next`, `preview`, `planFrom`, `status`, `subscribeStatus`, `describe`):

| Method | Behavior |
| --- | --- |
| `getStoryDay()` | Current persisted day, clamped 1–11 (defaults to 1). |
| `getStartTime()` | Persisted StartTime anchor (`month*100 + day`), or `null` if never set. |
| `setStoryDay(day)` | Clamps to 1–11; writes `jc-story-day` and `jc-story-target` to that day and `jc-story-date` to today, so the arc holds there and resumes advancing on the next real date change. Returns the day set. |
| `advanceStoryDay()` | `setStoryDay(current + 1)`, wrapping day 11 back to 1. Returns the new day. |
| `resetStory()` | Full fresh start: day 1, re-anchors `jc-start-time` to today, and sets `jc-story-date` to today. Returns `1`. |

These write the same three keys `updateStoryDay` already reads and writes — there is no separate storage layer for player/developer control, just direct, explicit writes to the state the arc already runs on.
