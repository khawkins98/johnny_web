#!/bin/zsh
# Capture a set of gags from the original with the DBX_DELAY game-clock log (no frame
# dumps), in parallel. Feed the results to delay-log.mjs and clock-jumps.mjs.
#
#   SP_DOSBOX=... DBX=... tools/faithfulness-oracle/measure/capture-delay-set.sh [outDir]
#
# outDir defaults to <repo>/scratchpad/maintainer/captures/delaycap. Each gag writes
# <outDir>/<label>/ (capture), <label>-delay.log and <label>.out. SECS sets the run
# length (default 75). The default set is the six gags measured for #53; pass your own
# as GAGS="0x68:5:F5 0x6e:5:V5 ..." (ADS resource id : tag : label).
HERE=${0:A:h}
REPO=${HERE:h:h:h}
OUT=${1:-$REPO/scratchpad/maintainer/captures/delaycap}
: ${SP_DOSBOX:?set SP_DOSBOX (dir with driveC/ and driveD/)}
GAGS=${GAGS:-"0x68:5:F5 0x6e:5:V5 0x69:5:J5 0x6a:2:M2 0x6d:1:S1 0x66:2:B2"}
mkdir -p $OUT
for spec in ${=GAGS}; do
  parts=(${(s/:/)spec})
  DBX_DELAY=$OUT/${parts[3]}-delay.log node $REPO/tools/faithfulness-oracle/capture-original-gag.mjs \
    ${parts[1]} ${parts[2]} $OUT/${parts[3]} --secs ${SECS:-75} > $OUT/${parts[3]}.out 2>&1 &
done
wait
tail -n 2 $OUT/*.out
wc -l $OUT/*-delay.log
