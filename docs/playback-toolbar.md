# Playback toolbar and Island Log

Press **Play** to show the painted Island TV cabinet and playback shelf. Play keeps your saved preferences. Open **Options** to change sound, picture or clock settings; open **Picture** to go directly to the picture presets. See [CRT setup and controls](optional-crt.md) for advanced tuning.

## Playback controls

| Control | Action |
| --- | --- |
| Sound | Toggle audio without changing playback. |
| Speed / lower coconut dial | Cycle 0.5×, 1×, 2× and 4× across gags, walks and transitions. |
| Green cabinet button / `Space` | Pause or resume playback and audio. |
| Upper coconut dial | Cycle picture looks, including saved Creative presets. |
| Timeline / `T` | Open the [story browser and scene previews](story-timeline-guide.md). |
| Options / `S` | Open settings. |
| Full view / `F` | Fill the page with the screensaver. |
| Hide TV / `H` | Hide or restore the cabinet and toolbar. |
| Hide shelf / `B` | Tuck the shelf below the page edge so the TV can use its height; the cabinet stays. |
| Log | Open day/gag navigation and session statistics. |
| `R` | Return to the title. |
| `←` / `→` | Step animation scenes. |
| `↑` / `↓` | Change playback speed. |

**Hide TV · H** sits beside **Hide shelf · B** in one pair of paper tabs on the shelf's top edge. With the TV hidden (H or Full view), a **Show TV · H** tab at the bottom centre of the page restores the controls by pointer or touch. Its **×** removes the tab for a bare picture; the choice is saved as `jc-tv-tab` (`shown`/`hidden`). `H` and `Esc` still bring the TV back, moving the mouse still fades in the corner Options button, and **Options → With the TV hidden** brings the tab back. Hidden controls are inert. `H` also works when a toolbar button has focus; text/select controls keep their own keyboard behavior. `Esc` closes Log and returns focus to its toggle (or to the tucked shelf's handle, so the shelf is not pulled back out), with modal dialogs taking precedence. In Full view, `Esc`, `F` or `H` restores the cabinet and previous Log state.

## Hiding the shelf for a bigger TV

**Hide shelf** (the paper tab on the shelf's top edge) or `B` tucks the shelf most of the way below the page, leaving the tops of its controls in view so they are not forgotten, and the cabinet re-fits into the reclaimed height. It sits between the normal layout and Full view: the TV, dials and Log stay. Pointing at the tucked shelf, moving keyboard focus onto any shelf control, or tapping it raises the shelf to its usual place as an overlay; it tucks away shortly after the pointer or focus leaves, on a tap elsewhere, or with `Esc`. Raising it never resizes the picture. While it is raised the tab reads **Keep shelf · B**: press it or `B` to keep the shelf in place. The choice is saved as `jc-shelf` (`shown`/`receded`) and survives reloads and returning to the title. `H` and Full view work from either state and come back to it with the shelf still tucked away; a shelf saved as tucked starts that way on Play, without sliding. The temporary-clock notice sits above the tucked shelf and under a raised one. Width-limited windows such as a portrait phone gain no picture size; the cabinet only re-centres.

## Island Log

**Log** opens a nonmodal sidebar on the right. Story position and the current gag/visit-position meter appear first. Unique gag counts, days visited and visible playback time expand under Session statistics. Statistics last for this playback session and reset when returning to the title. A visit is one planned batch; a gag preview is labeled separately. Visited gags count unique catalogue selections, including previews; idle POSE/STAND fillers do not count. These are not completion achievements or a claim that every animation in a gag was watched.

The lower section browses story day, time-of-day band and eligible gags. **Visit this day** starts a visit anchored by that day’s key scene; arrows visit adjacent days. **Choose a specific gag** reveals the gag selector and **Play gag** action. The visible previous/next gag buttons play adjacent entries in that day/band’s eligible list. **Return to live story** leaves preview/browsing and resumes the normal controller. Browsing choices remain stable as the live story updates. Hardware under an open Log is inert. Requirements such as forced night/high tide remain owned by the existing story controller.

## Picture size and small screens

The cabinet fits the viewport above the shelf. Log overlays its right-hand coconut control cheek on roomy windows; opening/closing it does not resize the game. On small/short windows it becomes a floating notebook with one continuous scroll and sticky title; roomy desktop sections scroll internally. The shelf wraps on mobile. Native caps at 1× and fits down when necessary; Integer uses whole multiples when they fit and fits down below 1×; Freeform and Stretch fill the cabinet's 4:3 opening. Turning off Island TV fits Johnny to the page in 0.5× steps; restoring it restores the saved cabinet scaling preference. The independent CRT compositor follows the real game rectangle; interface art stays outside the effect.

## Implementation and maintenance

The [art maintenance guide](island-ui-art.md) records the cabinet and shelf artwork, generation prompts, source slices and geometry. The original Johnny box/splash and user-supplied adventure interfaces informed the direction; their artwork is not bundled. The previous AGY pixel icons remain a historical study.

Implementation: [enhanced.mjs](../src/games/johnny/ui/enhanced.mjs) retains its existing setup hook name for compatibility; [playback-deck.css](../src/games/johnny/ui/playback-deck.css) provides the chrome. Bottle passes the existing settings, timeline and debug-run coordinator into the hook for playback. Navigation requests use that coordinator’s atomic runtime/walk/audio handoff; this UI does not create another playback loop. Settings owns the cabinet aperture scaling and the normal CRT presentation boundary.

The UI’s rAF reads runtime speed and updates visible values at most four times per second. Gag/day state comes from the existing subscription, with cleanup on return to title. Visible playback time excludes hidden-tab intervals. No session stats are written to an account or browser storage.

## Recorded validation

Validation and captures are recorded on issue #81, merged PR #86 and the v1.4.0 release. Synthetic/unit checks cover log visibility/inert cleanup, coordinator requests, selection stability, unique counts and modal/keyboard behavior. Actual Johnny browser checks exercise day jumps, exact gag previews, live return, sound/speed, desktop geometry, mobile overflow, and VGA output alignment when the log opens/closes. Incidental game captures remain ignored locally; the user-selected README screenshot is intentionally committed with original-art credit.

The launch flow and disclosure hierarchy are described in [the art/UI maintenance guide](island-ui-art.md#one-launch-and-progressive-disclosure-2026-10-25). Play retains individual preferences; picture presets are available before advanced tuning, and Log statistics/specific-gag selection expand on demand.
