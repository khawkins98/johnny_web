# Johnny Web documentation

Start with the [project setup](../README.md#run-locally) to run Johnny, or [Contributing](../CONTRIBUTING.md) to change it. Original game data is proprietary and supplied locally; browser imports do not populate the checkout's `public/data/` directory.

## Play and explore

| Task | Guide |
| --- | --- |
| Pause, change speed, hide the cabinet or use Island Log | [Playback controls](playback-toolbar.md) |
| Browse a day/time, preview a gag or return to the live clock | [Story timeline](story-timeline-guide.md) |
| Understand saved progress and the 11-day story | [Story progression](story-over-time.md) |
| Choose picture models, save presets or troubleshoot CRT fallback | [CRT picture](optional-crt.md) |
| Open Johnny as a screensaver from a bookmark, desktop link or launcher | [Screensaver mode](screensaver-mode.md) |

## Develop and investigate

| Task | Start here |
| --- | --- |
| Find module ownership and follow execution/rendering | [Architecture](architecture.md) |
| Capture a bug report, inspect resources or use developer runs | [Debugging playback](diagnostics.md) |
| Change the illustrated UI, prompts or cabinet geometry | [Island UI maintenance](island-ui-art.md) |
| Understand scene selection, walks, tides and holidays | [Johnny host behavior](johnny-host-behavior.md) |
| Look up archive fields or possible gag paths | [RESOURCE.MAP reference](resindex.md), [generated scene flows](scene-flows/README.md) |
| Choose a comparison with the original program | [Faithfulness tools](../tools/faithfulness-oracle/README.md) |
| Read recorded coverage and its limits | [Generated coverage report](oracle-coverage.md), [accepted differences](accepted-deviations.md) |
| Experiment with synthetic sizing and shader comparisons | [Presentation lab](../tools/presentation-lab/README.md) |

## Research, evidence and release records

These records retain the conditions and limitations of their original investigations. For current behavior, use the guides above.

- [Executable findings](scrantic-re-findings.md) preserve addresses, provenance and corrections; their opening table identifies superseded sections. [Fire handoff timing](building-handoff-timing.md) records successive measurements, newest first.
- [Native macOS screen saver assessment](native-macos-screensaver-assessment.md) records why issue #45 led to screensaver mode in the web app, and the developer reports it relied on.
- [Initial scaling assessment](enhanced-scaling-assessment.md) and [retired pixel artwork study](ui-early-pixel-study.md) describe earlier proposals and assets. Current illustrated UI and CRT instructions live in their maintenance guides.
- [Oracle methodology](../tools/faithfulness-oracle/METHODOLOGY.md) explains capture reproduction and [private maintainer evidence](../tools/faithfulness-oracle/METHODOLOGY.md#maintainer-assets). Generated reports and scene flows identify their generators; do not hand-edit their results.
- [Changelog](../CHANGELOG.md), [v1.4.0 notes](releases/v1.4.0-notes.md) and [v1.4.0 release record](releases/v1.4.0-plan.md) preserve release scope and checks performed at the time.
