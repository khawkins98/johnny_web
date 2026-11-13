# Explore the story timeline

The timeline has two screens: **pick what to watch**, then **what time of day**. It opens on a beach scene: a map of Johnny's island with the 40 everyday gags at sixteen places, eleven flags for the story days, and a diary showing the day, the time of day and the visit in progress. You need to [import the original game data](../README.md#run-locally) before scenes, card pictures, and animation previews can appear.

## Open and close

Press Play, then choose **Timeline** in the bottom toolbar or press `T`. With the toolbar hidden, moving the pointer also reveals the compass near the upper-left corner. Press `T` or `Esc`, or click **×**, to close the panel. The compass and Settings icons show their shortcuts on hover and keyboard focus. The diary's circled entry opens the gag Johnny is playing; from any other scene, **↖ Johnny now** does the same and **‹ Back to the map** returns to the map.

Card pictures are real frames, rendered in your browser from your own game data and kept there, so each one is made only once. Until a picture is ready, or when a gag shows nothing clear in its first 15 seconds, its card shows a pixel icon for its family of gags (fishing, building, visitors, Mary, Suzy, and so on).

## The island map

The map lies on the sand with the flags planted above it and the diary, an open logbook, beside it. On a narrow screen the flags, the map and the diary stack in that order.

The day changes only which story scene plays, and the time of day only matters for a dozen gags, so neither needs a screen of its own.

- **The diary.** Today's page gives the day, the time of day, the sky and the beach tide, and lists the visit the game has planned as a handwritten checklist: ticked entries are done, the circled one is happening now, plain ones are still to come. An entry opens that gag. Single gags you play from the timeline are not part of the visit and are not listed. Picking a place or a day turns the page to it, and **‹ Today's page** turns back. While you are on a temporary visit the page is headed **Visiting** and offers **Go back**.
- **Places.** Sixteen painted objects, each named on the map, hold the 40 everyday gags. A number after a name is how many gags happen there. The place Johnny is at glows.
- **Picking.** A place with several gags lists them in the diary (beside the map on wide windows, under it otherwise) and moves focus there; pick one to open its scene screen, or press the place again to close it. A place with one gag opens it directly. A card says **Daytime only**, **Early day only** or **Night only** when a gag cannot play at every time; **☾** marks a gag that ends a visit.
- **The story.** The eleven numbered flags in the sand above the map are the story days; they stand outside the map because days are not places on the island. Today's flag is orange, with footprints leading to it. Pressing a flag picks that day without leaving the map: the flag stays raised, a **Day N's story** marker appears on the island, and the diary shows the day's story scene and asks **Start this day from its story scene?** **▶ Start day N** plays that scene as a temporary visit (choose **Stay here** on the notice to carry on from that day); **How this scene unfolds** opens its scene screen. While a day is picked, anything else chosen on the map plays as that day. Press the flag again to let go of it.
- **What a day changes.** Only two things differ from day to day: the day's one story scene, and how far the raft has been built (finished from day 6). All sixteen places are there every day, which is why picking a day adds a marker and does not remove anything.
- **Time of day.** The **Any time / Early day / Late day / Night** chips dim places and gags with nothing on at that time and darken the map at night; three places (bottle beach, raft trips, shark waters) close at night. Nothing is hidden or reordered. Each chip's tooltip gives the local clock times that band covers.

The map is sized to fit the window's height, so the whole island is on screen at once; when the window is too narrow for it, it keeps a readable size and scrolls sideways, and says so. Places are reached by keyboard in reading order, after the eleven days.

