#!/usr/bin/env bash
# Rendering oracle -- ORIGINAL side. Run the real 16-bit SCRANTIC.SCR headless
# under the framebuffer-patched DOSBox-X and dump the EMULATED VGA framebuffer as
# scene-labeled PPMs. Reuses the sequencing oracle's DOSBox-X build + drives/config
# (see METHODOLOGY.md "Binary trace"); the framebuffer patch adds the PPM dump.
#
# Env / args (all have defaults):
#   DBX        path to the patched dosbox-x binary
#   DBXCONF    path to dbx.conf (mounts drive C = our data, D = Win3.1)
#   OUT        output dir for PPMs (+ trace.log)
#   ADS        target ADS id to capture (0x6d = SUZY); loader-triggered
#   BURST      frames to capture per matching ADS load (default 250)
#   MAX        cap on total dumps (default 520)
#   SECS       run timeout seconds (default 240)
# Set DBX_FB_EVERY (env) instead of ADS to capture on a fixed cadence.
#
# The game paces at ~real time, so day-locked keyframes (SUZY/MARY/JOHNNY) will
# not occur inside a bounded run unless you first force them with
# force-scene-patches.py (SELECTION-only; rendering stays faithful).
set -euo pipefail
: "${DBX:?set DBX to the patched dosbox-x binary}"
: "${DBXCONF:?set DBXCONF to dbx.conf}"
OUT="${OUT:-./fb-original}"
ADS="${ADS:-0x6d}"
BURST="${BURST:-250}"
MAX="${MAX:-520}"
SECS="${SECS:-240}"

pkill -9 dosbox-x 2>/dev/null || true
rm -rf "$OUT"; mkdir -p "$OUT"
cd "$(dirname "$DBXCONF")"

env_args=(DBX_FB_DIR="$OUT" DBX_FB_MAX="$MAX")
if [ -n "${DBX_FB_EVERY:-}" ]; then
    env_args+=(DBX_FB_EVERY="$DBX_FB_EVERY" DBX_FB_START="${DBX_FB_START:-40}")
else
    env_args+=(DBX_FB_ADS="$ADS" DBX_FB_BURST="$BURST")
fi

SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy DBX_TRACE="$OUT/trace.log" \
    "${env_args[@]}" \
    timeout -s KILL "$SECS" "$DBX" -conf "$(basename "$DBXCONF")" \
        -set "cpu core=normal" -nogui >"$OUT/run.log" 2>&1 || true
pkill -9 dosbox-x 2>/dev/null || true

echo "ADS loads seen:"; grep -h "ads-loader id=" "$OUT/trace.log" | sed 's/.*id=//' | sort | uniq -c || true
echo "PPMs: $(ls "$OUT"/*.ppm 2>/dev/null | wc -l | tr -d ' ')  -> $OUT"
