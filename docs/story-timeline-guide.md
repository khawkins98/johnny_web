# Explore the story timeline

The timeline shows Johnny's story at four levels: **story day → visit → gag → scripted scene**. Its blue map zooms from the full story arc into possible gags and then nearby script steps. It lets you inspect paths while the screensaver runs, or start playback from a day or scene you choose. You need to [import the original game data](../README.md#run-locally) before the timeline can show scenes.

## Open and navigate

Start Classic or Enhanced playback, then click the compass near the upper-left corner or press `T`. Move the pointer to reveal the compass. Press `T` or `Esc`, or click **×**, to close the panel. The compass and Settings icons show their shortcuts on hover and keyboard focus.

| Part of the panel | What it shows | What you can do |
| --- | --- | --- |
| **Story timeline map** | At the widest view, days 01–11 form the main line. Yellow is the live day, a white outline marks your selection, and an arch joins day 11 back to day 1. | Wheel over the map or use **+**/**−** to move between **days → possible gags → script paths**. Select a day node to inspect its key scene and choices. Hover or keyboard-focus a node for its label and a small, silent original-game preview. On narrow screens, scroll the map sideways. |
| **Explored day** | The day panel names its key scene. The zoomed map branches to representative day-eligible gags. | Selecting a day does not change playback. Choose **Play day** to save it and restart the visit from its key scene. **Inspect key scene** returns to its script after exploring another gag. |
| **This visit** | Gags in their planned order. Yellow is the live gag, cyan cards are later in this visit, and dimmed cards are already seen in this run. | Scroll the strip or use its arrow buttons. Select a gag to inspect it; a white outline marks the inspected card. **Return to live** takes you back to Johnny's current gag. |
| **After this visit / Day options** | All-tide examples eligible on the live or explored day. The list opens when you select a day; the map can also show tide-gated possibilities. | Select an example to explore its script, or choose **Inspect key scene** to return to that day's story scene. These are **possibilities, not a forecast** of a visit. The next visit is chosen later by the game's selection logic. |
| **Gag steps** | Nearby actions from the selected gag's original script. | Select a scene node or an action below the map to follow a possible route. **Back** and **Forward** retrace your inspection choices. |

The panel keeps the live or inspected gag in view when it opens, playback advances, or the window changes size. The **This visit** row shows order, not elapsed time. The **This visit ends** card marks the end of the plan currently known to the browser. **Return to live** leaves day exploration without changing playback.

In the day view, **line width shows the relative catalogue selection weight** of a possible gag. These weights are source data, not exact percentages for the next visit: tide, remaining visit budget, and recent endings also affect selection. A yellow branch marks the day's key scene. Curved lines show repeat visits, the day-11 wrap, or loops and back edges inside a script. Orange script edges mark random choices whose precise odds are not known here.

## Preview or play a scene

Opening a gag selects an early script action, skipping named setup loaders when possible. The inspector shows a **silent preview** rendered from the original game data. Select another scene node to change the preview. It may include setup actions and character poses needed to reach that scene. Some script actions have little visible motion or no available preview.

Choose **Play this scene now** to interrupt the current playback, run the selected scene through the original gag logic, and then resume the planned sequence. While exploring another day, the same action is labeled **Play only this scene**: it does not save or switch days. Use **Play day** to change the saved day and start its key scene. Merely selecting a day, gag, scene, or possible route does not change playback.

The map describes **possible script paths**. Its white selection and traced route show what you are exploring, not an exact recording of Johnny's live playhead or random decisions. Actions below the map distinguish conditions, parallel actions, and random picks. **Full script map** opens the whole gag graph; drag to pan, use the wheel or **+**/**−** to zoom, and use **⌖** to fit it. **Near scene** returns to the local view. **Read the original script steps** expands the extracted text outline.

Story days advance naturally after key scenes unlock them and calendar dates change. See [Johnny's 11-day story](story-over-time.md) for that process, or [Scene flows](scene-flows/README.md) for the generated script diagrams.
