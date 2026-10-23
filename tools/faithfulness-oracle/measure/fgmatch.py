"""Best shift of ours' opaque foreground onto an original frame. `ours.png` is a
side-by-side debug image whose foreground panel starts at x=644 (640 + 4 px gap).
usage: fgmatch.py ours.png orig.png [x0 y0 x1 y1 restrict-bbox-in-ours] -- prints top shifts."""
import sys
import numpy as np
from PIL import Image

img = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int)
fg = img[:, 644:644 + 640]
orig = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int)
mask = fg.sum(-1) > 0
if len(sys.argv) > 3:
    x0, y0, x1, y1 = map(int, sys.argv[3:7])
    m2 = np.zeros_like(mask); m2[y0:y1, x0:x1] = True; mask &= m2
ys, xs = np.nonzero(mask)
print('fg px', mask.sum(), 'bbox', xs.min(), ys.min(), xs.max(), ys.max())
res = []
for dy in range(-100, 101):
    for dx in range(-100, 101):
        ty, tx = ys + dy, xs + dx
        ok = (ty >= 0) & (ty < 480) & (tx >= 0) & (tx < 640)
        eq = (np.abs(orig[ty[ok], tx[ok]] - fg[ys[ok], xs[ok]]).sum(-1) == 0)
        res.append((eq.sum() / len(ys), dx, dy))
res.sort(reverse=True)
for s, dx, dy in res[:6]:
    print(dx, dy, f'{s:.4f}')
