# Native macOS screen saver assessment

Assessment for [issue #45](https://github.com/khawkins98/johnny_web/issues/45), 2026-11-13. It records what was known on that date. For how to run Johnny as a screensaver now, see [Screensaver mode](screensaver-mode.md).

## Outcome

No native macOS screen saver was built. The web app gained a screensaver mode instead, opened from a link ending in `?saver`.

Screensaver mode is not listed in System Settings → Screen Saver, does not start when the Mac goes idle, and does not draw over the lock screen. Issue #45 stays open for a host that does.

## What issue #45 proposed

A `.saver` bundle that hosts the built web app in a `WKWebView`, with two fallbacks: running the JavaScript engine against a native raster, or porting the engine.

## Findings

Every finding below is another developer's report. None was reproduced for this project, and no `.saver` spike was built.

- Third-party savers run only in Apple's `legacyScreenSaver` host. The extension API that Apple's own savers use is not public.
- Since macOS 14, developers report that the host no longer sends `stopAnimation`, creates duplicate saver instances, and leaves processes running after the saver is dismissed. Sources: [Apple forums thread on macOS 26](https://developer.apple.com/forums/thread/787444), the [ScreenSaverMinimal template](https://github.com/AerialScreensaver/ScreenSaverMinimal), and [Wade Tregaskis's guide](https://wadetregaskis.com/how-to-make-a-macos-screen-saver/).
- A report against macOS 26.4 says `WKWebView` content in a legacy saver goes blank after about three seconds. It was filed as FB22353950 and appears in the [Apple forums screen saver listing](https://developer.apple.com/forums/tags/screensaver). No fix had been reported.
- On macOS 27, the [System 47 developer](https://github.com/mikelawson68/System47-Releases/issues/3) reports static frames and wrong timing, and moved from a `.saver` to a standalone background app.
- A report against macOS 27.0 beta 4, in the same forum listing, says an installer can no longer write to the saver host's sandbox container. That container is where a saver would have kept imported game data.
- A saver receives no input. Importing game data would need a second, native import path beside the browser's.

## Alternatives weighed

| Approach | Outcome |
| --- | --- |
| `.saver` with `WKWebView` | Rejected, on the reports above. |
| `.saver` running the engine in JavaScriptCore with a native raster | Rejected. It avoids the web view but keeps the host's lifecycle faults, and audio, presentation and import would have to be written again. |
| Full native port of the engine | Rejected. It would be a second copy of script behaviour to keep faithful. |
| Standalone app with its own idle timer and a normal `WKWebView` | Workable, not built. It would load the same `?saver` page. |
| Screensaver mode in the web app | Built. It needs no second host and runs on any desktop OS. |

## Possible next steps

- **Linux saver.** XScreenSaver and similar tools run an ordinary program when the machine goes idle. The Chromium launcher line in [Screensaver mode](screensaver-mode.md#open-it-from-a-launcher) is such a program, though this project has not run it.
- **Standalone macOS app.** It would start on idle, which screensaver mode cannot, but would still not appear in System Settings or over the lock screen.
- **Native `.saver`.** Worth revisiting if Apple publishes the extension API or the host faults are fixed.
