# Explore the story timeline

The timeline has two screens: **pick what to watch**, then **what time of day**. It opens on a list of every scene: the 11 story scenes in day order, and the 40 everyday gags grouped by kind. A **Now** bar at the top shows the day, time of day and gag Johnny is on. You need to [import the original game data](../README.md#run-locally) before scenes, card pictures, and animation previews can appear.

## Open and close

Press Play, then choose **Timeline** in the bottom toolbar or press `T`. With the toolbar hidden, moving the pointer also reveals the compass near the upper-left corner. Press `T` or `Esc`, or click **×**, to close the panel. The compass and Settings icons show their shortcuts on hover and keyboard focus. The Now bar's **How this gag works** link opens the gag Johnny is playing; from any other scene, **↖ Johnny now** does the same and **‹ All scenes** returns to the list.

Card pictures are real frames, rendered in your browser from your own game data and kept there, so each one is made only once. Until a picture is ready, or when a gag shows nothing clear in its first 15 seconds, its card shows a pixel icon for its family of gags (fishing, building, visitors, Mary, Suzy, and so on).

## The island map

On screens at least 900 pixels wide the timeline opens on a fold-out map of Johnny's island; elsewhere it opens on the list below. **Map** and **List** switch between them and the choice is remembered. Both show the same scenes and the same Now bar.

- **Places.** Sixteen painted objects, each named, hold the 40 everyday gags: the fishing spot, the campfire, the reading spot, the coconut palm, Lilliput, the diving spot, the natives' canoe, the visitors' boat, bottle beach, the bath, the jogging track, the sandcastle, the leaf bed, a hot summer day, raft trips and shark waters. A number after a name is how many gags happen there. The place Johnny is at glows.
- **Picking.** A place with several gags lists them beside the map; pick one to open its scene screen. A place with one gag opens it directly.
- **The story.** Eleven numbered flags on a dotted trail across the top are the story days, with today marked. A flag opens that day's scene.
- **Time of day.** The chips dim places with nothing on at that time and darken the map at night; three places (bottle beach, raft trips, shark waters) close at night. Nothing is hidden.

The map only browses: nothing plays until you press Play on a scene. Places are grouped by what you see, so they differ from the list's seven groups, and they sit where it looks right on the map: the game's own data records where Johnny stands when a gag begins, not where the shark or the boat is. The artwork is provisional (see [issue #96](https://github.com/khawkins98/johnny_web/issues/96)).

## The scene list

Why a list rather than steps: the day changes only which story scene plays, and the time of day only matters for a dozen gags, so neither needs a screen of its own.

- **Now** shows where Johnny is and, as one row of chips that scrolls sideways, the visit the game has planned in order, with the current gag highlighted. Single gags you play from the timeline are not part of the visit and are not listed. While you are on a temporary visit it reads **Visiting Day N · time** and offers **Go back**.
- **The story** is one scene per day, 1 to 11. Playing a day's scene unlocks the next day. Today is marked.
- **Things Johnny does** is the 40 gags that can turn up on any day, in the original's own groups under plainer names: Fishing, Around the island, Camp life, Visitors and coconuts, Out and about, Bottles, Odds and ends. Within a group the likeliest come first. A card says **Daytime only**, **Early day only** or **Night only** when a gag cannot play at every time; **☾** marks a gag that ends a visit.
- The **Any time / Early day / Late day / Night** chips dim the gags that cannot play then. They do not hide or reorder anything. Each chip's tooltip gives the local clock times that band covers.

## One scene

Pick any card. The scene's card sits at the top with one question, **What time of day?** Times a gag cannot play at are crossed out, and the time now is chosen when it is allowed; the same time is used by every Play button and preview on the screen. The game's story clock counts half hours from the **Start Time** in Settings (9:00 by default, as in the original) and repeats every 8 hours; its last 2 hours are night. Every gag's window starts and ends at the same points, so three bands cover them exactly: **early day**, **late day** and **night**. (The original calls these windows "tide", but high or low tide on the beach is a separate coin flip per visit.) A story scene is not tied to the clock, because the game reaches it through a one-in-ten chance at the start of a visit that ignores it. So most story scenes offer all three times. Two exceptions follow what you would actually see: the date on day 5 always bakes the night sky, so only night is offered, and the scenes on days 3, 9, 10 and 11 are set away from the island, so the question is not asked.

**▶ Play this gag** (or **▶ Play this scene**) plays just that, now, at the chosen time, then goes back to where you were. To spend a whole visit on a story day, use **Visit this day** in the Log.

Below it, **how this gag unfolds** lists its steps in order: each condition ("After walk to bottle") and the scenes it starts or stops. Steps that pick at random say so. Click a scene to select it: the steps that lead to it are highlighted, and the side panel shows a silent preview from the original game. **▶ Play this scene now** interrupts playback, runs the gag from that scene, then lets the visit carry on. Resource-loading steps are hidden. The list shows possible routes; it is **not an exact trace of live execution, elapsed time, or the odds of a choice**.

See [Johnny's 11-day story](story-over-time.md) for day progression, or [Scene flows](scene-flows/README.md) for generated script diagrams.

## Browsing and playback clocks

Cards, chips and the navigation links only browse: they never change the running scene, saved day, or clock. Only the Play buttons and **Go back** change playback. While you are visiting, **today** still marks your saved day, and no time of day is marked as “now”. Your place in the list and keyboard focus are kept when the list redraws as Johnny moves on. The line under the title shows the **playing day, sky and beach tide**.

### Configure the clock

Settings labels **Story clock offset (Start Time)** as an offset of the original repeating eight-hour sequence clock, not an instruction to show that hour. Changes apply when the next visit is planned. At 21:00 with the default 09:00 offset, original playback is daytime (phase 8); setting the offset itself to 21:00 also gives daytime at 21:00 (phase 0). **Live Local Clock** changes only the rendered sky immediately: night before 06:00 and from 18:00, without changing eligibility. Thus at 21:00 it shows night under either offset, while gag choices still follow the story clock.

### Play a selected day or preview

**Play this gag**, **Play this scene**, **Play this scene now** and the Log's **Visit this day** use the selected day and band for eligibility and sky, even with Live Local Clock. Night selects phase 12, early day phase 0, and late day phase 8. These are temporary visits: neither the story day nor the clock is saved. A visit keeps its day and band through its final gag, then automatic playback returns to the saved day and configured clock. A single gag or scene preview keeps them only for that preview and then resumes the interrupted visit. Visits end on reload or return to the title screen.

While visiting, a short notice says where you are (“Visiting Day 6 · Night”) and for how long (“Just this visit, then back to where you were.”, or “Just this gag…” for a single gag). It adds “This scene always plays at night.” only when a scene overrides a daytime choice. It offers two actions:

- **Go back** returns to the gag that was interrupted, from that gag's beginning, followed by the rest of its visit. Hopping between several visits and previews still goes back to the original place. The Log's **Go back** does the same and is only enabled during a visit.
- **Stay here** makes the visit the saved position: the visited day becomes the story day, and the Start Time offset is set so the story clock stands at the start of the visited band now and keeps advancing. Playback is not interrupted. Scene-only sky and tide requirements are not saved.

### Scene and tide exceptions

Scene requirements still apply: Mary's scene can require night even when daytime is selected, and off-island scenes have no island sky. Both exceptions are shown in playback status. Beach high/low tide is independent of these bands and is randomly baked per visit; some scenes force high tide. The status reports the actual baked tide, and the bands' sea artwork only depicts sky. There is no high/low tide selector.
