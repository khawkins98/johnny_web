# Johnny's 11-day story

*Johnny Castaway* is more than a random gag reel. It mixes everyday island scenes with an 11-day story that advances with the real calendar. The browser port keeps that state in `localStorage`.

For an interactive view of days, visits, and gags, see the [story timeline guide](story-timeline-guide.md). For the logic inside a gag, see [Scene flows](scene-flows/README.md). For the exact planning rules, see [Johnny host behavior](johnny-host-behavior.md#scene-selection-and-sequencing).

## How scenes are chosen

There are two kinds of variation:

- **Within a day:** each visit is a batch of gags chosen at random, using the weights stored in the original game data. A visit never ends with the same gag as the visit before, though an ending can come back two visits later. A few gags play on their own as a whole visit, for example `ACTIVITY.ADS` #11 and the Suzy and Johnny key scenes.
- **Across days:** some scenes belong to a specific story day. These key scenes form the longer plot, from Johnny finding the message to the day-11 finale. Ordinary gags can appear on any day. As in the original, a key scene comes only through a one-in-ten chance at the start of each visit, so it turns up in about one visit in ten on its day, at any time of day.

Which ordinary gags can appear also depends on the game's story clock. It counts half hours from the **Start Time** setting (9:00 by default, as in the original) and wraps every eight hours, so it changes predictably with the time of day. Its last quarter brings the night sky. Key scenes ignore it. Whether the beach shows high or low tide is a separate coin flip per visit.

The Start Time is stored as `jc-start-time-hhmm`. Older versions saved a first-run date under `jc-start-time`; the app deletes that key on load and never reads it.

## How the day advances

The game stores both the current day and the next unlocked day. Planning a visit with the day's key scene unlocks the next one. When the calendar date changes, the current day moves one step toward the unlocked day. It never skips ahead, and day 11 wraps back to day 1. Each time the one-in-ten chance comes up, the original first sets the unlocked day back to the current day, so the key scene can play more than once a day. The day still advances as long as the key scene was planned after that last chance.

So brief visits over several real days reveal the story, as in the original. Restarting the screensaver does not restart the plot. If browser storage is unavailable, playback still works but starts from day 1 each time.

## Viewing or changing the story day

Settings shows the current day and a **Restart story** button. Restarting returns to day 1 and leaves the Start Time alone.

In the story timeline, picking a day only explores it. **▶ Play day** saves that day and starts a visit from its key scene. **▶ Play this scene now** plays one scene and then resumes the current visit without changing the saved day. See the [story timeline guide](story-timeline-guide.md) for the full controls.

The developer panel (`D`) can set a day directly or advance one day. The change applies from the next gag, because the current visit is already planned. Its simulated-day control for a debug run does not change saved progress.

## Controller API

`createJohnnyStoryController` in `src/games/johnny/story-controller.mjs` provides:

| Method | Purpose |
| --- | --- |
| `getStoryDay()` | Return the saved day, from 1 to 11. |
| `getStartTime()` | Return the stored Start Time (HHMM, rounded down to the half hour), or `null` when the original's 9:00 default applies. |
| `setStoryDay(day)` | Save a day from 1 to 11. |
| `advanceStoryDay()` | Advance one day, wrapping 11 to 1. |
| `resetStory()` | Return to day 1. The Start Time setting is kept. |

These methods update the same saved state as normal playback; there is no separate debug timeline.
