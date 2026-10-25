# Explore the story timeline

The timeline asks one question at a time: **which day, what time of day, which gag**. It opens on the gag Johnny is playing now, with the path to it shown as a breadcrumb (for example **Day 10 › Early day › Eat**). Click any part of the breadcrumb to go back to that question. You need to [import the original game data](../README.md#run-locally) before scenes, card pictures, and animation previews can appear.

## Open and close

Start Classic or Enhanced playback, then choose **Timeline** in the bottom toolbar or press `T`. With the toolbar hidden, moving the pointer also reveals the compass near the upper-left corner. Press `T` or `Esc`, or click **×**, to close the panel. The compass and Settings icons show their shortcuts on hover and keyboard focus. **↖ Johnny now** returns to the live gag from anywhere.

Card pictures are real frames, rendered in your browser from your own game data and kept there, so each one is made only once. Until a picture is ready, or when a gag shows nothing clear in its first 15 seconds, its card shows a pixel icon for its family of gags (fishing, building, visitors, Mary, Suzy, and so on).

## Which day?

Johnny's story runs over 11 days. Each day card shows that day's **key scene**; playing it unlocks the next day. Today is marked.

## What time of day?

The game's story clock decides which gags can appear. It counts half hours from the **Start Time** in Settings (9:00 by default, as in the original) and repeats every 8 hours; its last 2 hours are night, when the original shows the night sky. Each band lists the local clock times it covers, worked out from that Start Time: with 9:00, night is 07:00–09:00, 15:00–17:00 and 23:00–01:00. Every gag's window starts and ends at the same points, so three bands cover them exactly: **early day**, **late day**, and **night**. Each option says how many gags it allows, and the time right now is marked. (The original calls these windows "tide", but high or low tide on the beach is a separate coin flip per visit.) **▶ Play selected day/time** saves the selected story day and starts a visit from its key scene using the selected band. The selection is shown above the cards; choose a band first to change it.

## Which gag?

These are the gags the game can choose on that day at that time, with the day's key scene first. The key scene is listed under every time of day, because the game reaches it through a one-in-ten chance at the start of a visit that ignores the clock; ordinary gags follow their clock windows. Corner marks on a card: **☾** ends a visit, **✦N** is the key scene for day N. On today's day and time, a **This visit** strip shows the visit the game has planned, in order, with Johnny's current gag highlighted.

## A gag

The chosen gag's card sits at the top. **▶ Play this gag** runs that gag in the selected day and band, then resumes the interrupted visit.

Below it, **how this gag unfolds** lists its steps in order: each condition ("After walk to bottle") and the scenes it starts or stops. Steps that pick at random say so. Click a scene to select it: the steps that lead to it are highlighted, and the side panel shows a silent preview from the original game. **▶ Play this scene now** interrupts playback, runs the gag from that scene, then lets the visit carry on. Resource-loading steps are hidden. The list shows possible routes; it is **not an exact trace of live execution, elapsed time, or the odds of a choice**.

See [Johnny's 11-day story](story-over-time.md) for day progression, or [Scene flows](scene-flows/README.md) for generated script diagrams.

## Browsing and playback clocks

Cards and breadcrumbs only browse: they never change the running scene, saved day, or clock. The panel separately shows **Browsing day / band**, **Playing day / sky / beach tide**, and the configured sky clock. **Johnny now** navigates to the running gag; it does not change playback.

Settings labels **Story clock offset (Start Time)** as an offset of the original repeating eight-hour sequence clock, not an instruction to show that hour. Changes apply when the next visit is planned. At 21:00 with the default 09:00 offset, original playback is daytime (phase 8); setting the offset itself to 21:00 also gives daytime at 21:00 (phase 0). **Live Local Clock** changes only the rendered sky immediately: night before 06:00 and from 18:00, without changing eligibility. Thus at 21:00 it shows night under either offset, while gag choices still follow the story clock.

Explicit **Play selected day/time**, **Play this gag**, and **Play this scene now** use the selected day and band for eligibility and sky, even with Live Local Clock. Night selects phase 12, early day phase 0, and late day phase 8. A visit pins this context through its final gag, then automatic playback uses the configured clock again. A single gag/scene preview pins it only for that preview and then resumes the interrupted visit (including any still-active visit override). Overrides are not saved and end on reload or return to the title screen. Returning to title cancels the visit; starting again uses the configured clock. A persistent **Temporary** notice shows the playing day, sky, beach tide and lifetime; **Return to live clock** interrupts the run and starts a fresh visit using the current configured clock and saved story day. It does not change clock settings.

Scene requirements still apply: Mary's scene can require night even when daytime is selected, and off-island scenes have no island sky. Both exceptions are shown in playback status. Beach high/low tide is independent of these bands and is randomly baked per visit; some scenes force high tide. The status reports the actual baked tide, and the bands' sea artwork only depicts sky. There is no high/low tide selector.
