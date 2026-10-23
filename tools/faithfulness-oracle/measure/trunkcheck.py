"""For each shot: in the trunk box (island layer0 x + 154, 22 wide), count fg-opaque
pixels equal to the bg canvas (occluder redraw on target) vs different.
usage: trunkcheck.py prefix count layer0x layer0y"""
import sys
import numpy as np
from PIL import Image
prefix, n, lx, ly = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
tx, ty = lx + 154, ly - 279 + 148
for i in range(n):
    bg = np.asarray(Image.open(f'{prefix}_{i}_c0.png').convert('RGBA')).astype(int)
    fg = np.asarray(Image.open(f'{prefix}_{i}_c1.png').convert('RGBA')).astype(int)
    for shift in (0,):
        box = (slice(ty, ty + 145), slice(tx - 2, tx + 26))
        f, b = fg[box], bg[box]
        op = f[..., 3] > 0
        same = (np.abs(f[..., :3] - b[..., :3]).sum(-1) == 0) & op
        if op.sum():
            print(i, 'fg opaque in trunk box', int(op.sum()), 'equal to bg', int(same.sum()))
