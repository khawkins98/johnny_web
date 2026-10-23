# Changelog

This changelog tracks the browser project. **v1** is the project as it stood before the scene flow explorer PR; **v1.1** is the work introduced in that PR; **v1.2** brings rendering, timing and story-clock fixes checked against the original. These labels are separate from the original Johnny Castaway game data version.

## v1.2 — Closer to the original

- Added a **Start Time** setting, the original's half-hour clock setting (default 09:00, −30/+30 and Reset). Night falls 6 hours after it, for 2 hours, every 8 hours, and it changes which gags can appear; a change applies from the next visit. The story timeline's "what time of day?" step now shows each band's local clock times from it, and **Restart story** no longer clears it. The setting is stored under a new key; the first-run date older versions saved under the old one was being read as a time and shifting night, so it is discarded and previously saved start dates reset to 09:00 (#53).
- The island's waves now move the way the original's do. Each visit starts on the frames the original bakes into its background, the three wave patches take turns stepping one frame, and the fourth low-tide patch moves with the first. A step comes one or two ~55 ms timer ticks after the last, about every 86–90 ms as in captures of the original, instead of every 160 ms (#53).
- Fixed animation frames with a `SET_DELAY` of 7 lasting about 147 ms instead of the original's ~120 ms, which made those threads (the sailing ship in `BUILDING.ADS` #2, Johnny in `WALKSTUF.ADS` #1, the big fire in `BUILDING.ADS` #8) fall behind the threads they play alongside. Frame holds are now deadlines on the original's 16 ms game clock, read once per ~55 ms present, as in the binary (#53).
- Renamed the story timeline's middle step from "which tide?" to "what time of day?". Its three bands (early day, late day, night) are the original's story clock, which also sets the night sky; high or low tide is a separate coin flip, so the old tide names were misleading (#53).
- Night, tide and still waves now follow the original. The night sky comes from the game's 16-phase half-hour clock (its last four phases, counted from the original's 9:00 start time), not from the local hour; the **Live Local Clock** setting keeps the local-hour night as an option. High or low tide is a coin flip per visit unless a scene pins high tide, instead of following that clock. The sandcastle and ship-building visits (`BUILDING.ADS` #2/#4/#6, `MARY.ADS` #1, `VISITOR.ADS` #3) hold the waves still, as the original does (#53).
- Fixed baked background areas disappearing in the boat-building gag (`BUILDING.ADS` #2): a new `STORE_AREA` now adds to the background plate instead of wiping it, so the anchored ship and the sandcastle stay until the gag ends (#53).
- Fixed the anchored ship in the Gulliver gags (`BUILDING.ADS` #4 and #6) staying behind, or showing twice, after the ship sails away. The world raster is now restored to the background plate before each tick's scripts run, and the GET/PUT pair those scenes use (`0xa054`/`0xa064`) is implemented (#53).
- Fixed the island and Johnny's scripted animations being drawn 1 px left of the original. The island now sits at the original's base (x 289, or 17 for the second layout), and walks and the palm-trunk overlap line up with it as in the original (#53).
- The island is now placed where the original would put it for each planned chapter: pinned to 289/299 or 17/309 when a scene in the chapter asks for a fixed layout (for example the fishing finales and `VISITOR.ADS` #1), otherwise drawn from the original's high- or low-tide band, narrowed to the quadrant some finales request. Before, fixed layouts were never used, and the random spot could sit up to 49 px higher than the original ever draws it. As in the original, a gag whose island layout clashes with the one already set for the visit is skipped, and the "VISITOR 3" gag (`VISITOR.ADS` #1), which could never play before, now turns up as an ordinary gag in about two visits in five (#53).

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
