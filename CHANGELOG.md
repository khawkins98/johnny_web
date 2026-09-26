# Changelog

This changelog tracks the browser project. **v1** is the project as it stood before the scene flow explorer PR; **v1.1** is the work introduced in that PR. These labels are separate from the original Johnny Castaway game data version.

## v1.1 — Scene flow explorer

- Added an interactive, pixel styled scene map that follows the current gag and shows the route before a selected scene and its possible next scenes.
- Added an all routes view with pan and zoom for exploring the full scripted graph, including random choices.
- Added silent, in-panel previews of individual scene animations using the original game resources.
- Added a control to play a selected scene immediately, then return to the planned screensaver sequence.
- Added story day, current sequence, and planned gag context alongside the map, with links to the original script steps and flow documentation.
- Improved scene labels and hover ordering so labels stay readable over nearby nodes.

## v1 — Browser screensaver baseline

- Runs Johnny Castaway in the browser with the Bottle DGDS JavaScript engine and user-imported original game data.
- Provides Classic and Enhanced playback, display settings, keyboard controls, and saved progress through the 11-day story.
- Includes developer playback controls, scene flow documentation, reverse engineering notes, and faithfulness comparison tools.
