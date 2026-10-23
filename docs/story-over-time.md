# Johnny's 11-day story

*Johnny Castaway* is more than a random gag reel. It mixes everyday island scenes with an 11-day story that advances with the real calendar. The browser port keeps that state in `localStorage`.

For an interactive view of days, visits, and gags, see the [story timeline guide](story-timeline-guide.md). For the logic inside a gag, see [Scene flows](scene-flows/README.md). For the wider playback pipeline, see [Johnny host behavior](johnny-host-behavior.md).

## How scenes are chosen

There are two kinds of variation:

- **Within a day:** scenes are chosen at random, using the weights stored in the original game data. This keeps repeated visits varied. A visit ends with a different scene from the one before, though the same ending can come back two visits later. A few scenes play on their own as a whole visit (for example `ACTIVITY.ADS` #11 and the Suzy and Johnny key scenes).
- **Across days:** some scenes belong to a specific story day. These key scenes form the longer plot, from Johnny finding the message through the day-11 finale. Ordinary scenes can appear on any day. A key scene is reached only through a one-in-ten chance at the start of each visit, as in the original, so it turns up in about one visit in ten on its day, and at any time of day.

Which ordinary scenes are eligible also follows a separate half-hour clock that wraps every eight hours, counted from the **Start Time** setting (9:00 by default, as in the original; stored as `jc-start-time-hhmm`. Older versions saved a first-run date under `jc-start-time`; it is deleted on load and never read), so it changes predictably with the time of day. Its last quarter brings the night sky. Key scenes ignore this clock. Whether the beach shows high or low tide is a coin flip per visit, as in the original.

## How the day advances

The game stores both the current day and the next unlocked day. Planning a visit with the day's key scene unlocks the next one. When the calendar date changes, the current day moves one step toward that unlocked day. It never skips ahead, and day 11 wraps back to day 1. As in the original, each time the one-in-ten key-scene chance comes up the unlocked day is first set back to the current day, so the key scene can play more than once a day; the day still advances as long as the key scene was planned after that last chance.

This reproduces the screensaver's original pace: brief visits over several real days reveal the story. Restarting the screensaver does not restart the plot.

If browser storage is unavailable, playback still works, but starts from day 1 each time.

## Viewing or changing the story day

Settings shows the current day and a **Restart story** button. Restarting returns to day 1; it leaves the **Start Time** setting alone. In the compass timeline, selecting a day first shows its key scene, possible gags, and script paths without changing playback. **Play day** saves that story position and restarts the visit from its key scene. **Play only this scene** previews an individual action and then resumes the current visit without changing the saved day.

The developer panel (`D`) can set a day directly or advance one day. A change applies to the next gag because the current sequence has already been planned. The separate preview-day control only previews a scene and does not change saved progress.

## Controller API

`createJohnnyStoryController` in `src/games/johnny/story-controller.mjs` provides:

| Method | Purpose |
| --- | --- |
| `getStoryDay()` | Return the saved day, from 1 to 11. |
| `getStartTime()` | Return the stored Start Time (HHMM, rounded down to the half hour), or `null` when the original's 9:00 default applies. |
| `setStoryDay(day)` | Save a day from 1 to 11. |
| `advanceStoryDay()` | Advance one day, wrapping 11 to 1. |
| `resetStory()` | Return to day 1. The Start Time setting is kept. |

These methods update the same saved state used by normal playback; there is no separate debug timeline.
