#!/usr/bin/env bash
# Rendering oracle -- capture ONE forced catalogue gag from the ORIGINAL binary
# at scale: force-gag.py picks the (adsId, tag) unconditionally, then a
# headless patched dosbox-x run dumps labeled VGA framebuffer PPMs + a director
# trace while it plays out, and force-gag.py --revert restores the binary
# afterwards.
#
# Generalizes capture-original.sh (which requires the gag to occur naturally /
# only forces day-locked keyframes) to any of the 79 catalogue records, and
# fixes a bug in capture-original.sh: it builds an `env_args=(...)` bash array
# and splices `"${env_args[@]}"` in front of `timeout` as if it were an env-var
# prefix. Under bash/zsh that does NOT set the vars for the child -- the first
# array element is executed as its own command (e.g. `DBX_FB_DIR=...` runs as
# a command named literally that, which fails with "No such file or
# directory"). The fix: pass everything through a single `env VAR=val ...`
# invocation instead of a bare prefix-array splice.
#
# Usage:
#   capture-gag.sh <adsId-hex> <tag> <outdir> [secs]
#
#   adsId-hex   e.g. 0x66 (BUILDING) -- see force-gag.py for the full table
#   tag         ADS tag / gag number, e.g. 7
#   outdir      directory to write fb_*.ppm + trace.log + run.log into
#   secs        emulator run timeout in seconds (default 220)
#
# Required env (paths into the session scratchpad set up for phase13):
#   DBX      path to the patched dosbox-x binary
#   SP_DOSBOX  dir containing dbx.conf + driveC/driveD (defaults to
#              $(dirname "$DBX")/../../dosbox if unset, but it's simplest to
#              just export SP_DOSBOX explicitly)
#
# Example:
#   export DBX=$SP/dosbox-x-src/src/dosbox-x
#   export SP_DOSBOX=$SP/dosbox
#   capture-gag.sh 0x66 7 $SP/cap-b7-verify
set -euo pipefail

ADS_HEX="${1:?usage: capture-gag.sh <adsId-hex> <tag> <outdir> [secs]}"
TAG="${2:?usage: capture-gag.sh <adsId-hex> <tag> <outdir> [secs]}"
OUT="${3:?usage: capture-gag.sh <adsId-hex> <tag> <outdir> [secs]}"
SECS="${4:-220}"
BURST=1600

: "${DBX:?set DBX to the patched dosbox-x binary}"
DBX_DIR="$SP_DOSBOX"
: "${DBX_DIR:?set SP_DOSBOX to the dir containing dbx.conf + driveC/driveD}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORCE_GAG_PY="$SCRIPT_DIR/force-gag.py"
DRIVE_C="$DBX_DIR/driveC"

pkill -9 dosbox-x 2>/dev/null || true
rm -rf "$OUT"; mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

echo "== forcing $ADS_HEX tag $TAG in $DRIVE_C =="
python3 "$FORCE_GAG_PY" "$DRIVE_C" --ads "$ADS_HEX" --tag "$TAG"

# Safety net: if this script is killed/interrupted mid-run, still make sure
# dosbox-x is not left running and the binary is not left patched.
REVERTED=0
cleanup() {
    pkill -9 dosbox-x 2>/dev/null || true
    if [ "$REVERTED" -eq 0 ]; then
        REVERTED=1
        python3 "$FORCE_GAG_PY" "$DRIVE_C" --ads "$ADS_HEX" --tag "$TAG" --revert || true
    fi
}
trap cleanup EXIT

cd "$DBX_DIR"
echo "== running dosbox-x headless for ${SECS}s (ads=$ADS_HEX burst=$BURST) =="
env \
    SDL_VIDEODRIVER=dummy \
    SDL_AUDIODRIVER=dummy \
    DBX_TRACE="$OUT/trace.log" \
    DBX_FB_DIR="$OUT" \
    DBX_FB_MAX="$BURST" \
    DBX_FB_ADS="$ADS_HEX" \
    DBX_FB_BURST="$BURST" \
    timeout -s KILL "$SECS" "$DBX" -conf dbx.conf -set "cpu core=normal" -nogui \
    >"$OUT/run.log" 2>&1 || true

pkill -9 dosbox-x 2>/dev/null || true
echo "== reverting force patch =="
REVERTED=1
python3 "$FORCE_GAG_PY" "$DRIVE_C" --ads "$ADS_HEX" --tag "$TAG" --revert

echo
echo "== completion-tag histogram (arg0 of ' completion ' trace lines) =="
grep -E ' completion ' "$OUT/trace.log" 2>/dev/null \
    | sed -E 's/.*args=([0-9A-Fa-f]+),.*/\1/' \
    | sort | uniq -c | sort -rn || true

echo
echo "PPMs: $(ls "$OUT"/fb_*.ppm 2>/dev/null | wc -l | tr -d ' ')  -> $OUT"
