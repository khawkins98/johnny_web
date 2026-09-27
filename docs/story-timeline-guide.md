# Explore the story timeline

The timeline shows Johnny's **11 story days, the current visit, possible future gags, and a selected gag's script references** in one pan and zoom map. The day ruler runs forward from 01 to 11; it does not represent branching or elapsed time. You need to [import the original game data](../README.md#run-locally) before scenes and animation previews can appear.

## Open and navigate

Start Classic or Enhanced playback, then click the compass near the upper-left corner or press `T`. Press `T` or `Esc`, or click **×**, to close the panel. The compass and Settings icons show their shortcuts on hover and keyboard focus.

The map opens around Johnny's live gag. Drag empty space to pan; wheel or use **+**/**−** to zoom around the pointer. With keyboard focus on the map, arrow keys pan and `+`/`−` zoom. On touch screens, drag with a finger and use the zoom buttons.

- **Follow live** returns the camera to Johnny's current gag.
- **Next visit ?** moves to the end of the visit already planned by the game. When inspecting another day, this shortcut becomes **Day options →** and moves to that day's possibilities gate.
- **Fit story** frames all 11 day regions. Click a numbered day in the fixed ruler to inspect that day.
- **Script ↓** focuses the selected gag's script references inside the same map.

The visit runs **left to right**. Ivory cards are already seen, yellow is Johnny now, and dashed cyan cards are already planned for this visit. The arrows show order, not elapsed time. The optional **Visit list** provides the same plan as a horizontal set of cards.

## What may happen next

At the end of the known visit, the teal **Next visit unknown** gate leads to possible source records. The next visit has not been chosen yet. Select the gate to open the catalog within that day region; click a gag to inspect it. The catalog groups every relevant record by its original script. Its small bars compare **source catalog selection weights**, not percentages or a forecast. Tide, flags, remaining visit budget, and recent history affect actual selection. Ending gags and idle poses remain visible in the catalog.

Clicking a day in the ruler shows its key scene and a compact **Possible on day** gate. Click that gate to open its catalog. These actions only change what you inspect. **Play day** in the day panel is the explicit action that saves the day and restarts playback from its key scene.

Hover or keyboard-focus a gag or scene for context and a small silent original-game preview when one is available. Some source actions have little visible motion or no preview.

## Inspect or play a script scene

Select a gag, then use **Script ↓** to focus its references within the same day region. The numbered scene cards run horizontally in the order their references first appear in the script. Cyan links jump forward; amber arcs loop back, and dotted amber arcs mark random picks. Hover or focus a scene to brighten its incoming and outgoing links. Pan along the rail to follow a long gag. These links show authored references, **not an exact trace of Johnny's live execution or elapsed time**. The inspector below explains guards and parallel actions. **Full script map** in the inspector gives another pan and zoom view of the gag graph.

Select a scene reference to change the inspector's preview. **Play this scene now** interrupts current playback, runs that scene through the original gag logic, then resumes the planned sequence. While exploring another day, the action is labeled **Play only this scene** and does not save or switch days. **Return to live** leaves inspection without changing playback.

**Read the original script steps** expands the extracted text outline. See [Johnny's 11-day story](story-over-time.md) for day progression, or [Scene flows](scene-flows/README.md) for generated script diagrams.
