"""Print the per-tick changed-pixel bbox for a capture's first 60 ticks, and save its
middle frame as <out>/<gag>_mid.png (out = $PEEK_OUT or the current directory).
usage: peek.py <gag>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load import read_ppm, frames
from PIL import Image
import numpy as np

OUT = os.environ.get('PEEK_OUT', os.getcwd())
gag = sys.argv[1]
fr = frames(gag)
ticks = list(fr)
print(gag, 'ticks', ticks[0], '..', ticks[-1], len(ticks))
a = read_ppm(fr[ticks[len(ticks) // 2]])
print('shape', a.shape)
Image.fromarray(a).save(os.path.join(OUT, f'{gag}_mid.png'))
# per-tick changed-pixel bbox (whole frame)
prev = None
for t in ticks[:60]:
    cur = read_ppm(fr[t])
    if prev is not None:
        diff = np.any(cur != prev, axis=2)
        ys, xs = np.nonzero(diff)
        if len(ys):
            print(t, len(ys), 'bbox x', xs.min(), xs.max(), 'y', ys.min(), ys.max())
        else:
            print(t, 0)
    prev = cur
