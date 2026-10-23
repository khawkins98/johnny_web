import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveScale } from './scaling.mjs';

test('Auto changes at both device-space fit thresholds', () => {
    assert.equal(resolveScale(959,720,2).scale,1);
    assert.equal(resolveScale(960,719,2).scale,1);
    assert.equal(resolveScale(960,720,2).scale,1.5);
    assert.equal(resolveScale(1000,750,1).scale,1);
    assert.equal(resolveScale(1000,750,2).scale,1.5);
});
test('fractional CSS stops are sharp only at compatible device ratios', () => {
    assert.equal(resolveScale(1200,900,2,'1.5').sharp,true);
    assert.equal(resolveScale(1200,900,1,'1.5').sharp,false);
    assert.equal(resolveScale(1200,900,2,'1.2').sharp,false);
});
test('all contained modes preserve 4:3 and fit small/odd viewports at multiple DPRs', () => {
    for (const [w,h] of [[375,667],[667,375],[319,239],[641,481],[1000,750]])
        for (const dpr of [1,1.1,1.25,1.5,2])
            for (const mode of ['auto','native','fit','1.2','1.5','2']) {
                const r=resolveScale(w,h,dpr,mode);
                assert.ok(r.x>=-1e-8 && r.y>=-1e-8, JSON.stringify({w,h,dpr,mode,r}));
                assert.ok(r.x+r.width<=w+1e-8 && r.y+r.height<=h+1e-8);
                assert.ok(Math.abs(r.width/r.height-4/3)<1e-8);
                assert.ok(Math.abs(r.x*dpr-Math.round(r.x*dpr))<1e-8);
                assert.ok(Math.abs(r.y*dpr-Math.round(r.y*dpr))<1e-8);
            }
});
test('below one device pixel per source pixel uses smooth fit; explicit request survives externally', () => {
    const r=resolveScale(375,667,1,'auto'); assert.equal(r.sharp,false); assert.equal(r.width,375);
    assert.equal(resolveScale(375,667,2,'auto').width,320);
    assert.ok(resolveScale(375,667,2,'native').scale<1);
    assert.equal(resolveScale(1000,750,2,'native').scale,1);
});