The map only browses: nothing plays until you press Play on a scene. Places are grouped by what happens in each gag, so they differ from the original's script files (the boat Johnny swims out to is with the visitors, not with the jog it shares a script file with), and they sit where it looks right on the map: the game's own data records where Johnny stands when a gag begins, not where the shark or the boat is. The artwork is provisional (see [issue #96](https://github.com/khawkins98/johnny_web/issues/96)).

## One scene

Pick a gag at a place, or **How this scene unfolds** on a day. The scene's card sits at the top with one question, **What time of day?** Times a gag cannot play at are crossed out, and the time now is chosen when it is allowed; the same time is used by every Play button and preview on the screen. The game's story clock counts half hours from the **Start Time** in Settings (9:00 by default, as in the original) and repeats every 8 hours; its last 2 hours are night. Every gag's window starts and ends at the same points, so three bands cover them exactly: **early day**, **late day** and **night**. (The original calls these windows "tide", but high or low tide on the beach is a separate coin flip per visit.) A story scene is not tied to the clock, because the game reaches it through a one-in-ten chance at the start of a visit that ignores it. So most story scenes offer all three times. Two exceptions follow what you would actually see: the date on day 5 always bakes the night sky, so only night is offered, and the scenes on days 3, 9, 10 and 11 are set away from the island, so the question is not asked.

**▶ Play this gag** (or **▶ Play this scene**) plays just that, now, at the chosen time, then goes back to where you were. To spend a whole visit on a story day, use **Visit this day** in the Log.

Below it, **how this gag unfolds** lists its steps in order: each condition ("After walk to bottle") and the scenes it starts or stops. Steps that pick at random say so. Click a scene to select it: the steps that lead to it are highlighted, and the side panel shows a silent preview from the original game. **▶ Play this scene now** interrupts playback, runs the gag from that scene, then lets the visit carry on. Resource-loading steps are hidden. The list shows possible routes; it is **not an exact trace of live execution, elapsed time, or the odds of a choice**.

See [Johnny's 11-day story](story-over-time.md) for day progression, or [Scene flows](scene-flows/README.md) for generated script diagrams.

## Browsing and playback clocks

Cards, chips and the navigation links only browse: they never change the running scene, saved day, or clock. Only the Play buttons and **Go back** change playback. While you are visiting, **today** still marks your saved day, and no time of day is marked as “now”. Your place on the map and keyboard focus are kept when it redraws as Johnny moves on. On a scene's screen the line under the title shows the **playing day, sky and beach tide**; on the map the diary does.

### Configure the clock

Settings labels **Story clock offset (Start Time)** as an offset of the original repeating eight-hour sequence clock, not an instruction to show that hour. Changes apply when the next visit is planned. At 21:00 with the default 09:00 offset, original playback is daytime (phase 8); setting the offset itself to 21:00 also gives daytime at 21:00 (phase 0). **Live Local Clock** changes only the rendered sky immediately: night before 06:00 and from 18:00, without changing eligibility. Thus at 21:00 it shows night under either offset, while gag choices still follow the story clock.

### Play a selected day or preview

**Play this gag**, **Play this scene**, **Play this scene now** and the Log's **Visit this day** use the selected day and band for eligibility and sky, even with Live Local Clock. Night selects phase 12, early day phase 0, and late day phase 8. These are temporary visits: neither the story day nor the clock is saved. A visit keeps its day and band through its final gag, then automatic playback returns to the saved day and configured clock. A single gag or scene preview keeps them only for that preview and then resumes the interrupted visit. Visits end on reload or return to the title screen.

While visiting, a short notice says where you are (“Visiting Day 6 · Night”) and for how long (“Just this visit, then back to where you were.”, or “Just this gag…” for a single gag). It adds “This scene always plays at night.” only when a scene overrides a daytime choice. It offers two actions:

- **Go back** returns to the gag that was interrupted, from that gag's beginning, followed by the rest of its visit. Hopping between several visits and previews still goes back to the original place. The Log's **Go back** does the same and is only enabled during a visit.
- **Stay here** makes the visit the saved position: the visited day becomes the story day, and the Start Time offset is set so the story clock stands at the start of the visited band now and keeps advancing. Playback is not interrupted. Scene-only sky and tide requirements are not saved.

### Scene and tide exceptions

Scene requirements still apply: Mary's scene can require night even when daytime is selected, and off-island scenes have no island sky. Both exceptions are shown in playback status. Beach high/low tide is independent of these bands and is randomly baked per visit; some scenes force high tide. The status reports the actual baked tide, and the bands' sea artwork only depicts sky. There is no high/low tide selector.
