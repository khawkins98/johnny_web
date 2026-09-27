# Explore the story timeline

The timeline shows Johnny's **11 story days, the current visit, possible future gags, and a selected gag's script references** in one pan and zoom map. The day keys form a continuous backbone. The current visit branches below its day key, while later days branch only to unchosen possibilities. The fixed 01–11 ruler follows story order, not elapsed time. You need to [import the original game data](../README.md#run-locally) before scenes and animation previews can appear.

## Open and navigate

Start Classic or Enhanced playback, then click the compass near the upper-left corner or press `T`. Press `T` or `Esc`, or click **×**, to close the panel. The compass and Settings icons show their shortcuts on hover and keyboard focus.

The map opens around Johnny's live gag and fills the available browser width. Drag empty space to pan; wheel or use **+**/**−** to zoom around the pointer. With keyboard focus on the map, arrow keys pan and `+`/`−` zoom. On touch screens, drag with a finger and use the zoom buttons.

- **Follow live** returns the camera to Johnny's current gag.
- **Next visit ?** moves to the end of the visit already planned by the game. When inspecting another day, this shortcut becomes **Day options →** and moves to that day's possibilities gate.
- **Fit story** frames all 11 day regions. Click a numbered day in the fixed ruler to inspect that day.
- **Script ↓** focuses the selected gag's script references inside the same map.

The visit forks from the current day's key scene and runs **left to right**. Ivory cards are already seen, yellow is Johnny now, and dashed cyan cards are already planned for this visit. Its line ends at an unresolved gate; it does not join a later day until the game chooses what happens. The arrows show order, not elapsed time. The optional **Visit list** provides the same plan as a horizontal set of cards.

## What may happen next

At the end of the known visit, the teal **Next visit unknown** gate leads to possible source records. Three forks beside it show examples from different source scripts; they are **not predictions**. Click an example to inspect it, or select the gate to open the full catalog branch to its right. The catalog groups every relevant record by its original script. Its small bars compare **source catalog selection weights**, not percentages or a forecast. Tide, flags, remaining visit budget, and recent history affect actual selection. Ending gags and idle poses remain visible in the catalog.

Clicking a day in the ruler shows its key scene and a compact **Possible on day** gate. Click that gate to open its catalog. These actions only change what you inspect. **Play day** in the day panel is the explicit action that saves the day and restarts playback from its key scene.

Hover or keyboard-focus a gag or scene for context and a small silent original-game preview when one is available. Some source actions have little visible motion or no preview.

## Inspect or play a script scene

Select a gag, then use **Script ↓** to focus its references within the same day region. Numbered scene cards move left to right in the order their references first appear in the script. A long forward chain forms a **reference spine**; other chains fork onto colored lanes and can rejoin it. Solid rails make one route through each branch legible, while faint links retain additional authored references. Yellow traces the route to the inspected scene; amber loops show backward references and dashed amber links mark random picks. Hover or focus a scene to brighten its incoming and outgoing links. Pan to follow a long gag. Lane placement organizes the script; it is **not an exact trace of Johnny's live execution, elapsed time, or the odds of a choice**. The inspector below explains guards, stops, and parallel actions. **Full script map** gives another pan and zoom view of the gag graph.

Select a scene card to change the inspector's preview and choices. Each non-start scene card also has a **▶** control that starts that scene in one click; the inspector's **Play this scene now** button does the same. This interrupts current playback, runs the scene through the original gag logic, then resumes the planned sequence. While exploring another day, starting a scene only previews it and does not save or switch days. **Return to live** leaves inspection without changing playback.

**Read the original script steps** expands the extracted text outline. See [Johnny's 11-day story](story-over-time.md) for day progression, or [Scene flows](scene-flows/README.md) for generated script diagrams.
