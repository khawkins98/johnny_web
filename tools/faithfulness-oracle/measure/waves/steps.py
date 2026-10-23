"""Per-region wave change ticks in a forced capture (read-only on captures).
usage: steps.py <gag> [dx=0] [dy=0] [high|low]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load import read_ppm, frames
import numpy as np

# Screen rects for origin 30c6 = 30c4 = 0 (FUN_1010_0e74), x, y, w, h.
HIGH = {'A': (0x10f, 0x132, 0x48, 0x1d), 'B': (0x16d, 0x13f, 0x9c, 0x19), 'C': (0x207, 0x12f, 0x41, 0x20)}
LOW = {'A': (0xea, 0x143, 0x78, 0x30), 'B': (0x170, 0x164, 0xab, 0x1c), 'C': (0x22f, 0x143, 0x51, 0x30), 'A2': (0x82, 0x154, 0x61, 0x1d)}

gag = sys.argv[1]
dx = int(sys.argv[2]) if len(sys.argv) > 2 else 0
dy = int(sys.argv[3]) if len(sys.argv) > 3 else 0
rects = LOW if (len(sys.argv) > 4 and sys.argv[4] == 'low') else HIGH
fr = frames(gag)
ticks = list(fr)
prev = {}
contents = {k: [] for k in rects}
events = []
for t in ticks:
    cur = read_ppm(fr[t])
    for k, (x, y, w, h) in rects.items():
        x0, y0 = max(0, x + dx), max(0, y + dy)
        crop = cur[y0:min(480, y + dy + h), x0:min(640, x + dx + w)]
        key = crop.tobytes()
        lst = contents[k]
        if key not in lst:
            lst.append(key)
        idx = lst.index(key)
        if k in prev and prev[k] != idx:
            events.append((t, k, prev[k], idx))
        prev[k] = idx
step_ticks = sorted(set(e[0] for e in events))
gaps = [b - a for a, b in zip(step_ticks, step_ticks[1:])]
print(gag, 'ticks', ticks[0], ticks[-1], 'distinct contents per region', {k: len(v) for k, v in contents.items()})
print('events (tick region from->to):')
print(' '.join(f'{t}{k}:{a}>{b}' for t, k, a, b in events[:80]))
from collections import Counter
print('gap histogram (ticks between successive change ticks):', sorted(Counter(gaps).items()))
multi = [t for t in step_ticks if sum(1 for e in events if e[0] == t) > 1]
print('ticks with >1 region changing:', len(multi), multi[:20])
if gaps:
    print('mean gap ticks', round(sum(gaps) / len(gaps), 3), 'n', len(gaps))
