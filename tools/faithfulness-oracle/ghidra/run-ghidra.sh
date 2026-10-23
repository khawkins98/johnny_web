#!/bin/sh
# Run one of the Ghidra scripts in this folder headless against SCRANTIC.SCR.
#
#   tools/faithfulness-oracle/ghidra/run-ghidra.sh import            # first run: import + analyse + decompile
#   tools/faithfulness-oracle/ghidra/run-ghidra.sh DumpTtmHandlers.java [outFile]
#
# Everything this writes is derived from the proprietary binary. Outputs default to
# scratchpad/maintainer/ghidra/ (gitignored); never commit them.
#
# Environment (all optional):
#   GHIDRA_HEADLESS  path to analyzeHeadless (default: Homebrew's ghidra install)
#   JAVA_HOME        JDK 21 home (default: Homebrew openjdk@21)
#   GHIDRA_PROJ      Ghidra project directory (default: <repo>/scratchpad/ghidra/proj)
#   GHIDRA_OUT       output directory (default: <repo>/scratchpad/maintainer/ghidra)
#   SCRANTIC_SCR     the binary (default: <repo>/public/data/SCRANTIC.SCR)
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
GHIDRA_HEADLESS=${GHIDRA_HEADLESS:-$(ls -d /opt/homebrew/Cellar/ghidra/*/libexec/support/analyzeHeadless 2>/dev/null | tail -1)}
export JAVA_HOME=${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}
GHIDRA_PROJ=${GHIDRA_PROJ:-$REPO/scratchpad/ghidra/proj}
GHIDRA_OUT=${GHIDRA_OUT:-$REPO/scratchpad/maintainer/ghidra}
SCRANTIC_SCR=${SCRANTIC_SCR:-$REPO/public/data/SCRANTIC.SCR}

if [ -z "$GHIDRA_HEADLESS" ] || [ ! -x "$GHIDRA_HEADLESS" ]; then
    echo "analyzeHeadless not found; set GHIDRA_HEADLESS" >&2
    exit 2
fi
mkdir -p "$GHIDRA_PROJ" "$GHIDRA_OUT"

SCRIPT=${1:-}
if [ -z "$SCRIPT" ]; then
    echo "usage: $0 import | <Script.java> [outFile]" >&2
    exit 2
fi

if [ "$SCRIPT" = import ]; then
    # Import, run Ghidra's auto-analysis, and export every function's decompilation.
    OUT=${2:-$GHIDRA_OUT/decompiled.c}
    "$GHIDRA_HEADLESS" "$GHIDRA_PROJ" scrantic \
        -import "$SCRANTIC_SCR" -overwrite \
        -scriptPath "$HERE" -postScript ExportDecompiled.java "$OUT" \
        > "$GHIDRA_OUT/headless.log" 2>&1
    status=$?
else
    # Read-only pass over the already-analysed project.
    base=$(basename "$SCRIPT" .java)
    OUT=${2:-$GHIDRA_OUT/$base.txt}
    "$GHIDRA_HEADLESS" "$GHIDRA_PROJ" scrantic \
        -process SCRANTIC.SCR -noanalysis -readOnly \
        -scriptPath "$HERE" -postScript "$SCRIPT" "$OUT" \
        > "$GHIDRA_OUT/headless.log" 2>&1
    status=$?
fi
echo "exit=$status"
tail -5 "$GHIDRA_OUT/headless.log"
wc -l "$OUT"
exit $status
