#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
const base = process.env.LAB_URL || 'http://127.0.0.1:5173';
const session = execFileSync('agent-browser', ['session','id','--scope','worktree','--prefix','vga-checks'], {encoding:'utf8'}).trim();
const run = (...args) => execFileSync('agent-browser', ['--session',session,...args], {encoding:'utf8'}).trim();
const evaluate = code => JSON.parse(execFileSync('agent-browser', ['--session',session,'eval','--stdin'], {encoding:'utf8',input:code}));
try {
    run('open', `${base}/tools/presentation-lab/?view=models&effect=vga&mode=native&width=640&height=480&frozen=1`);
    run('set','viewport','1500','1200','1');
    const results = evaluate(`(async () => {
        const assert=(condition,message)=>{if(!condition) throw Error(message)};
        const frames=async()=>{for(let i=0;i<3;i++) await new Promise(requestAnimationFrame)};
        const {decodeSrgb}=await import('./vga-reference.mjs');
        const source=presentationLab.source,context=source.getContext('2d'),original=context.getImageData(0,0,640,480);
        const initialHash=presentationLab.metrics().sourceHash;
        await frames();
        assert(presentationLab.metrics().panels.every(p=>!p.failure),'Renderer compilation failed');
        const modelHashes=[...document.querySelectorAll('#comparisons .stage canvas:last-child')].slice(1).map(c=>{
            const g=c.getContext('webgl'),pixels=new Uint8Array(c.width*c.height*4);g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,pixels);
            let h=2166136261,sum=0;for(let i=0;i<pixels.length;i++){h=Math.imul(h^pixels[i],16777619)>>>0;if(i%4!==3)sum+=pixels[i]}
            assert(sum>0,'Model rendered a black frame');return h.toString(16);
        });
        assert(new Set(modelHashes).size===3,'The three CRT models must produce distinct outputs');
        const initialPanels=presentationLab.metrics().panels.map(p=>({label:p.label,effect:p.effect,size:p.glSize}));
        const set=(id,value)=>{const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))};
        const size=(width,height)=>{
            document.getElementById('view').value='single';document.getElementById('effect').value='vga';document.getElementById('mode').value='fit';
            document.getElementById('width').value=width;document.getElementById('height').value=height;presentationLab.configure();
        };
        const gray=value=>{context.fillStyle='rgb('+value+','+value+','+value+')';context.fillRect(0,0,640,480)};
        const read=()=>{
            const c=document.querySelector('#viewport canvas:last-child'),g=c.getContext('webgl'),p=new Uint8Array(c.width*c.height*4);
            g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,p);
            return {pixels:p,width:c.width,height:c.height};
        };
        const stats=()=>{
            const {pixels,width,height}=read();let sum=0, count=0,clipped=0; const rows=[];
            for(let y=Math.floor(height/2)-16;y<Math.floor(height/2)+16;y++){
                let row=0;
                for(let x=Math.floor(width/2)-16;x<Math.floor(width/2)+16;x++){
                    const value=pixels[(y*width+x)*4];row+=decodeSrgb(value/255);clipped+=value===255;count++;
                }
                rows.push(row/32);sum+=row;
            }
            return {mean:sum/count,contrast:(Math.max(...rows)-Math.min(...rows))/(Math.max(...rows)+Math.min(...rows)),clipped};
        };
        const hash=()=>{let h=2166136261;for(const p of read().pixels)h=Math.imul(h^p,16777619)>>>0;return h.toString(16)};
        size(1280,960); set('vga-mask',0);set('vga-input','drive');set('vga-horizontal',.35);set('vga-beam',.32);set('vga-growth',.06);set('vga-gamma',2.2);set('vga-exposure',.9);set('vga-phase',.25);
        const grayResults=[];
        for(const value of [32,128,224,255]){
            gray(value);await frames();const measured=stats(),expected=Math.pow(value/255,2.2)*.9;
            assert(Math.abs(measured.mean-expected)<.004,'Gray light error '+value+': '+JSON.stringify(measured));
            if(value===255) assert(measured.clipped===0,'Neutral defaults clipped the white field');
            grayResults.push({drive:value,expected,...measured});
        }
        size(640,480);gray(128);set('vga-input','srgb');await frames();const srgb=stats();
        assert(Math.abs(srgb.mean-decodeSrgb(128/255)*.9)<.004,'sRGB reference transfer failed');
        set('vga-input','drive');size(1280,960);
        gray(128);set('vga-phase',0);await frames();const phase0=stats();set('vga-phase',.25);await frames();const phaseQuarter=stats();
        assert(phaseQuarter.contrast>phase0.contrast+.02,'Raster phase did not change resolved beam profile');
        assert(Math.abs(phaseQuarter.mean-phase0.mean)<.004,'Raster phase changed average light excessively');
        gray(224);set('vga-exposure',.5);set('vga-growth',0);await frames();const narrow=stats();set('vga-growth',.15);await frames();const wide=stats();
        assert(wide.contrast<narrow.contrast,'Bright-beam widening did not fill line gaps');
        set('vga-triads',640);set('vga-mask',0);await frames();const maskOff=hash();set('vga-mask',.35);await frames();
        assert(hash()===maskOff,'Unresolved mask must average out exactly at 2 px/triad');
        set('vga-triads',320);await frames();assert(hash()!==maskOff,'Resolved mask was not visible');
        size(160,120);set('vga-mask',0);set('vga-horizontal',.2);set('vga-growth',0);set('vga-phase',0);set('vga-exposure',.5);
        for(let x=0;x<640;x++){context.fillStyle=x%2?'white':'black';context.fillRect(x,0,1,480)}
        await frames();const checker=stats();
        const {lineRadiance}=await import('./vga-reference.mjs');
        const expectedChecker=lineRadiance(1.5,4,presentationLab.metrics().vgaSettings,x=>((x%2)+2)%2)*.5;
        assert(Math.abs(checker.mean-expectedChecker)<.004,'Downsampled drive/light integration differs from reference');
        set('vga-horizontal',.8);set('vga-beam',.55);set('vga-growth',.15);await frames();assert(!presentationLab.metrics().failure,'Extreme supported settings failed');
        // Restore source and settings for distinct-model/shared-input and fallback checks.
        context.putImageData(original,0,0);document.querySelector('#vga-controls button').click();
        document.getElementById('view').value='models';document.getElementById('mode').value='native';document.getElementById('width').value=640;document.getElementById('height').value=480;presentationLab.configure();await frames();
        assert(presentationLab.metrics().sourceHash===initialHash,'Shader changed native source');
        for(const effect of ['vga','lottes']){
            document.getElementById('view').value='compare';document.getElementById('comparison-set').value='fractional';document.getElementById('effect').value=effect;presentationLab.configure();await frames();
            assert(presentationLab.metrics().panels.length===4&&presentationLab.metrics().panels.every(p=>!p.failure),'Fractional ladder failed for '+effect);
        }
        document.getElementById('view').value='models';presentationLab.configure();await frames();
        document.getElementById('lose').click();await frames();
        assert(presentationLab.metrics().panels.filter(p=>p.failure).length===3,'All three GL models must fall back after context loss');
        return {initialPanels,modelHashes,grayResults,srgb,phase0,phaseQuarter,narrow,wide,checker:{...checker,expected:expectedChecker},sourceHash:initialHash,checks:['four distinct model stages','gray transfer and light average','default white headroom','phase contrast/mean','intensity beam widening','unresolved/resolved mask','quarter-size radiance reference','supported parameter extremes','both fractional ladders','source unchanged','all GL fallbacks']};
    })()`);
    console.log(JSON.stringify(results,null,2));
} finally { run('close'); }
