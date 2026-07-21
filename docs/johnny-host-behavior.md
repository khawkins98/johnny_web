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

The island presentation is initialized once for that complete sequence and persists while individual ADS runtimes and walking interludes come and go, matching the executable's `adsInitIsland()` lifecycle. Its selected ocean, static cloud layout, wave phase, tide, raft, and holiday layer therefore do not reset or briefly disappear between events. The browser pre-presents that host layer before the first ADS tick and redraws it behind every procedural walking frame.

Walking is likewise host functionality. The scene catalogue supplies start/end spots and headings, and the browser joins them through the island bookmark graph. Sprite/frame/coordinate rows are decoded at runtime from offset `0x188ea` in the user's original `SCRANTIC.SCR`; `JOHNWALK.BMP` remains a normally decoded resource. No extracted walking table is checked in. The public clean-room path finder notes that its choice among possible routes is an approximation of the lost executable algorithm, so the browser deliberately uses a deterministic shortest route while preserving the recovered frame sequences and headings.

Newly reachable animations can still reveal interpreter or composition defects that were hidden when only the first activity tag ran. Those defects belong in DGDS conformance fixes; event eligibility and walking remain in the Johnny host controller/renderer.

The developer menu lists every ADS file and tag independently but now exposes two deliberately different actions:

- **Preview Once** builds the selected tag with compatible island/story state, plays it once, and leaves the controller's existing queue untouched.
- **Run Sequence From Here** discards the existing queue and asks the Johnny controller for a new compatible sequence anchored on that tag. An ordinary event becomes the first event; a final event becomes the planned finale. Walking, tide, island position, raft, holiday suppression, and the final wipe continue through the resulting sequence.

The **Story Chapter** selector supplies one day of eligibility for unrestricted events; it is the original 11-day narrative counter, not an island-position control. It gates the Johnny/Mary/Suzy story events and advances the raft stage. A faithful sequence does not traverse several chapters because the original advanced this counter only when the system calendar changed. A story-gated event automatically locks the selector to its historical chapter. Island position, tide, ocean, clouds, and day/night are separate sequence presentation choices. The target picker is explicitly separate from current playback, and its contextual note explains whether the selected event starts the sequence, ends it after compatible lead-ins, or is a start-immediately one-event finale. The status card separately shows queued/playing state, active and next events, effective chapter, remaining events, tide, and planned final. Automated tests anchor all 63 catalogue entries at both randomness boundaries and verify that every sequence terminates and retains compatible tide/position flags.

## Island state, tides, and transitions

The island background is composed from `BACKGRND.BMP` under host control. High tide has three wave regions; low tide adds exposed sand and rock sprites plus four differently positioned wave regions. The recovered host timer uses 20 ms ticks and advances one wave region every eight ticks through the three-frame groups, rather than advancing all waves together. Walking delays (6 ticks and the final 80-tick pause), ADS delays, waves, and wipes now share that same 50 Hz clock. **Animated Waves → Rolling (Original)** is therefore part of Classic mode; Static is an optional presentation override. Clouds use the recovered weighted 0–5 count, a shared wind/flip direction, and size-specific placement bounds; they remain static in Classic mode, with drifting retained as an enhancement.

Raft frame and coordinates follow the persistent story day and tide. Island and all foreground TTM operations receive the same host offset, including saved regions and clips, so variable-position sequences move as a unit.

The persistent island always uses the host's primary island layout. A child TTM may load `ISLAND2.SCR` and change its own `backgroundId`, but that resource-local value must not reposition the host layer. Keeping the host layout id in `titleState` prevents left-island fishing scenes from receiving the child layout shift a second time. The developer **Night Mode** checkbox similarly updates both DGDS's selected ocean and Johnny's host-owned day/night state for the current sequence.

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

Holiday selection defaults to **Calendar**, following the browser-visible local date as the original screensaver followed the Windows system clock. To preview a theme without changing the clock, press `D`, use **Holiday Theme** in the developer panel, and choose Calendar, None, St Patrick's Day, Halloween, Christmas, or New Year. The choice persists locally until changed and applies to both one-scene previews and controller-planned debug sequences, except for scenes carrying the original holiday-suppression flag.

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
- [Johnny Reborn's event clock](https://github.com/jno6809/jc_reborn/blob/master/events.c) documents the recovered 20 ms timer unit used to interpret authored delays.
