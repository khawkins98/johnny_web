"""Identify which BACKGRND wave frame each region shows per tick (read-only on captures).
usage: ident.py <gag> [dx=0] [dy=0] [high|low] [maxTicks]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load import read_ppm, frames, FRAMES
import numpy as np

meta = json.load(open(os.path.join(FRAMES, 'frames.json')))


def sprite(i):
    w, h = meta[str(i)]
    a = np.fromfile(os.path.join(FRAMES, f'f{i}.rgba'), dtype=np.uint8).reshape(h, w, 4)
    return a


HIGH = {'A': ((0x10f, 0x132), [3, 4, 5]), 'B': ((0x16d, 0x13f), [6, 7, 8]), 'C': ((0x207, 0x12f), [9, 10, 11])}
LOW = {'A': ((0xea, 0x143), [30, 31, 32]), 'B': ((0x170, 0x164), [33, 34, 35]), 'C': ((0x22f, 0x143), [36, 37, 38]), 'A2': ((0x82, 0x154), [39, 40, 41])}

gag = sys.argv[1]
dx = int(sys.argv[2]) if len(sys.argv) > 2 else 0
dy = int(sys.argv[3]) if len(sys.argv) > 3 else 0
regions = LOW if len(sys.argv) > 4 and sys.argv[4] == 'low' else HIGH
limit = int(sys.argv[5]) if len(sys.argv) > 5 else 10**9
sprites = {i: sprite(i) for r in regions.values() for i in r[1]}


def score(img, i, x, y):
    s = sprites[i]
    h, w = s.shape[:2]
    x0, y0 = x + dx, y + dy
    xs0, ys0 = max(0, -x0), max(0, -y0)
    xe, ye = min(w, 640 - x0), min(h, 480 - y0)
    ss = s[ys0:ye, xs0:xe]
    cc = img[y0 + ys0:y0 + ye, x0 + xs0:x0 + xe]
    m = ss[..., 3] > 0
    if m.sum() == 0:
        return 0
    # Palette-tolerant: best one-to-one-ish colour mapping sprite colour -> capture colour.
    sk = (ss[..., 0].astype(np.int64) << 16 | ss[..., 1].astype(np.int64) << 8 | ss[..., 2])[m]
    ck = (cc[..., 0].astype(np.int64) << 16 | cc[..., 1].astype(np.int64) << 8 | cc[..., 2])[m]
    pair = sk * (1 << 24) + ck
    u, n = np.unique(pair, return_counts=True)
    src = u >> 24
    best = {}
    for s_, n_ in zip(src, n):
        best[s_] = max(best.get(s_, 0), n_)
    return sum(best.values()) / m.sum()


fr = frames(gag)
rows = []
for t in list(fr)[:limit]:
    img = read_ppm(fr[t])
    row = {}
    for k, ((x, y), cands) in regions.items():
        sc = [score(img, i, x, y) for i in cands]
        best = int(np.argmax(sc))
        row[k] = best if sc[best] > 0.6 else None
        row[k + '_s'] = round(sc[best], 2)
    rows.append((t, row))
prev = None
seq = []
for t, row in rows:
    state = tuple(row[k] for k in regions)
    if state != prev:
        seq.append((t, state, tuple(row[k + '_s'] for k in regions)))
        prev = state
for t, st, sc in seq[:60]:
    print(t, st, sc)
print('...', len(seq), 'states')
