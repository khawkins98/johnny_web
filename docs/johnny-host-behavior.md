# Johnny Castaway host behavior

Johnny Castaway is not completely described by its DGDS resources. The original Windows screensaver executable supplied title-specific policy around the reusable animation engine. Keeping that distinction explicit prevents Johnny behavior from leaking into Bottle DGDS and prevents host omissions from being misdiagnosed as missing bytecode.

## Scene selection and sequencing

An ADS resource describes how to execute a selected tagged scene. Random ADS opcodes choose among TTM actions *inside* that scene; they do not choose another ADS file.

The original host maintained a separate scene catalogue containing the ADS filename and tag plus sequencing metadata. At a high level it:

1. selected an eligible final scene, including story-day gates;
2. unless that final scene had to start immediately, selected several compatible ordinary scenes;
3. generated walking transitions between the previous scene's ending position and the next scene's starting position;
4. configured island position, tide, raft progress, day/night state, and exceptions for the selected sequence;
5. ran the final scene and reset the island presentation.

This explains why `ACTIVITY.ADS`, `BUILDING.ADS`, `FISHING.ADS`, and `MISCGAG.ADS` were present and individually playable even though the old web host never reached most of them: it always started the first tag in `ACTIVITY.ADS`, while the missing choice belonged above DGDS.

The current browser host now exposes that missing boundary and naturally rotates through the 29 decoded ambient tags in those four ADS files. This is deliberately an incremental compatibility step, not a claim of exact original scheduling. It does not yet reproduce:

- final/ordinary scene grouping;
- the original 6–19-scene sequence length;
- procedural walking between island positions;
- story-day persistence and the Johnny/Mary/Suzy arcs;
- per-scene tide, island-position, raft, or holiday-suppression flags;
- day/night eligibility for duplicated scene variants.

Consequently, adjacent scenes can currently feel abrupt or historically out of order. Newly reachable animations can also reveal interpreter or composition defects that were hidden when only the first activity tag ran. Those rendering defects belong in DGDS conformance fixes; ordering and walking belong in the Johnny host scheduler.

The developer menu intentionally lists every ADS file and tag independently. It is a diagnostic tool for isolating those two classes of problem and does not model story sequencing.

## Holiday overlays

Holiday decorations follow the same host-versus-engine split. `HOLIDAY.BMP` contains four indexed sprites, but no ADS resource checks the calendar or draws them. The original host selected the sprite from local calendar dates and placed it over the island background using palette index zero—the pink colour key—as transparency.

The browser implementation therefore:

- reads local time in Johnny-owned UI policy;
- resolves and decodes `HOLIDAY.BMP` through the normal resource provider;
- preserves the indexed sprite's decoded alpha rather than shipping converted PNG assets;
- stamps it after every background redraw, shifted with the island layout;
- leaves the generic DGDS runtime unaware of holidays and wall time.

The reproduced date ranges are March 15–17, October 29–31, December 23–25, and December 29–January 1.

Holiday selection defaults to **Calendar**, following the browser-visible local date as the original screensaver followed the Windows system clock. To preview a theme without changing the clock, press `D`, use **Holiday Theme** in the developer panel, and choose Calendar, None, St Patrick's Day, Halloween, Christmas, or New Year. The choice persists locally until changed.

## Architectural ownership

| Responsibility | Owner |
| --- | --- |
| Decode ADS, TTM, BMP, and SCR resources | `src/dgds/` |
| Execute one selected ADS tag deterministically | `src/dgds/scripting/` |
| Schedule browser frames and present backgrounds | `src/bottle/` |
| Select Johnny scenes and interpret Johnny's calendar | `src/games/johnny/` |
| Manually select any ADS/tag for diagnosis | developer UI |

## Historical references

- The archived game data in `public/data/` is the primary evidence for resource contents and ADS/TTM behavior; it remains user-supplied and uncommitted.
- `pnpm run dump` regenerates disposable decoded evidence under ignored `dumps/`. The repository intentionally carries no decoded holiday images, resource inventories, or one-off extraction scripts.
- [Johnny Reborn's scene catalogue](https://github.com/jno6809/jc_reborn/blob/master/story_data.h) documents the executable-level scene metadata recovered by its clean-room implementation.
- [Johnny Reborn's story scheduler](https://github.com/jno6809/jc_reborn/blob/master/story.c) documents final-scene selection, intermediate scene counts, story-day state, and island configuration.
- [Johnny Reborn's island renderer](https://github.com/jno6809/jc_reborn/blob/master/island.c) documents the holiday ranges, sprite indices, and placement coordinates used for cross-checking.
