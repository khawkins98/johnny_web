# Explore the story timeline

The timeline places Johnny's **11 story days, the current visit, possible gags, and scripted scene references** in one map. Days are background regions that move left to right. They are not choices in a day-to-day branching graph. You need to [import the original game data](../README.md#run-locally) before the timeline can show scenes or animation previews.

## Open and move around

Start Classic or Enhanced playback, then click the compass near the upper-left corner or press `T`. Move the pointer to reveal the compass. Press `T` or `Esc`, or click **×**, to close the panel. The compass and Settings icons show their shortcuts on hover and keyboard focus.

The map opens near the live gag. Drag empty space to pan across days or down through a day's possibilities; use the mouse wheel or **+**/**−** to zoom continuously around the pointer. Arrow keys pan and `+`/`−` zoom when the map has keyboard focus. **Follow live** recenters Johnny's current visit. **Fit story** shows all day regions at once. **Day →** opens the next day for inspection, leaving playback alone. On touch screens, drag the map with a finger and use the zoom buttons.

Yellow marks the actual live day and gag. A white outline marks what you are inspecting. Solid links in **This visit** connect gags already seen; dashed links connect gags already planned for the rest of this visit. That route is ordered, not timed. **Next visit unknown** marks where the known plan ends. The optional **Visit list** gives the same planned route as readable cards.

Each day also contains its key scene and the full catalog of common gag records that may be selected on that day. These are possibilities, not a forecast or an executable sequence. Short cyan strokes beside their nodes vary in width with **source catalog selection weight**. They are not percentages: tide, flags, remaining visit budget, and recent history affect the actual choice. Some records are endings or idle poses. Hover or keyboard-focus a node for its role, label, conditions, and a small silent preview from the original game data when available.

## Inspect a day or gag

Select a day label to inspect its key scene and catalog options. Johnny keeps playing the current visit. The day panel offers **Inspect key scene** and **Play day**. **Play day** saves that story day and restarts the visit from its key scene; the map does not do this on selection alone.

Select a gag in the map to inspect it. **Script ↓** centers all its extracted script references in the same map; the detailed inspector below describes the guards, parallel actions, and random picks. Curved script links show return references; dotted orange links mark random branches. The arrangement helps navigate the source script and is **not an exact trace of Johnny's live execution**. **Full script map** in the inspector offers another pan and zoom view of the gag graph.

Select a scene reference to change the inspector's silent preview. Some actions have little visible motion or no preview. **Play this scene now** interrupts current playback, runs the selected scene through the original gag logic, then resumes the planned sequence. While exploring another day, the same action is labeled **Play only this scene**; it does not save or switch days. **Return to live** leaves day exploration without changing playback.

**After this visit / Day options** below the map supplies a compact list of example gags. **Read the original script steps** expands the extracted text outline. See [Johnny's 11-day story](story-over-time.md) for day progression, or [Scene flows](scene-flows/README.md) for generated script diagrams.
