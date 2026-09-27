# Changelog

This changelog tracks the browser project. **v1** is the project as it stood before the scene flow explorer PR; **v1.1** is the work introduced in that PR. These labels are separate from the original Johnny Castaway game data version.

## v1.1 — Scene flow explorer

- Added an interactive, pixel styled scene map that follows the current gag and shows the route before a selected scene and its possible next scenes.
- Added a stacked story timeline matrix that keeps story days, the current visit's planned route, a selected gag's steps, and its local choices in view together. Live playback and inspected possibilities have separate markers; other day-eligible gags sit in an expandable pool.
- Kept the live or inspected gag centered when the panel opens, playback changes, or the window resizes; added visit strip navigation and clearer day jump labels.
- Opened gag details on an animated script scene when available, and surfaced example gags for a possible later visit next to the current visit.
- Made the story-day row interactive: selecting a day saves that story position and starts a visit containing its key scene.
- Added hover and focus tooltips for the Settings and timeline icons, showing their `S` and `T` shortcuts; `T` opens or closes the timeline.
- Added a script overview with pan and zoom for exploring a gag's full scripted graph, including random choices.
- Added silent, in-panel previews of individual scene animations using the original game resources, including sprite setup and character poses from earlier route segments.
- Added a control to jump into a selected scene, continue its scripted gag, then return to the planned screensaver sequence.
- Added story day, current sequence, and planned gag context alongside the map, with links to the original script steps and flow documentation.
- Improved scene labels and hover ordering so labels stay readable over nearby nodes.

## v1 — Browser screensaver baseline

- Runs Johnny Castaway in the browser with the Bottle DGDS JavaScript engine and user-imported original game data.
- Provides Classic and Enhanced playback, display settings, keyboard controls, and saved progress through the 11-day story.
- Includes developer playback controls, scene flow documentation, reverse engineering notes, and faithfulness comparison tools.
