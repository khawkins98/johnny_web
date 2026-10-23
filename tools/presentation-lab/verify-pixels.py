#!/usr/bin/env python3
"""Verify native pixel blocks and measure placement drift in synthetic captures (Pillow)."""
import json
from pathlib import Path
from PIL import Image, ImageChops

root = Path(__file__).resolve().parents[2]
images = root / 'docs/images/presentation-lab'
source = Image.open(images / 'native-fixture.png').convert('RGB')
results = []
# Prefer the DOM-projected origin, then search a small neighborhood for compositor drift.
offsets = sorted(((x, y) for x in range(-2, 3) for y in range(-2, 3)),
                 key=lambda pair: abs(pair[0]) + abs(pair[1]))
for case in json.loads((images / 'metrics.json').read_text())['results']:
    if case['mode'] != 'auto' or case['effect'] not in ('none', 'raster'):
        continue
    multiplier = round(case['geometry']['scale'] * case['dpr'])
    x, y = map(round, case['layoutDeviceOrigin'])
    size = (640 * multiplier, 480 * multiplier)
    screenshot = Image.open(images / (case['name'] + '.png')).convert('RGB')
    expected = source.resize(size, Image.Resampling.NEAREST)
    matched = None
    for dx, dy in offsets:
        crop = screenshot.crop((x + dx, y + dy, x + dx + size[0], y + dy + size[1]))
        if ImageChops.difference(crop, expected).getbbox() is None:
            matched = [dx, dy]
            break
    assert matched is not None, f"Pixel replication failed within ±2 device pixels: {case['name']}"
    result = {'name': case['name'], 'exactPixelBlocks': True,
              'deviceMultiplier': multiplier, 'offsetFromDomDeviceOrigin': matched}
    results.append(result)
    print(case['name'], 'exact native pixel blocks; offset from DOM projection:', matched)
(images / 'pixel-checks.json').write_text(json.dumps(results, indent=2) + '\n')
