# Screensaver mode

Add `?saver` to the app's address and it opens as a screensaver: no title screen, no Island TV, only the picture on black.

```
https://<where the app is served>/?saver
```

**Options → Screensaver link** gives the link for the copy you are using. Drag it to the bookmarks bar, or to the desktop, where it becomes a file you double-click.

## What it does

| | |
| --- | --- |
| Start | Skips the title screen and enters Full view. |
| Screen | Asks the browser to keep the display awake, so the system's own screensaver or display sleep does not cut in. Browsers without the Screen Wake Lock API, or that refuse it, still play. |
| Pointer | Hidden after three seconds without moving, along with the Show TV tab and corner buttons. Moving it brings them back, and Tab still reaches the Show TV tab. The pointer stays while Options or the Timeline is open. |
| Game data | Uses the data already imported at that address. With none, the usual "add the game files" card appears; after the import the page reloads into the saver. |
| Leaving | **Esc**, **F**, **H** or the **Show TV** tab returns to the ordinary app and takes `?saver` off the address; so does **R** (Return to title). Moving the mouse does not leave: a page cannot close itself, so it would only bring the interface back at every bump. The other keys keep working without leaving: **Space** pauses, **S** opens Options, **T** the Timeline. |

`?saver=off`, `?saver=0` and `?saver=false` are treated as an ordinary visit. A scene link can be combined with it: `?saver#stage=FISHING.ADS:3`.

## Two things the browser decides

**Fullscreen.** A page may only go fullscreen in answer to a click or key press, so a bookmark opens a tab filled with the picture, with the browser's own bars still around it. Use the browser's fullscreen command (macOS: Control-Command-F) or a launcher, below.

**Sound.** A page may only start audio after a click or key press. The title screen's Play button is that click on an ordinary visit. A saver link has none, so playback starts silent, and sound joins at the first click or key press if **Options → Sound** is on. Browsers do not count Esc as that key press: after leaving with Esc, sound joins at the next one.

## Launchers

A launcher opens the link in a window with no browser bars. Imported game data belongs to one browser and one address, so import it once in the browser the launcher uses, at the address it opens.

macOS, Chrome (fullscreen, no bars, sound allowed from the start):

```bash
open -na "Google Chrome" --args --kiosk --app="https://<address>/?saver" \
    --autoplay-policy=no-user-gesture-required
```

Linux, Chromium:

```bash
chromium --kiosk --app="https://<address>/?saver" --autoplay-policy=no-user-gesture-required
```

Quit a kiosk window with the browser's quit shortcut (Command-Q, or Alt-F4).

Saved as `Johnny.command` (macOS, `chmod +x`) or a `.desktop` entry (Linux), either line is a double-click launcher. To start it when the machine goes idle, hand the same line to whatever already watches for idleness: `xidlehook`, `swayidle` or `xautolock` on Linux. This project does not ship an idle watcher.

Safari has no kiosk flag. **File → Add to Dock** on the saver link makes a standalone window, but Safari gives that window its own storage, so the game data has to be imported there too.

## Why not a native macOS screen saver

Issue #45 proposed a `.saver` bundle hosting the app in a `WKWebView`. Research in November 2026 found the host too unreliable to build on:

- Third-party savers run only in Apple's `legacyScreenSaver` host. The newer extension API Apple's own savers use is not public.
- Since macOS 14 developers report the host no longer sends `stopAnimation`, creates duplicate saver instances, and leaves processes running after the saver is dismissed ([Apple forums](https://developer.apple.com/forums/thread/787444), [ScreenSaverMinimal](https://github.com/AerialScreensaver/ScreenSaverMinimal), [Wade Tregaskis](https://wadetregaskis.com/how-to-make-a-macos-screen-saver/)).
- A report against macOS 26.4 says `WKWebView` content in a legacy saver goes blank after about three seconds (FB22353950, [forum listing](https://developer.apple.com/forums/tags/screensaver)).
- On macOS 27 one developer reports static frames and wrong timing and moved to a standalone app ([System 47](https://github.com/mikelawson68/System47-Releases/issues/3)); another reports the saver's sandbox container can no longer be written by an installer, which is where game data would have had to go.
- A saver receives no input, so importing game data would need a second, native import path.

These are other developers' reports; none was reproduced for this project. The alternatives weighed:

| Approach | Outcome |
| --- | --- |
| `.saver` with `WKWebView` | Rejected: the reports above. |
| `.saver` running the engine in JavaScriptCore with a native raster | Rejected: avoids the web view but keeps the host's lifecycle faults, and needs audio, presentation and import written again. |
| Full native port of the engine | Rejected: a second copy of script behaviour to keep faithful. |
| Standalone app with its own idle timer and a normal `WKWebView` | Workable, not built. It would load this same `?saver` page. |
| **Saver mode in the web app** | Built. No second host, and it works on any desktop OS. |

Saver mode does not appear in System Settings → Screen Saver and does not draw over the lock screen. A Linux saver is the likelier next step: XScreenSaver and its relatives run an ordinary program when the machine goes idle, which the Chromium line above already is.
