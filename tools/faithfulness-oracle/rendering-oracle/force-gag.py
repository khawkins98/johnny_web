#!/usr/bin/env python3
"""
Force ANY catalogue gag (adsId, adsTag) to be selected by the scene director,
generalizing force-scene-patches.py (which only forces day-locked keyframes)
to the full 79-entry scene catalogue.

SELECTION-only: this changes WHICH catalogue record the picker (FUN_1018_0d76)
can choose, never how the chosen gag's ADS/TTM content renders. Captured
pixels for the forced gag are exactly what the original would draw if the
picker had chosen it naturally.

The catalogue lives in BOTH SCRANTIC.SCR and SCRANTIC.EXE at file offset
0x19556, 79 records, stride 0x11 (17) bytes. Per-record layout (relevant
fields; see findings/phase2-scene-director.md and phase13-ground-truth-at-
scale.md for the full decompile):

  +0x02  weight     (byte)  -- picker's weighted-random pool contribution
  +0x03  startSpot  (byte)  -- walk-chain continuity gate (spot Johnny must
                               be standing at for this record to be a
                               candidate in the walk-chain builder)
  +0x0a  storyDay   (byte)  -- used only for the keyframe (selFlag 0x80) path
  +0x0f  adsId      (byte)  -- which ADS resource this gag belongs to
  +0x10  adsTag     (byte)  -- completion tag / TTM tag within that ADS

ADS id table (from the catalogue + trace correlation):
  0x65 ACTIVITY   0x66 BUILDING   0x68 FISHING   0x69 JOHNNY
  0x6a MARY       0x6c STAND      0x6d SUZY      0x6e VISITOR   0x6f WALKSTUF

The picker (FUN_1018_0d76) requires, for ordinary (non-keyframe) selection:
adsTag != 0, tideMin <= tide < tideMax, storyDay == 0, width/2 < widthBudget,
holiday-ok -- AND for INTERMEDIATE gags the walk-chain builder additionally
gates on startSpot (Johnny must be walking through that spot). Rather than
reverse the walk-chain gate itself, this patch just makes the record trivially
eligible and dominant:

  - startSpot (+0x03) -> 0     ("any position" -- satisfies the walk-chain
                                 continuity check unconditionally, per the
                                 confirmed campfire (BUILDING #7, idx 17) run)
  - weight    (+0x02) -> 0x7f  (127 -- dominates the weighted-random pool so
                                 the picker selects this record essentially
                                 every time it's a candidate)

This does NOT touch tideMin/tideMax/storyDay/holiday gating -- if a gag is
tide- or day-restricted you may still need to wait for / set the matching
in-game clock. For ordinary intermediates (flagsB bit 1|2, tag != 0, day 0)
this is sufficient on its own, as demonstrated for BUILDING #7.

Usage:
  python3 force-gag.py <driveC-dir> --ads 0x66 --tag 7 [--revert]

Keeps a `.forcegag` backup per file (SCRANTIC.SCR, SCRANTIC.EXE); --revert
restores from it.

MANUAL VERIFICATION (no automated test exists -- SCRANTIC.SCR/.EXE are
proprietary game binaries, not something to check into or exercise in CI):
Run against $SP/dosbox/driveC (SP = the session scratchpad used for the
phase13 ground-truth-at-scale work) with --ads 0x66 --tag 7. Observed output:

    $ python3 force-gag.py $SP/dosbox/driveC --ads 0x66 --tag 7
    patched BUILDING #7 idx 17 in SCRANTIC.SCR (startSpot 4->0, weight 10->127)
    patched BUILDING #7 idx 17 in SCRANTIC.EXE (startSpot 4->0, weight 10->127)

    $ python3 force-gag.py $SP/dosbox/driveC --ads 0x66 --tag 7 --revert
    reverted SCRANTIC.SCR
    reverted SCRANTIC.EXE

  -- confirms idx 17 is the unique record matching (adsId=0x66, adsTag=7),
  matching the phase13 finding, and that --revert restores the original
  bytes (weight 10 / startSpot 4) byte-for-byte.
"""
import argparse, os, shutil, sys

