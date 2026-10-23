"""Find island layer 0 in an original frame (its position is random), then test every
walk-table sprite at (anchorX-289+x+dx, anchorY-279+y+dy) for small dx/dy. Shows
whether our walk offsets relative to the island match the original's (#53).
Input JSON comes from dump-walk.mjs; frames are PNGs of original captures.
usage: walkmatch.py walk.json frame1.png [frame2.png ...]"""
import json, sys
import numpy as np
from PIL import Image
d = json.load(open(sys.argv[1]))
arr = lambda im: np.array(im['px'], dtype=int).reshape(im['h'], im['w'], 4)
sprites = [arr(s) for s in d['sprites']]
layer0 = arr(d['layer0'])
def score(frame, spr, x, y):
    h, w = spr.shape[:2]
    if x < 0 or y < 0 or x + w > 640 or y + h > 480: return 0.0
    m = spr[..., 3] > 0
    return float((np.abs(frame[y:y+h, x:x+w] - spr[..., :3]).sum(-1)[m] == 0).mean())
anchor = None
for f in sys.argv[2:]:
    fr = np.asarray(Image.open(f).convert('RGB')).astype(int)
    if anchor is None:
        res = max((score(fr, layer0, x, y), x, y) for x in range(0, 362) for y in range(200, 430))
        anchor = res[1:]
        print('island layer0 at', anchor, 'score', round(res[0], 3),
              'x-1', round(score(fr, layer0, anchor[0]-1, anchor[1]), 3), 'x+1', round(score(fr, layer0, anchor[0]+1, anchor[1]), 3))
    ox, oy = anchor[0] - 289, anchor[1] - 279
    best = []
    for i, row in enumerate(d['table']):
        if row['frame'] < 0 or row['frame'] >= len(sprites): continue
        spr = sprites[row['frame']][:, ::-1] if row['flipX'] else sprites[row['frame']]
        for dx in range(-4, 5):
            for dy in range(-3, 4):
                s = score(fr, spr, ox + row['x'] + dx, oy + row['y'] + dy)
                if s > 0.6: best.append((round(s, 3), row['frame'], row['flipX'], ox + row['x'] + dx, oy + row['y'] + dy, i, dx, dy))
    best.sort(reverse=True)
    if best: top = best[0][:5]; print(f.split("/")[-1], "sprite@", top, "rows:", [(b[5], b[6], b[7]) for b in best if b[:5] == top])
