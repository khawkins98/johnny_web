import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseGuestPreset,guestDimensions,guestParameters,translateGuest } from './guest-translate.mjs';
const root=new URL('./vendor/guest-hd/crt/',import.meta.url);
const graph=parseGuestPreset(fs.readFileSync(new URL('crt-guest-advanced-hd.slangp',root),'utf8'));
const sources=graph.map(pass=>fs.readFileSync(new URL(pass.path,root),'utf8'));
test('pinned Guest pipeline retains twelve passes, formats and mixed dimensions',()=>{
    assert.equal(graph.length,12);assert.equal(graph[3].mipmap,true);
    let size=[640,480];const sizes=graph.map(pass=>size=guestDimensions(pass,size,[1280,960]));
    assert.deepEqual(sizes[5],[1280,480]);assert.deepEqual(sizes[7],[800,600]);assert.deepEqual(sizes[8],[800,600]);assert.deepEqual(sizes[11],[1280,960]);
    assert.equal(graph.filter(p=>p.float).length,7);
});
test('Guest uniforms get source defaults including zero/negative values',()=>{
    const parameters=guestParameters(sources);assert.ok(parameters.size>100);
    assert.equal(parameters.get('interm').value,4);assert.equal(parameters.get('warpX').value,0);
    assert.equal(parameters.get('PR').value,.32);assert.equal(parameters.get('CP').min,-1);
});
test('translation preserves custom vertex stages and moves dynamic globals into main',()=>{
    const translated=sources.map(translateGuest);
    assert.ok(translated.every(p=>p.vertex.startsWith('#version 300 es')&&p.fragment.startsWith('#version 300 es')));
    assert.match(translated[5].vertex,/TexCoord \* 1\.00001/);
    assert.doesNotMatch(translated[5].fragment,/layout\(push_constant/);
    assert.match(translated[5].fragment,/float invsqrsigma;/);
    assert.match(translated[5].fragment,/void main\(\)\s*\{[\s\S]*invsqrsigma=/);
    assert.doesNotMatch(translated[11].fragment,/0\.0\.xxx|csize\.xx/);
});

test('Guest scheduler retains 60Hz average across common high refresh rates',async()=>{
    const {guestDeadline}=await import('./guest-clock.mjs');
    for(const refresh of [60,75,120,144,165,240]){
        let deadline=0,count=0;for(let n=0;n<refresh*10;n++){const next=guestDeadline(n*1000/refresh,deadline);deadline=next.deadline;if(next.render)count++}
        assert.ok(Math.abs(count-600)<=1,`${refresh}Hz: ${count} frames in 10 seconds`);
    }
});
