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

The browser now models this as a Johnny-owned story controller. Its 63-entry catalogue covers `ACTIVITY`, `BUILDING`, `FISHING`, `JOHNNY`, `MARY`, `MISCGAG`, `STAND`, `SUZY`, `VISITOR`, and `WALKSTUF`. For each sequence it selects the eligible final scene, plans 6–19 compatible ordinary scenes unless the final has `FIRST`, and sends one immutable directive at a time to the generic browser host. A directive contains the ADS file/tag, shared island state, optional walk endpoints, and the end-of-sequence wipe. DGDS does not select the next event.

The controller persists the 11-day story counter when the local calendar day changes. It also derives low/high tide, island position, raft stage, clouds, day/night, and holiday suppression from the final scene's executable-level flags. This restores the Johnny/Mary/Suzy story-day gates without embedding them in ADS interpretation.

Walking is likewise host functionality. The scene catalogue supplies start/end spots and headings, and the browser joins them through the island bookmark graph. Sprite/frame/coordinate rows are decoded at runtime from offset `0x188ea` in the user's original `SCRANTIC.SCR`; `JOHNWALK.BMP` remains a normally decoded resource. No extracted walking table is checked in. The public clean-room path finder notes that its choice among possible routes is an approximation of the lost executable algorithm, so the browser deliberately uses a deterministic shortest route while preserving the recovered frame sequences and headings.

Newly reachable animations can still reveal interpreter or composition defects that were hidden when only the first activity tag ran. Those defects belong in DGDS conformance fixes; event eligibility and walking remain in the Johnny host controller/renderer.

The developer menu intentionally lists every ADS file and tag independently. It is a diagnostic tool for isolating those two classes of problem and does not model story sequencing.

## Island state, tides, and transitions

The island background is composed from `BACKGRND.BMP` under host control. High tide has three wave regions; low tide adds exposed sand and rock sprites plus four differently positioned wave regions. The original host advanced one region every eight ticks through the recovered three-frame groups, rather than advancing all waves together. **Animated Waves → Rolling (Original)** is therefore part of Classic mode; Static is an optional presentation override. Clouds are placed randomly but remain static in Classic mode, with drifting retained as an enhancement.

Raft frame and coordinates follow the persistent story day and tide. Island and all foreground TTM operations receive the same host offset, including saved regions and clips, so variable-position sequences move as a unit.

ADS opcode `F010` is only a segment marker for Johnny. At the end of the planned final scene, the executable rotated through five black wipes: expanding circle, expanding centered rectangle, right-to-left bars, left-to-right bars, and a center-out horizontal split. The generic DGDS alpha-fade behavior remains available to other hosts, but Johnny now draws those five transitions once per complete sequence.

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
| Select Johnny scenes, story state, walking, tides, and wipes | `src/games/johnny/` |
| Manually select any ADS/tag for diagnosis | developer UI |

## Historical references

- The archived game data in `public/data/` is the primary evidence for resource contents and ADS/TTM behavior; it remains user-supplied and uncommitted.
- `pnpm run dump` regenerates disposable decoded evidence under ignored `dumps/`. The repository intentionally carries no decoded holiday images, resource inventories, or one-off extraction scripts.
- Walking data is re-read directly from `SCRANTIC.SCR` on demand. Re-extraction is safer and more reproducible than retaining diagnostic artifacts, and ensures the implementation is exercised against the user's supplied version.
- [Johnny Reborn's scene catalogue](https://github.com/jno6809/jc_reborn/blob/master/story_data.h) documents the executable-level scene metadata recovered by its clean-room implementation.
- [Johnny Reborn's story scheduler](https://github.com/jno6809/jc_reborn/blob/master/story.c) documents final-scene selection, intermediate scene counts, story-day state, and island configuration.
- [Johnny Reborn's island renderer](https://github.com/jno6809/jc_reborn/blob/master/island.c) documents the holiday ranges, sprite indices, and placement coordinates used for cross-checking.
- [Johnny Reborn's walking implementation](https://github.com/jno6809/jc_reborn/blob/master/walk.c) and [walking metadata](https://github.com/jno6809/jc_reborn/blob/master/walk_data.h) document the executable-owned frame table and bookmarks.
- [Johnny Reborn's transition renderer](https://github.com/jno6809/jc_reborn/blob/master/graphics.c) documents the rotating five-wipe sequence.
