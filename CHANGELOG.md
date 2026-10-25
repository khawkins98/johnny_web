# Changelog

This changelog tracks the browser project. Its version numbers are separate from the version of the original Johnny Castaway game data. A number such as (#53) is a GitHub issue or pull request.

## Unreleased — Island TV (planned v1.4.0)

- Added an illustrated driftwood/bamboo TV, coconut controls and a painted playback shelf. The picture dial selects CRT presets, the speed dial changes playback rate, and the green button pauses/resumes the screensaver. The Johnny Web wordmark links to the project background (#86).
- Replaced Classic/Enhanced launch choices with one **Play** button. Clicking the original splash picture also starts playback. Options puts picture looks, sound and clock first, with fine tuning, story tools, diagnostics and shortcuts revealed on demand. Existing individual preferences are retained (#86).
- Added Creative CRT, experimental VGA beam and Libretro CRT-Lottes picture models, with independently remembered tuning and named Creative presets. New preferences default to **Balanced CRT** and **Stretch to fill**; **Original picture** turns CRT off. The game keeps its native buffers, and unavailable WebGL falls back to the normal picture (#85, #86).
- Added the Island Log with day/gag navigation, current story position and expandable session statistics. Temporary time previews can be saved as the current advancing story clock, without saving scene-specific sky/tide requirements. Timeline playback respects the selected story day and time band (#83, #86).
- **Toggle Island TV / H** hides/restores the cabinet and shelf; the unobstructed picture fits in 0.5× steps. **Full view / F** fills the page with the screensaver without changing browser fullscreen. **Space** pauses engine animation, walking, poses, transitions and audio together (#86).
- Added a presentation/shader research lab, source credits, original interface-art prompts, and maintenance guidance for future contributors. Retired the unused early pixel-icon study while preserving its provenance in the docs (#84–#86).

Release planning and outstanding checks: [v1.4.0 plan](docs/releases/v1.4.0-plan.md). This section describes pending work and is not a published release.

## v1.3 — Normal play, checked

- Fixed black patches in the daytime ocean. The three day ocean screens draw their dark cloud reflections in palette colour 0, which we treated as transparent on full screens as well as on sprites. Screens are now drawn opaque, so the reflections show in their magenta colour as in the original; sprites still treat colour 0 as transparent (#53).
- Clouds are now laid out the way the original does it. Each visit draws from 15 cloud slots, about one in eleven filled, with small clouds three times as likely as big ones (at most 8 small, 4 medium, 2 big). They sit in the top 139 rows, all face the same wind, and stay put for the whole visit, by day and at night. Before, every size was equally likely and the count followed a made-up rule. Mirrored clouds now land one pixel further right, as the original draws them. **Moving Clouds: Static (Original)** was already right that the original's clouds don't move (#53).
- Gags are now picked for each visit the way the original does it, checked against captures of the original's own visits. The castaway-painting gag `ACTIVITY.ADS` #11, which could never play before, now ends a visit on its own or opens one, in about one visit in twenty-five. A visit's first gag is drawn separately from the rest, so gags such as `ACTIVITY.ADS` #8 open visits a little more often. Each day's key scene (the Johnny, Mary and Suzy story scenes) comes up in about one visit in ten on its day instead of nearly half of them, and it can now come at any time of day, not just at night. An ending still never repeats the previous visit's, but the one from two visits back can return. The story timeline lists the day's key scene under every time of day and says when each gag can appear (#68).

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
