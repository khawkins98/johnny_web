# Screensaver mode

A link ending in `?saver` opens Johnny as a screensaver: no title screen and no Island TV, only the picture on black.

It runs in a browser tab or window. It is not listed in the system's screen saver settings, does not start when the machine goes idle, and does not cover the lock screen. The [native macOS screen saver assessment](native-macos-screensaver-assessment.md) records why.

## Start it

1. Open the app as usual and import the game data if you have not already. The saver uses the data imported in that browser, at that address.
2. Open **Options** and find **Screensaver link**.
3. Drag the link to the bookmarks bar or to the desktop. On the desktop it becomes a file you double-click.
4. Open the link. Johnny starts playing in a tab filled with the picture.

You can also type the flag yourself:

```
https://<address>/?saver
```

Without game data the "Ready to cast away?" card asks for the files as usual. After the import the page reloads into the saver.

## Fill the screen

The browser's bars stay around the picture, because a page may only go fullscreen in answer to a click or key press. Use the browser's own fullscreen command (Control-Command-F on macOS, F11 elsewhere) or a [launcher](#open-it-from-a-launcher).

## Sound

Playback starts silent. Browsers only let a page start audio after a click or key press, and a saver link has no Play button to supply one. With **Options → Sound** on, sound joins at your first click or key press.

Esc does not count as that key press. If you leave with Esc, sound joins at the next click or key.

## Leave

**Esc**, **F**, **H**, **R** (Return to title) or the **Show TV** tab returns to the ordinary app. Each also takes `?saver` off the address, so a reload opens the app normally.

Moving the mouse does not leave. **Space** (pause), **S** (Options) and **T** (Timeline) work without leaving.

## While it runs

| | |
| --- | --- |
| Display | The page asks the browser to keep the display awake, so the system's screen saver and display sleep do not cut in. A browser without the Screen Wake Lock API, or one that refuses the request, still plays. |
| Pointer | After three seconds without moving, the pointer, the Show TV tab and the corner buttons are hidden. Moving the pointer brings them back, and Tab still reaches the Show TV tab. The pointer stays visible while Options or the Timeline is open. |

## Address options

| Address | Result |
| --- | --- |
| `?saver`, `?saver=1` | Screensaver mode. |
| `?saver=off`, `?saver=0`, `?saver=false` | An ordinary visit. |
| `?saver#stage=FISHING.ADS:3` | Screensaver mode, starting with that scene. Any [scene link](story-timeline-guide.md#share-or-bookmark-what-is-playing) can be combined this way. |

## Open it from a launcher

A launcher opens the link in a fullscreen window with no browser bars. These command lines use Chromium's `--kiosk`, `--app` and `--autoplay-policy` switches. This project has not run them; treat them as a starting point.

Import the game data first, in the browser the launcher uses and at the address it opens.

macOS, Chrome:

```bash
open -na "Google Chrome" --args --kiosk --app="https://<address>/?saver" \
    --autoplay-policy=no-user-gesture-required
```

Linux, Chromium:

```bash
chromium --kiosk --app="https://<address>/?saver" --autoplay-policy=no-user-gesture-required
```

`--autoplay-policy=no-user-gesture-required` lets sound play from the start. Quit a kiosk window with the browser's quit shortcut: Command-Q on macOS, Alt-F4 on Linux.

To make a double-click launcher, save the line as `Johnny.command` and run `chmod +x` on it (macOS), or put it in a `.desktop` entry (Linux).

To start it when the machine goes idle, give the same line to a program that already watches for idleness, such as `xidlehook`, `swayidle` or `xautolock` on Linux. This project does not ship an idle watcher.

Safari has no kiosk switch. **File → Add to Dock** on the saver link makes a standalone window, but Safari gives that window its own storage, so import the game data there too.
