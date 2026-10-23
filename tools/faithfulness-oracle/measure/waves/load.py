"""Shared loader for the wave scripts: tick-labelled framebuffer dumps of the original.

Captures live in $WAVE_CAPTURES/<gag>/fb/tNNNNNN.ppm.gz, the layout written by
../../pixel-oracle/capture-gags.mjs (default: <repo>/scratchpad/pixel-oracle/captures).
Wave sprite frames (for ident.py / offset.py) live in $WAVE_FRAMES (default:
<repo>/scratchpad/maintainer/waves/frames), written by dump-wave-frames.mjs.
"""
import gzip, os, re
import numpy as np

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..'))
C = os.environ.get('WAVE_CAPTURES', os.path.join(REPO, 'scratchpad', 'pixel-oracle', 'captures'))
FRAMES = os.environ.get('WAVE_FRAMES', os.path.join(REPO, 'scratchpad', 'maintainer', 'waves', 'frames'))


def read_ppm(path):
    data = (gzip.open if path.endswith('.gz') else open)(path, 'rb').read()
    # P6\n<w> <h>\n<max>\n
    parts = re.match(rb'P6\s+(\d+)\s+(\d+)\s+(\d+)\s', data)
    w, h = int(parts.group(1)), int(parts.group(2))
    arr = np.frombuffer(data[parts.end():parts.end() + w * h * 3], dtype=np.uint8).reshape(h, w, 3)
    return arr


def frames(gag):
    d = os.path.join(C, gag, 'fb')
    out = {}
    for f in os.listdir(d):
        m = re.match(r't(\d+)\.ppm(\.gz)?$', f)
        if m:
            out[int(m.group(1))] = os.path.join(d, f)
    return dict(sorted(out.items()))
