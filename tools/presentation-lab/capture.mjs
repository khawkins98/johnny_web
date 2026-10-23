#!/usr/bin/env node
// Requires agent-browser on PATH and a local Vite server. Publishes synthetic pixels only.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.LAB_URL || 'http://127.0.0.1:5174';
const session = execFileSync('agent-browser',['session','id','--scope','worktree','--prefix','presentation-captures'],{encoding:'utf8'}).trim();
const run = (...args) => execFileSync('agent-browser',['--session',session,...args],{encoding:'utf8'}).trim();
const destination = process.env.LAB_CAPTURE_DIR || 'docs/images/presentation-lab'; mkdirSync(destination,{recursive:true});
const cases = [
    ['fit-dpr1','fit','none',1,1000,750],
    ['leaked-filter-dpr1','legacy','none',1,1000,750],
    ['auto-dpr1','auto','none',1,1000,750],
    ['explicit-1.2-dpr2','1.2','none',2,1000,750],
    ['auto-dpr2','auto','none',2,1000,750],
    ['crt-dpr2','auto','crt',2,1000,750],
    ['fallback-dpr2','auto','unavailable',2,1000,750],
    ['auto-dpr1.25','auto','none',1.25,1000,750],
    ['small-dpr2','auto','none',2,375,667],
    ['small-raster-dpr2','auto','raster',2,375,667],
];
const results = [];
try {
    for (const [name,mode,effect,dpr,width,height] of cases) {
        run('open',`${base}/tools/presentation-lab/?mode=${mode}&effect=${effect}&width=${width}&height=${height}&frozen=1`);
        run('set','viewport','1120','1150',String(dpr));
        run('eval','presentationLab.configure(); presentationLab.resetMetrics()');
        run('wait','--fn','window.presentationLab.sampleCount() >= 180');
        const metrics = JSON.parse(run('eval','JSON.stringify(window.presentationLab.metrics())'));
        const result = {name,...JSON.parse(metrics)};
        assert.equal(result.dpr,dpr);
        // DOMRect translation coordinates have float precision; allow <0.0001 device px.
        assert.ok(result.layoutDeviceOrigin.every(value => Math.abs(value-Math.round(value)) < 1e-4));
        assert.ok(result.geometry.width <= width && result.geometry.height <= height);
        if (results.length) assert.equal(result.sourceHash,results[0].sourceHash);
        assert.equal(Boolean(result.failure),effect === 'unavailable');
        if (!results.length) {
            const url=JSON.parse(run('eval','presentationLab.source.toDataURL()'));
            writeFileSync(`${destination}/native-fixture.png`,Buffer.from(url.split(',')[1],'base64'));
        }
        results.push(result);
        run('screenshot',`${destination}/${name}.png`);
        process.stdout.write(`${name}: captured\n`);
    }
    writeFileSync(`${destination}/metrics.json`,JSON.stringify({note:'Frozen synthetic source; short headless runs; CPU submission only, not GPU/total engine cost. DPR emulation is not real browser zoom.',results},null,2)+'\n');
} finally { run('close'); }
