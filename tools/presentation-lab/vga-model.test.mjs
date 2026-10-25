import test from 'node:test';
import assert from 'node:assert/strict';
import { vgaDefaults, sanitizeVga, maskVisibility } from './vga-model.mjs';
import { lineRadiance } from './vga-reference.mjs';

test('VGA preferences bound invalid storage without changing creative presets', () => {
    assert.deepEqual(sanitizeVga(null), vgaDefaults);
    assert.equal(sanitizeVga({ horizontal: Infinity, beam: -100, gamma: '2', mask: 100 }).beam, 0.18);
    assert.equal(sanitizeVga({ gamma: '2' }).gamma, 2.2);
    assert.equal(sanitizeVga({ mask: 100 }).mask, 0.35);
});
test('unresolved mask averages out independently of source scaling', () => {
    assert.equal(maskVisibility(1280, 640), 0);
    assert.equal(maskVisibility(1920, 640), 0);
    assert.equal(maskVisibility(3840, 640), 1);
    assert.equal(maskVisibility(1920, 320), 1);
});
test('bounded shader quadrature agrees with a high-sample radiance reference', t => {
    let maxError = 0;
    for (const horizontal of [0.2, 0.35, 0.8]) for (const footprint of [0.25, 0.5, 1, 2, 4]) for (const phase of [0, 0.25, 0.5, 0.8]) {
        const settings = { ...vgaDefaults, horizontal };
        const sample = x => ((x % 2) + 2) % 2;
        const count = Math.max(2, Math.min(32, Math.ceil(footprint * 8)));
        const gpuApprox = lineRadiance(phase, footprint, settings, sample, count, 3);
        const reference = lineRadiance(phase, footprint, settings, sample);
        maxError = Math.max(maxError, Math.abs(gpuApprox - reference));
    }
    t.diagnostic(`maximum absolute radiance error: ${maxError}`);
    assert.ok(maxError < 0.015, `radiance integration error ${maxError}`);
});
test('CRT response precedes pixel integration for alternating drive values', () => {
    const sample = x => ((x % 2) + 2) % 2;
    const radiance = lineRadiance(0.5, 4, { ...vgaDefaults, horizontal: 0.2 }, sample);
    assert.ok(radiance > 0.38); // pow(mean drive=.5,2.2) would be about .218.
    assert.ok(radiance < 0.5);
});
