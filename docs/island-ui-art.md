# Maintaining the illustrated Island UI

Start here when changing Johnny's **Beachcomber / Castaway CRT** interface. The live UI is `src/games/johnny/ui/enhanced.mjs`, despite that historical filename: the single Play flow uses it. Run `pnpm dev`, press Play at `/`, then use **Log**, **Picture**, **Options**, **Timeline** and **H**. This is the real engine, not the earlier frozen-frame mockup.

## Direction and origins

The chosen direction is a large, hand-painted tropical object: a resourceful castaway monitor above a beachcomber's object shelf. Sun-bleached driftwood, cream bamboo, faded aqua paint, coconut knobs, green ink contours, small orange highlights and sparse palm foliage. Lettering is chunky, irregular and generous, like an illustrated adventure box. Prefer a few substantial objects to many tiny decorative icons. Keep the game readable and its actual 4:3 picture unobstructed.

The primary visual inspiration was the original **Johnny Castaway 1992 retail box and splash screen**, supplied by the user; original creators and ownership are credited in [NOTICE](../NOTICE). User-supplied adventure/RPG interface screenshots inspired the inventory shelf, broad lettering and right-hand notebook, including Flight of the Amazon Queen. They were composition references, not asset sources. Do not copy their sprites, logos or screenshots into the production UI. The [issue #81 presentation study](https://github.com/khawkins98/johnny_web/issues/81) is the wider research context.

The earlier Google Antigravity (`agy`) pixel-art pass remains documented in [historical pixel-study notes](ui-early-pixel-study.md). Those unused SVGs were removed from the active source tree; the notes identify the original commit for recovery. The selected painted objects, title, labels, sand shelf and cabinet were generated with Codex's built-in `image_gen.imagegen` tool on 2026-10-24, then composed in HTML/CSS over an unchanged Johnny frame for local evaluation. After selection, those **original interface illustrations only** were promoted into the live app. No original-game screenshot or reference-game art is bundled in these assets.

## Find the right file

| Change | File |
| --- | --- |
| Buttons, accessible names, real story/session data, keyboard and cleanup | [`enhanced.mjs`](../src/games/johnny/ui/enhanced.mjs) |
| Splash cabinet, launch shelf, help note and title styling | [`splash.css`](../src/games/johnny/ui/splash.css), [`index.html`](../index.html) |
| Original title drawing and source bounds | [`browser-presentation.mjs`](../src/bottle/browser-presentation.mjs), `titleArtworkBounds()` |
| Shared palette, dialog typography, focus and sticky Settings header | [`island-theme.css`](../src/games/johnny/ui/island-theme.css) |
| Shared raster object sampling for splash and live shelf | [`island-objects.css`](../src/games/johnny/ui/island-objects.css) |
| Painted shelf, notebook, responsive layout | [`playback-deck.css`](../src/games/johnny/ui/playback-deck.css) |
| Raster cabinet source slices and shared aperture cutout | [`island-cabinet.css`](../src/games/johnny/ui/island-cabinet.css) |
| Cabinet aperture and viewport geometry | [`island-layout.mjs`](../src/games/johnny/ui/island-layout.mjs) |
| Image imports and measured lettering windows | [`island-art.mjs`](../src/games/johnny/ui/island-art.mjs) |
| Live root/canvas scaling into the aperture | [`settings.mjs`, `applyScaling()`](../src/games/johnny/ui/settings.mjs) |
| Actual picture effects, independent of the illustration | [`crt/`](../src/games/johnny/ui/crt/) and [CRT guide](../tools/presentation-lab/README.md) |
| Original painted PNGs and exact generator prompts | [`island-art/`](../src/games/johnny/ui/island-art/) |

The preview studies and user references were saved in ignored `scratchpad/issue81/art-direction/`, including a reference manifest. That directory is local research and may not exist in a fresh checkout. **Nothing needed to build or amend the active skin depends on it.** The active artwork, prompts and geometry are versioned here. Keep future proprietary captures/references in ignored scratchpad too.

## Asset inventory and prompts

All five active images are original transparent RGBA PNGs and use the project's MIT license. Keep original alpha and resolution when changing them. Exact generation wording is retained, rather than a shortened style summary:

- [`shelf-prompts.json`](../src/games/johnny/ui/island-art/shelf-prompts.json): objects, title, sand/wave shelf, and separate seven-word label sheet.
- [`cabinet-prompts.json`](../src/games/johnny/ui/island-art/cabinet-prompts.json): initial cabinet generation, style-reference identity, and follow-up transparency edit. The tool did not expose a model identifier; do not invent one.

| File | Role |
| --- | --- |
| `cabinet.png` | Final 1536×1024 driftwood/bamboo/coconut cabinet, front view, transparent exterior and viewing opening |
| `objects.png` | Seven illustrated objects in one source strip |
| `labels.png` | Pause, Sound, Speed, Picture, Options, Full view, Log lettering strip |
| `title.png` | Original “Johnny Web” wordmark, not a regenerated Johnny Castaway logo |
| `shelf.png` | Sand bank, foam edge, shell and palm ends; broad blank center |

The prompt JSON preserves the historical reference filenames. In a current checkout, the cabinet's `initialStyleReference` means **`objects.png` in this directory**. Its edit reference means the initial cabinet generation; `cabinet.png` is the final edited result and can itself be supplied as the next edit reference. The historical initial cabinet is not a runtime dependency.

## Compositing contract: do not guess the screen hole

The original cabinet asset is **1536×1024**. `island-cabinet.css` reuses it in two horizontal background slices: source x=0..1160 compresses to 1023 layout pixels, while the remaining 376px coconut-control cheek retains its proportions. The composed cabinet is **1399×1024**. This narrows the previously wide glass without stretching Johnny or making the knobs oval; the source PNG is unchanged. Both splash and live TV share this composition.

The actual picture opening in that **composed coordinate system** is **x=199, y=240, width=776, height=582**, exactly 4:3. `CABINET_ASPECT` and `CABINET_APERTURE` in `island-layout.mjs` own its geometry. `island-cabinet.css` uses an even-odd clip around the same rectangle to eliminate residual alpha over the image. The thin black inner matte fits the composed glass. Do not reuse the earlier prototype's 1536-wide x=264 aperture; those are historical study coordinates.

The matte is at z-index 0, live game root at 1, independent WebGL output at 2, cabinet at 3, pause overlay at 5, short on-screen feedback at 6, shelf/Log at 900/910 and dialogs at 2000. Decorative cabinet pieces are pointer-transparent. Real hardware buttons sit over the knobs, with accessible names and at least 40px targets (green pause button 44px). Do not put the live root inside the HUD: hiding that interface must leave Johnny visible.

The source remains native 640×480. `applyScaling()` fits it into the 4:3 opening. Native caps at 1× and fits down if necessary; Integer uses whole multiples when they fit and fits down below 1×; Freeform fills the aperture; Stretch fills that same physical 4:3 aperture while the cabinet is shown. Ordinary H / Toggle Island TV hide fits the live picture to the page in 0.5× steps, using the shared `halfStepScale()` helper (also used by the splash title). Restoring the cabinet restores its saved scale preference. Viewports smaller than 320×240 use a fitted scale below 0.5× to avoid clipping. **Full view/F** hides the cabinet/shelf and temporarily fits Johnny to the full page, preserving 4:3 and the saved scale preference. It does not request browser-window fullscreen. Escape, F, H or the visible restore button returns to the Island UI.

Log remains an overlay over the right control cheek (its left edge at 71% is beyond the picture's 69.69% right edge), so opening it never changes picture size. Hardware underneath the open Log is inert until it closes. Narrow/short Log uses one notebook scroll and a sticky Close; roomy desktop sections scroll internally. Temporary-clock feedback stays above the shelf and hides with the Island UI.

## Editing or regenerating artwork

1. Read the prompts and inspect the five actual images first. Retain pale aqua/cream/green/orange, irregular ink contours, hand-painted highlights and generous silhouettes. Avoid replacing the system with tiny pixel icons, generic vector symbols, pirate brass/dark furniture or photorealistic wood.
2. For a cabinet edit, supply the current cabinet plus `objects.png` as style references. Ask for front view, transparent exterior and **genuinely transparent screen**, no baked game scene, glass tint, reflection, scanlines or CRT blur. Keep the coconut control cheek on the right so the Log can cover it.
3. Save the exact prompt, tool/model if known, reference identities and date beside the assets. Inspect alpha, not just an image viewer's background. Retain a rollback copy in local scratchpad until verified. Do not bake a checkerboard into the PNG.
4. If the aperture changes, measure the new rectangle in source pixels and update **both** `CABINET_APERTURE`/`CABINET_ASPECT` and the shared `island-cabinet.css` slice/cutout geometry. Also re-register the three hardware buttons in `playback-deck.css`. Update the inner matte if its shape changes. Verify 4:3 numerically. Never repair a mismatched asset by distorting Johnny.
5. If the object/lettering sheets change, measure each object's x offset/width in `island-objects.css` and each word's window in `island-art.mjs`. The generated columns are not perfectly equal. The shared object windows serve both splash and playback at .2×; source y=180..530 preserves whole silhouettes without neighboring slivers. Words use .25× and their own top offset in CSS. Recheck all labels for clipping, especially Full view and Log.
6. Keep accessible names in DOM text/`aria-label`; artwork is decorative. Sound and playback rate use separate live text. Timeline is deliberately live text next to a painted notebook; it opens the real story browser. The green cabinet button and screen overlay use the real browser playback controller to pause/resume; do not substitute a frozen screenshot while the story continues.
7. Run the checks below, inspect actual desktop/mobile screenshots, then update these notes if the palette, source geometry, composition or generation method changed.

For a new provider, `agy` can generate editable SVG art through its CLI as in the earlier asset README. Do not assume SVG output will match a painted raster reference automatically. Prefer direct editing of a measured existing asset or a reference-guided raster edit when continuity matters. No generator credentials or CLI setup are required to build/run the checked-in PNG skin.

## Verification checklist

```sh
pnpm test src/games/johnny/ui/__tests__ --maxWorkers=1
pnpm run build
```

Use an isolated `agent-browser --session <task-name>` session, not the user's active browser. Test actual playback with locally supplied data at **1940×1200, 1440×1000, 1024×768 and 390×844**, plus a short desktop window. Capture open/closed Log, UI hidden/restored, Settings, Timeline and CRT on/off. Store proprietary screenshots under ignored scratchpad, not here.

Check: game remains 4:3; opening Log leaves the game rectangle identical; roomy Log never covers the picture; narrow controls wrap without clipping or horizontal overflow; H and the restore button retain Log state; Escape closes Log and returns focus; dialogs keep their keyboard behavior; day/gag/live requests still use the existing coordinator; CRT follows the game rectangle and never colors the cabinet; returning to title removes the skin/observers and restores normal layout.

Geometry regressions live in `island-layout.test.mjs` and `settings.test.mjs`; playback wiring, state and hide/restore tests live in `enhanced.test.mjs`. Unit checks complement screenshots: they cannot judge crop seams, lettering or alpha visually.

## Integration validation (2026-10-24)

The full serial suite passed with 869 tests and two skips. The UI suite passed again after the clock-notice/focus refinements (71 tests), and the production build passed. Isolated actual-game checks covered day 4 visits, exact gag preview/live return, independent CRT alignment, fixed game bounds across Log toggles, small-screen wrapping, H/restore and dialog entry. These captures remain local under `scratchpad/issue81/live-island-*.png`.

## Splash screen and half-step title zoom

The start screen uses the same original cabinet and shelf assets, with shell/monitor/ruler/notebook launch controls. `splash.css` is imported by Settings so it is present before playback begins; the live deck CSS mounts only after launching. No additional generated artwork was needed. Play retains saved individual preferences and creates audio in the user click handler. The About note is an anchored overlay and does not resize the title.

The original decoded title includes a wide black surround. `titleArtworkBounds()` finds all visible nonblack pixels and retains a two-pixel safety border. An ephemeral `start-title-picture` canvas receives that original source rectangle at **1:1**, with no intermediate resize. Its CSS size uses the largest **0.5× increment** that fits the cabinet opening: 0.5, 1.0, 1.5, 2.0 and so on, via `titleScale()`. Pixelated display avoids an additional smoothing pass. Original lettering and Sierra credits remain intact. The normal 640×480 canvas buffers and renderer are untouched; they are simply hidden while the separate title is visible. CRT output is hidden on the title and resumes its saved independent behavior after launch.

The splash cabinet allows enough opening for the minimum 0.5× title on narrow screens; transparent outer margins may extend beyond the viewport and are clipped by the fixed overlay. This minimum applies to the title only, not live-game scaling. Returning to title redraws the same source canvas and recomputes the half-step fit. Changing browser size recomputes zoom without persisting a different experience or scaling preference.

Verified at 1680×1000 (1.5×) and 390×844 (0.5×), with no horizontal overflow. Local captures: `scratchpad/issue81/splash-desktop.png` and `splash-mobile.png`. The UI suite includes half-step thresholds, including .585 → .5, and the minimum mobile aperture. Recheck launch with saved preferences, Settings/About, keyboard order and return-to-title when amending this layout.

## UX/UI coherence pass (2026-10-24)

An independent UX/UI subagent reviewed the actual splash, live shelf, Log, Settings/CRT and Timeline at desktop/mobile sizes, followed by implementation and a second review. The original cabinet and raster assets remain; no new generated art was needed.

- `island-theme.css` owns shared paper/ink colours, body/display type, control/focus treatment and Settings header. Its skin is present before launch and with the cabinet hidden, rather than depending on a playback-only body class. Use its `--island-*` variables for new surfaces.
- `island-objects.css` owns the authoritative crop windows for all painted object silhouettes. Both splash and playback use the same classes. Keep transparent gutters and complete lower edges; do not reintroduce guessed source-column widths in a second stylesheet.
- Timeline furniture, breadcrumbs, day/time choices, outlines and canvas card paper/text now follow the same palette and readable typography. Original game previews and fallback pixel illustrations retain their own image colours. The canvas-card palette/font lives in `story-card-faces.mjs`; changing it does not require invalidating the cached game frames because furniture is repainted separately.
- Mobile/short Log is one scroller with a sticky title; desktop retains its two roomy sections. Settings and Timeline keep their Close control/title while long content scrolls.
- Visible labels are associated with all core Settings selects. `dialog-background.mjs` isolates modal background controls and restores their previous inert state, including a previously hidden HUD. Opening the same modal twice must not overwrite that state; Settings and Timeline do not stack on one another, and the shared helper keeps Tab/Shift+Tab inside the active dialog.
- Primary Log actions use the darker shared action green for readable cream text, including hover. Day text uses the darker `--island-orange-ink` companion; bright orange remains the decorative highlight. Raster lettering remains decorative; all controls keep live accessible names/state. Timeline has a separate “Days & gags” state caption.

Validation after the coherence pass: 81 UI tests passed, production build passed, and actual Settings axe WCAG2A/AA audit reported zero violations. Raster/pseudo-element backgrounds and decorative title shadows still need manual contrast inspection; the automated audit is not a blanket accessibility certification. Mobile notebook reachability and sticky close controls were measured at 390×844. Screenshots remain ignored under `scratchpad/issue81/coherence-*.png`.

Second UX/UI review: **pass, no blockers**. Verified the complete Timeline label on mobile, sticky Timeline Close after scrolling, named Settings controls, modal background isolation, clean shared object crops, fixed desktop picture under the Log, and readable mobile statistics in one scroller. Portrait intentionally retains aqua breathing room; the mobile Log overlays the picture while open.

## Physical controls and pause (2026-10-24)

- **Upper coconut dial:** cycles Original (CRT off), Subtle, Balanced, Soft, VGA, CRT-Lottes, then locally saved Creative presets. `setupCrtSettings().cyclePreset()` updates the actual controls, persistence and compositor. Switching models preserves their existing tuning, clearing bypass so a selected model is visible. A brief screen label announces the chosen look.
- **Lower dial:** cycles 0.5×, 1×, 2×, 4× through the same API as the shelf speed control. The browser session owns the rate across ADS scenes, walking, poses and wipes.
- **Green button / Space:** pauses or resumes. A paper/ink Pause overlay is confined to the actual picture; its Resume button also works in Full view. Watching time excludes pauses.

`src/dgds/hosts/browser-playback.mjs` owns the browser session's pause/rate state and pause-aware interlude delay. The runtime scheduler continues consuming host timestamps while paused but sends no engine ticks, preventing catch-up bursts. Walk/pose/transition timers retain their remaining logical duration and respond to rate changes. AudioContext suspension/resumption retains sound position without changing the user's sound preference. The existing browser process facade exposes the controller to speed/debug controls; the interpreter is unchanged. Destroying the UI on return to title resets the session and removes its overlay/listener hooks.

Validation: full serial suite **886 passed, two skipped**. Added pause/delay/rate/abort/scheduler, physical control/preset and Full view regression checks. Actual browser frame hashes for both native canvases were identical across a pause; 390×844 hardware targets remain at least 40px, no horizontal overflow, and picture aspect measured 1.33333. Local captures: `tv-controls-paused-desktop.png`, `tv-controls-paused-mobile.png` under ignored scratchpad.

### Turning the painted dial faces

The two knobs now render as independent circular samples from the **unchanged** cabinet PNG, over their stationary painted bases. `jc-tv-picture-paint` uses a 224×224 source window centered on (1340,405); `jc-tv-speed-paint` uses 212×212 centered on (1350,630). CSS registers them to the recomposed cabinet, masks the samples to circles and rotates only these faces. This is runtime CSS composition, not a newly generated or edited bitmap. See `.jc-tv-knob-*` in `playback-deck.css`.

A successful preset selection advances the top face by 45°. Speed positions advance by 90° and follow actual session rate updates, including shelf/keyboard changes; wraparound takes one detent rather than unwinding a whole turn. CSS transitions are short and interruptible. `prefers-reduced-motion: reduce` changes the position immediately. Keep labels, focus rings, button hit areas, cabinet art and the screen stationary when changing this animation. The source PNG still serves the unanimated splash cabinet.

## Readouts and pointer feedback (2026-10-24)

Shelf status text uses 14px Georgia with cream-backed sound/speed readouts; avoid shrinking status text to fit the artwork. Redundant Timeline/Log captions are hidden, while accessible button names/state remain live. Pointer hover highlights the alpha silhouettes of the painted object and lettering with warm drop shadows, rather than a circular plaque. Cabinet dials have no pointer ring; retain keyboard focus outlines. The H control is labelled “Toggle Island TV”.

Pause is an in-picture VT323 on-screen display with a click/Space resume hint, without a paper dialog or a typographic pause symbol. Its placement follows the actual canvas, including Full view.

The temporary-time notice offers “Use saved clock” and “Save as current time”. Saving maps the selected band's representative phase (0/8/12) to the current local half-hour via `startTimeForPhase()` in `start-time.mjs`, persists the existing Start Time setting, selects the sequence clock, resumes live playback. The clock then advances normally; it does not freeze the band or save scene-specific night/high-tide requirements. Settings rereads these values when opened. Regression checks cover all 16 phases across midnight and half-hour boundaries, plus notice persistence and return to live playback.

The splash and live shelf share `.island-art-control` and `.island-control-label` in `island-objects.css`. Put these classes on new painted buttons and their lettering; the shared rule highlights both the object alpha and text for hover, keyboard focus and expanded state. Avoid introducing per-screen hover plaques or copying the filter into `splash.css`/`playback-deck.css`.

## One launch and progressive disclosure (2026-10-25)

The landing shelf has Play, Options and About. Defaults are stretch-to-fill scaling, Balanced CRT, drifting clouds, original waves and story clock, and sound on. Only missing preference keys are seeded; existing individual choices from the former Classic/Enhanced profiles are preserved. Play does not write a profile or overwrite pre-launch edits; the retired `jc-experience` marker is removed. Audio is still activated synchronously by the Play gesture.

Options starts with Picture look, Sound, Time of Day and Full view. Picture presets and the physical dial share the same application logic. Picture/clock fine tuning, advanced CRT, story tools, diagnostics and shortcuts are closed disclosures, with keyboard-accessible summaries. Renderer/save warnings remain beside Picture look even when advanced tuning is closed. The shelf Picture action focuses the preset chooser, rather than opening shader controls.

Log keeps the current gag, day/time visits and previous/next gag actions visible. Session statistics and specific-gag selection expand on demand. Timeline retains its day → time → gag → scene hierarchy. Preserve these layers when adding controls: everyday decisions first, details when requested.

Validation for consolidation: full serial suite **895 passed, two skipped**; targeted UI/CRT checks **93 passed**; production build passed. Actual-game browser checks covered new and saved preferences through launch/return-to-title, Picture/dial preset synchronization, expanded mobile fine tuning and CRT controls, specific-gag playback, keyboard focus wrapping, and desktop/mobile layouts. The collapsed Options axe WCAG2A/AA audit reported zero violations (heading text-shadow contrast requires manual review). Captures remain local under `scratchpad/issue81/consolidated-*.png`.

The original title canvas sits inside the native `start-picture-btn` button. Clicking/tapping the picture, or using Enter/Space while it has focus, invokes the same synchronous launch handler as Play. Keep that handler shared, including listener cleanup on return-to-title, so audio activation and preference behavior remain identical. The button receives the title's measured position; the canvas keeps its existing half-step size.

## Wordmark and retired artwork (2026-10-25)

`island-art/title.png` now reads **Johnny Web**, edited from the original Island Time illustration with the built-in image generator. Its exact edit prompt, reference commit and tool provenance are in `island-art/title-prompts.json`. Preserve the transparent orange/cream/palm-green lettering and update its accessible alt text with any future wording change. This changes the web interface wordmark, not the original Johnny Castaway splash/game artwork.

The unused `deck-icons/` SVG study was removed after checking for runtime references. [Historical provider and design notes](ui-early-pixel-study.md) retain credit and a recovery commit; do not restore obsolete assets into production just to preserve research history.

The splash shelf reuses `title.png` in `start-project-link`, a native anchor to the project-background article on AllAboutKen.com with `target="_blank"` and `rel="noopener noreferrer"`. It sits before Play/Options/About on desktop and spans a separate row on narrow screens. Keep this project link separate from the title-picture Play button so opening project information never starts playback. The shared artwork highlight applies to its wordmark too.

Default update: absent scale/CRT preferences now use Stretch and Balanced CRT. An explicitly saved CRT-off state remains off, and other saved picture/scale choices are unchanged. The README screenshot uses a fresh browser session with these defaults. That documentation screenshot is intentionally committed at the user's request; incidental research captures remain in ignored scratchpad.
