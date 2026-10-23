#!/usr/bin/env node
// Actual GPU checks against the synthetic fixture; requires agent-browser + WebGL.
import { execFileSync } from 'node:child_process';
const base = process.env.LAB_URL || 'http://127.0.0.1:5173';
const session = execFileSync('agent-browser', ['session','id','--scope','worktree','--prefix','crt-checks'], {encoding:'utf8'}).trim();
const run = (...args) => execFileSync('agent-browser', ['--session',session,...args], {encoding:'utf8'}).trim();
const evaluate = code => JSON.parse(execFileSync('agent-browser', ['--session',session,'eval','--stdin'], {encoding:'utf8',input:code}));
try {
    run('open', `${base}/tools/presentation-lab/?effect=crt&mode=native&width=640&height=480&frozen=1`);
    run('set','viewport','1600','1250','1');
    const individual = evaluate(`(async () => {
        window.nextFrames = async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); };
        window.outputHash = () => {
            const c=document.querySelector('#viewport canvas:last-child'),g=c.getContext('webgl');
            const pixels=new Uint8Array(c.width*c.height*4);
            g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,pixels);
            let hash=2166136261;
            for(let y=c.height-1;y>=0;y--) for(let x=0;x<c.width*4;x++) hash=Math.imul(hash^pixels[y*c.width*4+x],16777619)>>>0;
            return hash.toString(16).padStart(8,'0');
        };
        await nextFrames();
        if(presentationLab.metrics().failure) throw Error(presentationLab.metrics().failure);
        document.getElementById('crt-preset-neutral').click(); await nextFrames();
        const source=presentationLab.metrics().sourceHash,neutral=outputHash();
        if(neutral!==source) throw Error('Neutral pass differs from native source');
        const results=[];
        for(const [key,value] of [['blur',1],['bleed',2],['bloom',0.5],['curvature',0.2],['vignette',0.4]]) {
            document.getElementById('crt-preset-neutral').click();
            document.getElementById('crt-'+key+'-enabled').click();
            const slider=document.getElementById('crt-'+key); slider.value=value; slider.dispatchEvent(new Event('input',{bubbles:true}));
            await nextFrames();
            const hash=outputHash(),m=presentationLab.metrics();
            if(hash===neutral || m.sourceHash!==source || m.failure) throw Error(key+' check failed');
            results.push({effect:key,value,outputHash:hash,sourceHash:m.sourceHash});
        }
        document.getElementById('crt-preset-neutral').click();
        document.getElementById('crt-scanlines-enabled').click(); await nextFrames();
        if(outputHash()!==neutral) throw Error('Scanlines should fade out at density 1');
        return {sourceHash:source,neutralMatchesSource:true,individualEffects:results,scanlinesFadeAtDensity1:true};
    })()`);
    run('set','viewport','1600','1250','2');
    const shared = evaluate(`(async () => {
        await nextFrames(); document.getElementById('crt-preset-neutral').click(); await nextFrames();
        const neutral=outputHash(); document.getElementById('crt-scanlines-enabled').click(); await nextFrames();
        if(outputHash()===neutral) throw Error('Scanlines missing at density 2');
        const scanCanvas=document.querySelector('#viewport canvas:last-child'),scanGl=scanCanvas.getContext('webgl');
        const first=new Uint8Array(4),second=new Uint8Array(4);
        scanGl.readPixels(200,scanCanvas.height-1-200,1,1,scanGl.RGBA,scanGl.UNSIGNED_BYTE,first);
        scanGl.readPixels(200,scanCanvas.height-1-201,1,1,scanGl.RGBA,scanGl.UNSIGNED_BYTE,second);
        if(first.every((v,i)=>v===second[i])) throw Error('Even-pitch scanlines only darken the image');
        document.getElementById('crt-preset-soft').click(); await nextFrames();
        const before=outputHash(),settings=presentationLab.metrics().crtSettings;
        document.getElementById('crt-bypass').click(); await nextFrames();
        const canvases=[...document.querySelectorAll('#viewport canvas')];
        if(canvases[0].hidden || !canvases[2].hidden) throw Error('Bypass did not reveal baseline');
        document.getElementById('crt-bypass').click(); await nextFrames();
        if(outputHash()!==before) throw Error('Bypass did not retain the effect');
        document.getElementById('view').value='compare'; document.getElementById('view').dispatchEvent(new Event('change')); await nextFrames();
        const m=presentationLab.metrics();
        if(m.panels.length!==4 || m.panels.some(p=>p.failure || JSON.stringify(p.crt)!==JSON.stringify(settings))) throw Error('Card settings differ');
        const outputs=[...document.querySelectorAll('#comparisons .stage canvas:last-child')];
        const canLose=outputs.every(c=>c.getContext('webgl').getExtension('WEBGL_lose_context'));
        if(canLose) {
            document.getElementById('lose').click(); await nextFrames();
            if(presentationLab.metrics().panels.some(p=>!p.failure.includes('lost'))) throw Error('Missing context-loss fallback');
        }
        return {scanlinesAtDensity2:true,evenPitchRowsDiffer:true,bypassRetainsSettings:true,sharedCards:m.panels.length,settings,contextLoss:canLose?'all cards fell back':'extension unavailable'};
    })()`);
    process.stdout.write(JSON.stringify({individual,shared},null,2)+'\n');
} finally { run('close'); }
