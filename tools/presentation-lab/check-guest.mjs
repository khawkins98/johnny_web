#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
const base=process.env.LAB_URL||'http://127.0.0.1:5173';
const session=execFileSync('agent-browser',['session','id','--scope','worktree','--prefix','guest-checks'],{encoding:'utf8'}).trim();
const run=(...args)=>execFileSync('agent-browser',['--session',session,...args],{encoding:'utf8'}).trim();
const evaluate=code=>JSON.parse(execFileSync('agent-browser',['--session',session,'eval','--stdin'],{encoding:'utf8',input:code}));
try{
    run('open',base+'/tools/presentation-lab/?view=guest&effect=guest&mode=native&width=640&height=480&frozen=1');
    run('set','viewport','1500','1200','2');
    console.log(JSON.stringify(evaluate(`(async()=>{
        const assert=(condition,message)=>{if(!condition)throw Error(message)};
        const wait=()=>new Promise(r=>setTimeout(r,25));
        for(let i=0;i<120;i++){if(window.presentationLab?.metrics().panels?.at(-1)?.guest?.renderedFrames)break;await wait()}
        const lab=presentationLab.metrics(),panel=lab.panels.at(-1);
        assert(!panel.failure,panel.failure);assert(panel.guest.passes===12,'Missing Guest passes');
        assert(panel.guest.targets.filter(p=>p.format==='RGBA16F').length===7,'Float formats lost');
        assert(panel.guest.targets[5].size[0]===1280&&panel.guest.targets[5].size[1]===480,'Mixed source/viewport dimensions wrong');
        const frozenFrame=panel.guest.renderedFrames;await wait();assert(presentationLab.metrics().panels.at(-1).guest.renderedFrames===frozenFrame,'Frozen Guest keeps rendering');
        const {createGuest,sanitizeGuest}=await import('./guest.mjs');assert(sanitizeGuest({TNTC:4}).TNTC===0,'Unverified LUT profiles not locked off');
        const source=document.createElement('canvas');source.width=640;source.height=480;const ctx=source.getContext('2d');
        const canvas=document.createElement('canvas');let failure='';const renderer=createGuest(canvas,message=>failure=message);
        const frozen={profile:'progressive',frozen:true,epoch:1};
        ['#f00','#0f0','#00f','#fff'].forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(i%2*320,Math.floor(i/2)*240,320,240)});
        renderer.draw(source,640,480,frozen);
        const gl=canvas.getContext('webgl2');
        const pixel=(x,y)=>{const p=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p]};
        const corners=[pixel(160,360),pixel(480,360),pixel(160,120),pixel(480,120)];
        for(let i=0;i<3;i++)assert(corners[i][i]>corners[i][(i+1)%3]+30,'Corner orientation/color mismatch '+i+': '+corners[i]);
        const diagnostics=renderer.diagnostics();assert(diagnostics.error===0&&diagnostics.readbackError===0,'GL error in pipeline/readbacks');
        assert(diagnostics.passes[0].samples[0][0]>.9,'Stock pass source orientation wrong');
        const hash=()=>{const p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);let h=2166136261;for(const x of p)h=Math.imul(h^x,16777619)>>>0;return h.toString(16)};
        const hash1=hash();renderer.draw(source,640,480,{...frozen,epoch:2});assert(hash()===hash1,'Reset capture is not deterministic');
        ctx.fillStyle='white';ctx.fillRect(0,0,640,480);
        const moving={profile:'upstream',frozen:false,epoch:3};
        renderer.draw(source,640,480,moving);await wait();renderer.draw(source,640,480,moving);
        const lit=renderer.diagnostics().passes[2].samples[4];
        ctx.fillStyle='black';ctx.fillRect(0,0,640,480);
        for(let i=0;i<3;i++){await wait();renderer.draw(source,640,480,moving)}
        const trail=renderer.diagnostics().passes[2].samples[4];
        assert(lit[0]>.9&&lit[3]>.9,'Previous-source history/alpha not preserved');
        assert(trail[0]>0&&trail[0]<lit[0]&&trail[3]===0,'Feedback decay/alpha not preserved');
        renderer.draw(source,640,480,{profile:'progressive',frozen:true,epoch:4});
        const reset=renderer.diagnostics().passes[2].samples[4];assert(reset.every(v=>v===0),'History reset was not black/transparent');
        const extension=gl.getExtension('WEBGL_lose_context');extension.loseContext();await wait();assert(failure.includes('lost'),'Guest context loss not surfaced');renderer.dispose();
        const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args)};
        let fallback=false;try{createGuest(document.createElement('canvas'),()=>{})}catch(error){fallback=error.message.includes('WebGL2')}
        HTMLCanvasElement.prototype.getContext=original;assert(fallback,'Missing WebGL2 fallback failed');
        document.getElementById('view').value='single';
        for(const effect of ['guest','vga','lottes','crt','guest']){document.getElementById('effect').value=effect;presentationLab.configure();for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);assert(!presentationLab.metrics().failure,'Context-type switching failed: '+effect+' '+presentationLab.metrics().failure)}
        assert(presentationLab.metrics().sourceHash===lab.sourceHash,'Pipeline mutated the source');
        document.getElementById('lose').click();await wait();assert(presentationLab.metrics().failure.includes('lost'),'Lab Guest fallback failed');
        return {checks:['12 passes','7 float targets','mixed dimensions','frozen reset capture','LUT profiles off','asymmetric corners','no GL errors','deterministic reset','previous-source history','feedback decay/alpha','history clear','context loss','no WebGL2 fallback','WebGL1/2 model switching','source unchanged'],corners,lit,trail,reset,pipeline:panel.guest};
    })()`),null,2));
}finally{run('close')}
