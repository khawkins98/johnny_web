# Johnny's 11-day story

*Johnny Castaway* is more than a random gag reel. It mixes everyday island scenes with an 11-day story that advances with the real calendar. The browser port keeps that state in `localStorage`.

For the logic inside a gag, see [Scene flows](scene-flows/README.md). For the wider playback pipeline, see [Johnny host behavior](johnny-host-behavior.md).

## How scenes are chosen

There are two kinds of variation:

- **Within a day:** scenes are chosen at random, using the weights stored in the original game data. This keeps repeated visits varied.
- **Across days:** some scenes belong to a specific story day. These key scenes form the longer plot, from Johnny finding the message through the day-11 finale. Ordinary scenes can appear on any day.

The tide follows a separate half-hour clock. Its starting point is saved on the first run, so it changes predictably with the time of day.

## How the day advances

The game stores both the current day and the next unlocked day. Playing a day's key scene unlocks the next one. When the calendar date changes, the current day moves one step toward that unlocked day. It never skips ahead, and day 11 wraps back to day 1.

This reproduces the screensaver's original pace: brief visits over several real days reveal the story. Restarting the screensaver does not restart the plot.

If browser storage is unavailable, playback still works, but starts from day 1 each time.

## Viewing or changing the story day

Settings shows the current day, the story's start date, and a **Restart story** button. Restarting returns to day 1 and resets the tide's starting point.

The developer panel (`D`) can set a day directly or advance one day. A change applies to the next gag because the current sequence has already been planned. The separate preview-day control only previews a scene and does not change saved progress.

## Controller API

`createJohnnyStoryController` in `src/games/johnny/story-controller.mjs` provides:

| Method | Purpose |
| --- | --- |
| `getStoryDay()` | Return the saved day, from 1 to 11. |
| `getStartTime()` | Return the saved tide anchor, or `null` before the first run. |
| `setStoryDay(day)` | Save a day from 1 to 11. |
| `advanceStoryDay()` | Advance one day, wrapping 11 to 1. |
| `resetStory()` | Return to day 1 and reset the tide anchor. |

These methods update the same saved state used by normal playback; there is no separate debug timeline.
