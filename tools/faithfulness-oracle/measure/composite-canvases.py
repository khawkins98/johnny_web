"""Composite fg canvas (c1) over main canvas (c0) for each browse.mjs shot index.
Reads <prefix>_<i>_c0.png / _c1.png as written by ../browser/browse-canvases.mjs and
writes <prefix>_compNN.png.
usage: composite-canvases.py prefix count"""
import sys
from PIL import Image
prefix, n = sys.argv[1], int(sys.argv[2])
for i in range(n):
    bg = Image.open(f'{prefix}_{i}_c0.png').convert('RGBA')
    fg = Image.open(f'{prefix}_{i}_c1.png').convert('RGBA')
    Image.alpha_composite(bg, fg).convert('RGB').save(f'{prefix}_comp{i:02d}.png')
