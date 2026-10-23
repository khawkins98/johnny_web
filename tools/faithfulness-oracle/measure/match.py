"""Locate a template (ours, masked to non-ocean pixels) inside an original frame.
Used to measure where the original draws the island relative to us (#53).
usage: match.py ours.png panelX x y w h orig.png [searchX0 searchX1 searchY0 searchY1]
Prints the best (ox, oy) top-left in orig and the match ratio, plus runner-ups."""
import sys
import numpy as np
from PIL import Image

ours = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int)
px, x, y, w, h = map(int, sys.argv[2:7])
orig = np.asarray(Image.open(sys.argv[7]).convert('RGB')).astype(int)
rng = list(map(int, sys.argv[8:12])) if len(sys.argv) > 8 else [0, 640 - w, 0, 480 - h]
tpl = ours[y:y + h, px + x:px + x + w]
# mask: skip ocean-ish blues/purples (blue channel dominant, red low) and pure black
r, g, b = tpl[..., 0], tpl[..., 1], tpl[..., 2]
mask = ~(((b > 100) & (r < 120) & (g < 120)) | ((r + g + b) == 0) | ((r < 100) & (g > 200) & (b > 200)))
n = mask.sum()
res = []
for oy in range(rng[2], rng[3] + 1):
    for ox in range(rng[0], rng[1] + 1):
        win = orig[oy:oy + h, ox:ox + w]
        if win.shape[:2] != (h, w):
            continue
        eq = (np.abs(win - tpl).sum(-1) < 40) & mask
        res.append((eq.sum() / n, ox, oy))
res.sort(reverse=True)
print('mask px', n)
for s, ox, oy in res[:5]:
    print(f'{ox} {oy} {s:.4f}')
