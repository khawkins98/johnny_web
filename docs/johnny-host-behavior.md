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

The browser models this as a Johnny-owned story controller. Its 79-record catalogue (the binary's table, including the 14 ADS-less poses) covers `ACTIVITY`, `BUILDING`, `FISHING`, `JOHNNY`, `MARY`, `MISCGAG`, `STAND`, `SUZY`, `VISITOR`, and `WALKSTUF`. For each visit it plans a batch the way the executable's `FUN_1018_08b9` does (`docs/scrantic-re-findings.md` B.6.3), and sends one immutable directive at a time to the generic browser host. A directive contains the ADS file/tag, shared island state, optional walk endpoints, and the end-of-sequence wipe. DGDS does not select the next event.

Planning a batch, in the executable's order:

1. **Key scene gate.** One draw in ten opens the gate; it resets the unlocked day to the current day and weighs the records locked to that day, ignoring their clock windows (so a night-only key scene such as `JOHNNY.ADS` #6 can play by day). The pick is skipped when it was the previous batch's ending or key scene. A key scene with the ending bit becomes the batch's ending; `JOHNNY.ADS` #2 and #3 become a pending intermediate instead. Day-locked records are reachable by no other path.
2. **Ending.** A weight roulette over the common endings (`flagsB & 4`, day 0, clock window open), in catalogue order. It is re-drawn while it equals the previous batch's ending, and while it is a solo ending (`flagsB & 1`, such as `ACTIVITY.ADS` #11) with a key scene pending. Only the previous ending is excluded; the one two back can come round again.
3. **First slot.** Unless the ending plays alone, the opening record is the pending key scene on a 50% coin, else a separate roulette over the first-slot class (`flagsB & 1`: the ordinary gags plus `ACTIVITY.ADS` #8 and #11).
4. **Intermediates.** While the 300-unit walk-span budget is not exactly spent (the ending, the key scene and the first slot are paid first) and fewer than 298 records are queued: a pending key scene goes in on a 5% coin, else a roulette over the intermediate class (`flagsB & 2`) of records whose half width fits the remaining budget and whose island layout word does not clash with the batch's; idle poses repeat 1 to 6 times. A key scene never inserted is dropped.

`PickClass` in `story-controller.mjs` names the class bits, `isStoryEligible` answers whether a record can be reached on a day at a phase by any path, and the story timeline uses that same answer.

The controller persists the 11-day story counter when the local calendar day changes. It also derives island position, raft stage, clouds, still waves, and holiday suppression from the planned scenes' executable-level flags, the tide from a per-visit coin flip, and day/night from the 16-phase clock. This restores the Johnny/Mary/Suzy story-day gates without embedding them in ADS interpretation.

The 16-phase clock (`FUN_1018_0540`) is time of day at half-hour resolution, counted from the original's **Start Time** setting (default 9:00; the Settings **Start Time** control stores an HHMM override as `jc-start-time-hhmm`, read when each batch is planned), so it wraps every eight hours. It gates which scenes are eligible through each record's tide window and, at the bake, picks the sky: phases 12–15 draw `NIGHT.SCR`, the rest one of three day oceans. With the default start time that is 15:00–17:00, 23:00–01:00 and 07:00–09:00, not the wall-clock night; the **Time of Day → Live Local Clock** setting is the enhancement that draws night from the local hour instead. The rendered tide is independent of the clock: unless a planned scene carries `flagsB 0x200` (high tide), the bake flips a coin (`rand & 1`), so a low-tide-window gag can play on a high-tide beach and vice versa. A scene with `flagsB 0x800` (MARY #1) forces the night sky.

The island presentation is initialized once for that complete sequence and persists while individual ADS runtimes and walking interludes come and go, matching the executable's `adsInitIsland()` lifecycle. Its selected ocean, static cloud layout, wave phase, tide, raft, and holiday layer therefore do not reset or briefly disappear between events. The browser pre-presents that host layer before the first ADS tick and redraws it behind every procedural walking frame.

Walking is likewise host functionality. The scene catalogue supplies start and end spots and headings. Johnny walks between them by the original's precomputed route table (file offsets `0x18894` and `0x180de`, `WALK_ROUTES`/`WALK_SEGMENTS` in `walking.mjs`; see `docs/scrantic-re-findings.md` B.6.4): at each spot a weighted roll picks the next segment until he reaches the destination. Sprite, frame and coordinate rows are decoded at runtime from offset `0x188ea` in the user's own `SCRANTIC.SCR`; `JOHNWALK.BMP` is an ordinary resource. The small route and segment tables are in the source; the frame table is not.

A defect that shows up only in a particular gag usually belongs in the DGDS runtime; gag choice and walking stay in the Johnny host.

Some ADS scenes start a child TTM with a negative run count. This is an authored lifetime in 16 ms game-clock ticks, not a sprite-frame delay: for example, `VISITOR.ADS` starts the `MJCOCO.TTM` tree shake with `-180`, while that child alternates its own two frames every eight ticks. The same rule also repeats finite TTM bodies, such as the staged campfire sprites, until their cutoff; treating their first `END` as completion makes the fire stages and Johnny poses overlap incorrectly. The runtime applies the lifetime and frame clocks independently and hands control back to ADS only when the lifetime expires.

The campfire also exercises ADS's remove-before-add branch semantics. Its very-large-fire TTM completes one cycle, is moved behind the actors, and is stopped and re-added in the same logical branch. The original ADS host repeatedly evaluates the active segment and re-arms that zero-run-count sequence; Bottle marks this specific branch-rearmed replacement to restart until the authored `STOP_SCENE` after the hands-warmed action. Merely retaining its second completed frame is insufficient because later actor GET/PUT restores correctly retire completed overlapping layers, making the fire disappear throughout the boot routine.

### Developer panel runs

The developer panel (`D`) has a **Debug Run** section for starting a chosen gag and a **Now playing — host event** card for the live state. With **Follow host event** on (the default), its **Script** and **Scene** selectors mirror the live gag; changing a selector stops following so you can set up a different run. **Playback mode** chooses what **Start Debug Run** does:

- **Selected scene only** plays the selected gag once with compatible island and story state, and leaves the planned visit untouched.
- **Complete chapter sequence** replaces the planned visit with a new one built around that gag. An ordinary gag becomes the first gag; an ending gag becomes the visit's ending. Walks, tide, island position, raft and the final wipe follow as in normal play.

A **Run plan** card states the resulting order before playback starts. **Simulated day for this run** sets the story day for the run's eligibility only; it is hidden when the gag fixes its own day. Island position, tide, ocean, clouds and night are chosen per visit as in normal play.

Starting a run interrupts the host at once: it cancels the current walk, runtime, sound and wipe, clears foreground drawing, and then plays the newest request. Walks and wipes belong to the Johnny host, so stopping only ADS could let an old walk appear after the new run starts.

The status card shows the active and next gag, the effective day, the remaining gags, the tide and the planned ending. It names the visit's gag, not the TTM animation inside it, so it can differ from the Enhanced-mode status note (for example `COCONUT 360`) without either being wrong.

Tests run every non-pose catalogue entry at both randomness boundaries and check that every visit terminates with compatible tide and position flags. `planner-picker.test.mjs` pins each planner rule, and `planner-replay.test.mjs` replays the first batch of every normal-play capture of the original at the boot offset and requires identical queues (local only: it needs the game data and the maintainer's captures).

## Island state, tides, and transitions

The island background is composed from `BACKGRND.BMP` under host control. High tide has three wave regions; low tide adds exposed sand and rock sprites and a fourth wave region that moves with the first. Each visit starts the waves on the frames the original's bake leaves (counters 0, 2, 2). After that one region steps at a time, in turn, when a countdown of four 16 ms game-clock ticks runs out; it is checked once per ~55 ms present, so a step comes one or two presents after the last (about every 86–90 ms). **Animated Waves → Rolling (Original)** is therefore part of Classic mode; Static is an optional override. Either way, a visit that contains a scene with `flagsB 0x1000` (the sandcastle and ship-building gags BUILDING #2/#4/#6, MARY #1 and VISITOR #3) keeps the waves still on the bake's frames (`titleState.waves === false`), as the original clears its wave timer for that visit.

Clouds are laid out once per visit by the original's bake rules (`clouds.mjs`, from `FUN_1010_0a38`): 15 slots, small clouds more likely than big ones, all in the top 139 rows and facing one wind direction. They stay still for the whole visit, by day and at night, as in the original. The **Drifting** cloud option moves them.

Raft frame and coordinates follow the persistent story day and tide. Island and all foreground TTM operations receive the same host offset, including saved regions and clips, so variable-position sequences move as a unit.

The island's world origin is chosen once per planned chapter, the way the executable's bake does it (`FUN_1010_1c41` folds every planned record's layout word `+0xd` into `30c0`, ending first; `FUN_1010_1b00` resolves it). A record with `0x10` pins island layer 0 to 289/299 (the fishing finales #3 and #6, the WOULDBEAS finale, ACTIVITY #9, and the visiting ship VISITOR #1, which is an ordinary intermediate), and `0x20` pins it to 17/309 (FISHING #4); the last such record in the chapter wins. Otherwise the origin is random inside a band that depends on the tide: high tide x 67–292, y 255–383; low tide x 168–278, y 255–313. Bits 1/2/4/8 of the word restrict that band to the top-left, top-right, bottom-left or bottom-right quarter (the MARY finales and BUILDING #2/#4/#6 take the bottom-right; MARY #5 the top row; FISHING #5 the left column; ACTIVITY #11 the right column). `flagsB 0x200` on any planned record forces high tide for the chapter (`30c2 = 0`). `titleState.x/y` carry the origin minus 289/279, so the manifest's layer offsets stay relative to layer 0.

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

## References

- The archived game data in `public/data/` is the primary evidence for resource contents and ADS/TTM behavior; it remains user-supplied and uncommitted.
- `pnpm run dump` regenerates disposable decoded evidence under ignored `dumps/`. The repository intentionally carries no decoded holiday images, resource inventories, or one-off extraction scripts.
- Walking data is re-read directly from `SCRANTIC.SCR` on demand. Re-extraction is safer and more reproducible than retaining diagnostic artifacts, and ensures the implementation is exercised against the user's supplied version.
- [Johnny Reborn's scene catalogue](https://github.com/jno6809/jc_reborn/blob/master/story_data.h) and [story scheduler](https://github.com/jno6809/jc_reborn/blob/master/story.c) were the port's starting point for scene metadata and selection. The port now uses the binary's 79-record catalogue and planner instead; `docs/scrantic-re-findings.md` Part B lists where they differ.
- [Johnny Reborn's island renderer](https://github.com/jno6809/jc_reborn/blob/master/island.c) documents the holiday ranges, sprite indices, and placement coordinates used for cross-checking.
- [Johnny Reborn's walking implementation](https://github.com/jno6809/jc_reborn/blob/master/walk.c) and [walking metadata](https://github.com/jno6809/jc_reborn/blob/master/walk_data.h) document the executable-owned frame table and bookmarks.
- [Johnny Reborn's path finder](https://github.com/jno6809/jc_reborn/blob/master/calcpath.c) was an early cross-check that the host picked one of several routes at random. The port now follows the original's own route table instead (`docs/scrantic-re-findings.md` B.6.4).
- [Johnny Reborn's transition renderer](https://github.com/jno6809/jc_reborn/blob/master/graphics.c) documents the rotating five-wipe sequence.
- [Johnny Reborn's event clock](https://github.com/jno6809/jc_reborn/blob/master/events.c) documents a 20 ms timer unit. The port still steps in 20 ms ticks, but authored delays are now counted on the original's 16 ms game clock ([methodology, "Frame holds"](../tools/faithfulness-oracle/METHODOLOGY.md#frame-holds)).
