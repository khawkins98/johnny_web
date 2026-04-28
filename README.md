# johnny_web

A web-native reimplementation of the [Johnny Castaway](https://en.wikipedia.org/wiki/Johnny_Castaway) screensaver originally created by Dynamix (Sierra On-Line) in 1992. This project is a hard fork of [xesf/castaway](https://github.com/xesf/castaway), modernized with a focus on idiomatic, standards-based web development.

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

## Obtaining the Game Data Files

The screensaver requires three proprietary files that are not included in this
repository. These files originate from the original 1992/1993 Windows 3.1 floppy
distribution by Sierra On-Line. See [Wikipedia](https://en.wikipedia.org/wiki/Johnny_Castaway) for history.

**Legal note:** Johnny Castaway is technically still under copyright (see
[NOTICE](NOTICE)). It has never been officially released as freeware.
However, it has been commercially unavailable for 30+ years, is widely
considered abandonware, and no enforcement action has ever been publicly
reported. Obtaining and using it for personal, non-commercial purposes is your
own legal call.

### Known sources

| Source | What you get | Notes |
|--------|-------------|-------|
| [Internet Archive](https://archive.org/details/screen-antics-johnny-castaway-16-color-v1.01-int.-1.4.93-win3.1-1.44m) | Win3.1 floppy `.ima` inside a ZIP | Use `npm run extract` below |
| [My Abandonware](https://www.myabandonware.com/search/q/johnny+castaway) | Likely a pre-extracted installer ZIP | Requires JavaScript in browser |

### Extracting from the Internet Archive floppy image

The `extract` script handles everything: it unpacks the ZIP, mounts the floppy
image, and decompresses the TSComp archives used by the original installer.

**Prerequisites** (one-time setup):

```bash
# macOS
brew install mtools

# Linux (Debian/Ubuntu)
apt install mtools unzip
```

**Run the extractor:**

```bash
# 1. Download the ZIP from Internet Archive (~1.4 MB)
curl -L -O "https://archive.org/download/screen-antics-johnny-castaway-16-color-v1.01-int.-1.4.93-win3.1-1.44m/Screen%20Antics%20-%20Johnny%20Castaway%20(16%20Color)%20(v1.01%2C%20Int.%201.4.93)%20(Win3.1)%20(1.44M).zip"

# 2. Extract the game data files into public/data/
npm run extract -- "<path-to-downloaded.zip>"
```

The script writes `public/data/RESOURCE.MAP`, `RESOURCE.001`, and
`SCRANTIC.SCR` and then cleans up all temporary files.



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