CATALOGUE_OFF = 0x19556
STRIDE = 0x11
NUM_RECORDS = 79
OFF_WEIGHT = 0x02
OFF_STARTSPOT = 0x03
OFF_ADSID = 0x0f
OFF_ADSTAG = 0x10
FORCED_WEIGHT = 0x7f
FORCED_STARTSPOT = 0x00

ADS_NAMES = {
    0x65: "ACTIVITY", 0x66: "BUILDING", 0x68: "FISHING", 0x69: "JOHNNY",
    0x6a: "MARY", 0x6c: "STAND", 0x6d: "SUZY", 0x6e: "VISITOR", 0x6f: "WALKSTUF",
}

FILES = ("SCRANTIC.SCR", "SCRANTIC.EXE")


def find_record(data, ads_id, tag):
    """Scan the catalogue for the record matching (adsId, adsTag).
    Returns (idx, off) or None."""
    matches = []
    for idx in range(NUM_RECORDS):
        off = CATALOGUE_OFF + idx * STRIDE
        rec = data[off:off + STRIDE]
        if len(rec) < STRIDE:
            break
        if rec[OFF_ADSID] == ads_id and rec[OFF_ADSTAG] == tag:
            matches.append((idx, off))
    return matches


def patch_file(path, ads_id, tag, revert):
    bak = path + ".forcegag"
    if revert:
        if os.path.exists(bak):
            shutil.copy(bak, path)
            print(f"reverted {os.path.basename(path)}")
        else:
            print(f"skip revert (no backup): {path}")
        return

    data = bytearray(open(path, "rb").read())
    matches = find_record(data, ads_id, tag)
    if len(matches) == 0:
        raise SystemExit(
            f"{path}: no catalogue record found with adsId=0x{ads_id:02x} tag={tag}"
        )
    if len(matches) > 1:
        raise SystemExit(
            f"{path}: ambiguous -- {len(matches)} records match adsId=0x{ads_id:02x} "
            f"tag={tag}: idx {[m[0] for m in matches]}"
        )
    idx, off = matches[0]
    rec = data[off:off + STRIDE]
    got_ads = rec[OFF_ADSID]
    got_tag = rec[OFF_ADSTAG]
    if got_ads != ads_id or got_tag != tag:
        raise SystemExit(
            f"{path}: sanity check failed -- matched idx {idx} has "
            f"adsId=0x{got_ads:02x} tag={got_tag}, expected adsId=0x{ads_id:02x} tag={tag}"
        )

    old_weight = data[off + OFF_WEIGHT]
    old_startspot = data[off + OFF_STARTSPOT]

    if not os.path.exists(bak):
        shutil.copy(path, bak)

    data[off + OFF_WEIGHT] = FORCED_WEIGHT
    data[off + OFF_STARTSPOT] = FORCED_STARTSPOT
    open(path, "wb").write(data)

    name = ADS_NAMES.get(ads_id, f"0x{ads_id:02x}")
    print(
        f"patched {name} #{tag} idx {idx} in {os.path.basename(path)} "
        f"(startSpot {old_startspot}->{FORCED_STARTSPOT}, weight {old_weight}->{FORCED_WEIGHT})"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("driveC")
    ap.add_argument("--ads", required=True, help="ADS id, e.g. 0x66 (BUILDING)")
    ap.add_argument("--tag", required=True, type=int, help="ADS tag (gag number) to force")
    ap.add_argument("--revert", action="store_true", help="restore .forcegag backups")
    a = ap.parse_args()

    ads_id = int(a.ads, 0)
    tag = a.tag

    any_found = False
    for name in FILES:
        p = os.path.join(a.driveC, name)
        if not os.path.exists(p):
            print(f"skip (missing): {p}")
            continue
        any_found = True
        patch_file(p, ads_id, tag, a.revert)

    if not any_found:
        raise SystemExit(f"no catalogue files found under {a.driveC}")


if __name__ == "__main__":
    main()
