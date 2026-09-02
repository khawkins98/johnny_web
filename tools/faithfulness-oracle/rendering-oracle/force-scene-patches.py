#!/usr/bin/env python3
"""
Force a specific day-locked keyframe gag to render in the ORIGINAL binary, so the
rendering oracle can capture a rare scene (e.g. SUZY scene 1) deterministically
under a bounded headless run instead of waiting many minutes for the RNG.

These are SELECTION-only patches: they change WHICH gag the scene director picks,
never how any gag RENDERS. SUZY's TTM draws identically regardless of what the
director chose before it, so the captured pixels are faithful.

Three one-time byte patches to SCRANTIC.EXE / SCRANTIC.SCR (16-bit NE; DATA seg 14
file base 0x17E00; code seg 4 file base 0x7600). Offsets recovered from the Ghidra
decompile of the scene director (see findings/phase2-scene-director.md):

  1. Keyframe gate  FUN_1018_0d76(0x80): `if (rand()%10 != 0) return NULL;`
     file 0x83AC  je 0xdb9 (74 0b) -> jmp 0xdb9 (eb 0b)
     => every "New Scene" ending is a day-locked keyframe (not 10% of the time).

  2. Target day     FUN_1018_0d76: `DAT_2d9b = DAT_2d9c;`  (target day <- current)
     file 0x83B9  mov al,[0x2d9c] (a0 9c 2d) -> mov al,DAY ; nop (b0 DD 90)
     => the picked keyframe is the one whose storyDay == DAY, regardless of the
        live day counter. day 3 => SUZY 1 ; day 9 => SUZY 2 ; etc.

  3. Walk budget    FUN_1018_0540: `FUN_1018_08b9(tide, 300)`
     file 0x7C41  mov ax,0x12c -> mov ax,BUDGET
     => shorten the intermediate walk chain so the (keyframe) ending is reached in
        a few gags, not ~10+. Keep BUDGET >= keyframe.width + ~40 or the builder's
        mandatory first-intermediate dereferences NULL (corrupts the queue). 80 is
        safe for SUZY 1 (width 35).

Day-locked keyframes (storyDay): MARY 1/2/3/4/5 = days 5/1/4/7/8 ;
JOHNNY 1/2/3/6 = days 11/2/6/10 ; SUZY 1/2 = days 3/9.

Usage:
  python3 force-scene-patches.py <driveC-dir> --day 3 [--budget 80] [--revert]
The script keeps a .prepatch backup and can --revert.
"""
import argparse, os, shutil, sys

OFF_GATE = 0x83AC
OFF_DAY  = 0x83B9
OFF_BUDGET = 0x7C41
FILES = ("SCRANTIC.EXE", "SCRANTIC.SCR")


def patch(path, day, budget):
    d = bytearray(open(path, "rb").read())
    # 1. keyframe gate: 74 0b -> eb 0b
    if d[OFF_GATE] == 0x74:
        d[OFF_GATE] = 0xEB
    elif d[OFF_GATE] != 0xEB:
        raise SystemExit(f"{path}: unexpected byte @0x{OFF_GATE:x}=0x{d[OFF_GATE]:02x}")
    # 2. target day: a0 9c 2d -> b0 DD 90  (mov al,day ; nop)
    if bytes(d[OFF_DAY:OFF_DAY+3]) not in (b"\xa0\x9c\x2d", bytes([0xB0, day, 0x90])):
        if d[OFF_DAY] != 0xB0:
            raise SystemExit(f"{path}: unexpected bytes @0x{OFF_DAY:x}")
    d[OFF_DAY] = 0xB0; d[OFF_DAY+1] = day & 0xFF; d[OFF_DAY+2] = 0x90
    # 3. walk budget word
    d[OFF_BUDGET] = budget & 0xFF; d[OFF_BUDGET+1] = (budget >> 8) & 0xFF
    open(path, "wb").write(d)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("driveC")
    ap.add_argument("--day", type=int, default=3, help="storyDay of the keyframe to force (3 = SUZY 1)")
    ap.add_argument("--budget", type=int, default=80, help="walk-span budget (>= keyframe.width + ~40)")
    ap.add_argument("--revert", action="store_true", help="restore .prepatch backups")
    a = ap.parse_args()
    for name in FILES:
        p = os.path.join(a.driveC, name)
        if not os.path.exists(p):
            print(f"skip (missing): {p}"); continue
        bak = p + ".prepatch"
        if a.revert:
            if os.path.exists(bak):
                shutil.copy(bak, p); print(f"reverted {name}")
            continue
        if not os.path.exists(bak):
            shutil.copy(p, bak)
        patch(p, a.day, a.budget)
        print(f"patched {name}: force keyframe every ending, target day={a.day}, budget={a.budget}")


if __name__ == "__main__":
    main()
