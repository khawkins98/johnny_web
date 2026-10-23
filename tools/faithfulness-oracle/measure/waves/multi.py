"""Wave step gaps across several gags, high- and low-tide rects; read-only on captures.
usage: multi.py high|low <gag> [<gag> ...]"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load import read_ppm, frames
import numpy as np
from collections import Counter

HIGH = {'A': (0x10f, 0x132, 0x48, 0x1d), 'B': (0x16d, 0x13f, 0x9c, 0x19), 'C': (0x207, 0x12f, 0x41, 0x20)}
LOW = {'A': (0xea, 0x143, 0x78, 0x30), 'B': (0x170, 0x164, 0xab, 0x1c), 'C': (0x22f, 0x143, 0x51, 0x30), 'A2': (0x82, 0x154, 0x61, 0x1d)}
ORDER = {'A': 'B', 'B': 'C', 'C': 'A'}


def analyse(gag, rects, maxticks):
    fr = frames(gag)
    ticks = [t for t in fr][:maxticks]
    prev, events = {}, []
    for t in ticks:
        cur = read_ppm(fr[t])
        for k, (x, y, w, h) in rects.items():
            key = hash(cur[y:y + h, x:x + w].tobytes())
            if k in prev and prev[k] != key:
                events.append((t, k))
            prev[k] = key
    return ticks, events


total = Counter()
tot_steps = [0, 0]
for gag in sys.argv[2:]:
    rects = LOW if sys.argv[1] == 'low' else HIGH
    ticks, events = analyse(gag, rects, 400)
    missing = sorted(set(range(ticks[0], ticks[-1] + 1)) - set(ticks))
    per_tick = Counter(t for t, _ in events)
    main = [(t, k) for t, k in events if k in ('A', 'B', 'C')]
    # a "clean" sequence: one region per tick, round robin A->B->C
    rr = sum(1 for (t1, k1), (t2, k2) in zip(main, main[1:]) if ORDER[k1] == k2)
    st = sorted(per_tick)
    gaps = Counter(b - a for a, b in zip(st, st[1:]))
    a2_with_a = sum(1 for t, k in events if k == 'A2' and (t, 'A') in events)
    a2 = sum(1 for t, k in events if k == 'A2')
    print(f'{gag}: ticks {ticks[0]}..{ticks[-1]} missing {len(missing)}; changes {len(st)}; round-robin pairs {rr}/{max(0, len(main) - 1)}; multi-region ticks {sum(1 for v in per_tick.values() if v > 1)}; gaps {sorted(gaps.items())}' + (f'; A2 with A {a2_with_a}/{a2}' if sys.argv[1] == 'low' else ''))
    steps = len(main)
    span = ticks[-1] - ticks[0]
    print(f'   steps {steps} over {span} ticks: {span/steps:.3f} ticks/step = {55*span/steps:.1f} ms/step at 55 ms/tick')
    total.update(gaps)
    tot_steps[0] += steps; tot_steps[1] += span
n = sum(total.values())
print('ALL gaps', sorted(total.items()), 'mean', round(sum(k * v for k, v in total.items()) / max(1, n), 3))
print('ALL steps', tot_steps, f'{tot_steps[1]/tot_steps[0]:.3f} ticks/step = {55*tot_steps[1]/tot_steps[0]:.1f} ms')
