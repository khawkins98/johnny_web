# johnny_web

A web-native reimplementation of the Johnny Castaway screensaver originally created by Dynamix (Sierra On-Line). This project is a hard fork of [xesf/castaway](https://github.com/xesf/castaway), modernized with a focus on idiomatic, standards-based web development.

![alt text](castaway.png "Dynamix Johnny Castaway Screen Saver")

## Purpose

* Reimplementation of the Johnny Castaway screensaver in the browser;

* Modernize the codebase toward web-native patterns (ES modules, Web APIs, no bundler dependencies where possible);

* Learn and document the Dynamix Game Development System (DGDS) file formats;

* Provide dump tools via Node.js for resource extraction;

* Have fun doing it!!

## Enhancements Roadmap

List of new features to add to Johnny Castaway experience:
* Day/Night loop in 24h instead of 8h
* Day/Night based on user location sunrise and sunset
* Moving cloulds
* Add waves like the static screen
* Accelarate time
* Tides based on user locations with real time coutry low tide info
* Play Full Story Sequence
    * Choose single activities to play
* Number of full complete stories played worldwide
* Total hours worldwide played
* Statistics per Activity
    * Total Jogging
    * Fishing
    * etc.
* Extend festive days from the original - could be based on user location

## Documents

[Resource Index File Format](docs/resindex.md)

## Usage

> **Note:** The game data files (`RESOURCE.MAP`, `RESOURCE.001`, `SCRANTIC.SCR`) are
> proprietary and not included in this repository. You need a legitimate copy of
> the original Johnny Castaway screensaver. See [NOTICE](NOTICE) for details.

### Setup

```bash
npm install
```

Place your original game files in `public/data/`:

```
public/
  data/
    RESOURCE.MAP
    RESOURCE.001
    SCRANTIC.SCR
```

### Development

```bash
npm run dev       # start Vite dev server at http://localhost:5173
```

### Production build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the dist/ build locally
```

### Dump Resources

Extracts game assets (images, audio, scripts) into a `dumps/` folder at the project root.

```bash
npm run dump
```

## GitHub Pages

Pushes to `main` automatically deploy to GitHub Pages via the workflow in
`.github/workflows/deploy.yml`. Enable Pages in your repo settings
(**Settings → Pages → Source: GitHub Actions**).

If your repo lives at a path other than `/johnny_web/`, update `VITE_BASE_PATH`
in the workflow file.

## Spetial Thanks

* Jérémie Guillaume (jno6809) for sharing his findings while developing Johnn Reborn (https://github.com/jno6809/jc_reborn)

* Hans Milling (nivs1978) for publishing his C# attempt to remake Johnny Castaway (https://github.com/nivs1978/Johnny-Castaway-Open-Source)

* Vasco Costa (vcosta) for his efforst in the DGDS ScummVM engine (https://github.com/vcosta/scummvm/tree/master/engines/dgds)

See [NOTICE](NOTICE) for full IP and attribution details.

## DGDS Viewer

I've create a DGDS Resource Viewer while I was building the initial version of castaway. I've then split it into its own project and it can be found here: https://github.com/xesf/dgds-viewer
