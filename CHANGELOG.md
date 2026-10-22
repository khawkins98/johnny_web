# Changelog

This changelog tracks the browser project. **v1** is the project as it stood before the scene flow explorer PR; **v1.1** is the work introduced in that PR. These labels are separate from the original Johnny Castaway game data version.

## v1.1 — Story timeline

- Added a story timeline (compass icon or `T`) that asks one question at a time: which day, which tide, which gag. A breadcrumb shows the path, and **↖ Johnny now** returns to the live gag.
- Each of the 11 days shows its key scene. Three tide bands (early high, late high, low) cover every gag's tide window exactly, with a count of the gags each allows and the tide now marked. **▶ Play day** saves that story day and starts a visit from its key scene.
- Gags appear as cards with real frames, rendered in the browser from the imported game data and kept there, so each is made once. Pixel icons for each family of gags show until a frame is ready. On today's day and tide, a strip shows the visit the game has planned.
- A gag's view lists its steps in order, with random picks marked. Selecting a scene highlights the steps that lead to it and shows a silent preview from the original game. **▶ Play this gag** and **▶ Play this scene now** start playback from there, then the story carries on.
- Short transitions between steps: cards are dealt in, and the picked card flies into the gag view. They are skipped when the system asks for reduced motion.
- Added hover and focus tooltips for the Settings and timeline icons, showing their `S` and `T` shortcuts.
- Fixed WOULDBEAS (`WALKSTUF.ADS` #1) playing over a black screen. Gags that load no screen of their own now play over the host's island, as in the original (#49).

## v1 — Browser screensaver baseline

- Runs Johnny Castaway in the browser with the Bottle DGDS JavaScript engine and user-imported original game data.
- Provides Classic and Enhanced playback, display settings, keyboard controls, and saved progress through the 11-day story.
- Includes developer playback controls, scene flow documentation, reverse engineering notes, and faithfulness comparison tools.
