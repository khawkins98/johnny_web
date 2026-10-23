"""Search +-40 px around each wave region for the best-matching wave frame at one tick:
finds the screen origin the original uses for the wave patches.
usage: offset.py <gag> <tick> [low]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load import read_ppm, frames, FRAMES
import numpy as np

meta = json.load(open(os.path.join(FRAMES, 'frames.json')))
gag, tick, low = sys.argv[1], int(sys.argv[2]), len(sys.argv) > 3 and sys.argv[3] == 'low'
img = read_ppm(frames(gag)[tick])
regs = [((0xea, 0x143), [30, 31, 32]), ((0x170, 0x164), [33, 34, 35]), ((0x22f, 0x143), [36, 37, 38]), ((0x82, 0x154), [39, 40, 41])] if low else [((0x10f, 0x132), [3, 4, 5]), ((0x16d, 0x13f), [6, 7, 8]), ((0x207, 0x12f), [9, 10, 11])]
for (x, y), cands in regs:
    best = (0,)
    for i in cands:
        w, h = meta[str(i)]
        s = np.fromfile(os.path.join(FRAMES, f'f{i}.rgba'), dtype=np.uint8).reshape(h, w, 4)
        for dx in range(-40, 41):
            for dy in range(-40, 41):
                x0, y0 = x + dx, y + dy
                if x0 < 0 or y0 < 0 or x0 + w > 640 or y0 + h > 480:
                    continue
                c = img[y0:y0 + h, x0:x0 + w]
                m = s[..., 3] > 0
                f = (np.all(s[..., :3] == c, axis=2) & m).sum() / m.sum()
                if f > best[0]:
                    best = (round(f, 3), i, dx, dy)
    print((x, y), best)
