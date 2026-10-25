#!/usr/bin/env node
// Real Chromium/WebGL lifecycle checks; no original game files required.
import { execFileSync } from 'node:child_process';
const base = process.env.LAB_URL || 'http://127.0.0.1:5173';
const session = execFileSync('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'crt-integration'], { encoding: 'utf8' }).trim();
const run = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8' }).trim();
const evaluate = code => JSON.parse(execFileSync('agent-browser', ['--session', session, 'eval', '--stdin'], { encoding: 'utf8', input: code }));
try {
    run('open', `${base}/tools/presentation-lab/production-check.html`);
    run('set', 'viewport', '1500', '1200', process.env.CRT_DPR || '1');
    console.log(JSON.stringify(evaluate(`(async () => {
        const assert = (value, message) => { if (!value) throw Error(message); };
        const frames = async () => { for(let i=0;i<3;i++) await new Promise(requestAnimationFrame); };
        const waitFor = async condition => { for(let i=0;i<180;i++) { if(condition()) return; await new Promise(requestAnimationFrame); } throw Error('Timed out waiting for GPU recovery'); };
        const root = document.querySelector('#root');
        const active = () => root.classList.contains('jc-crt-active');
        const nativeHash = () => ['mainCanvas','canvas'].map(id => {
            const c=document.getElementById(id), pixels=c.getContext('2d').getImageData(0,0,640,480).data;
            let h=2166136261; for(const p of pixels) h=Math.imul(h^p,16777619)>>>0; return h;
        });
        const before = nativeHash();
        assert(!document.querySelector('#johnny-crt-output'), 'Off must allocate no GPU canvas');
        crtCheck.controller.update(true, crtCheck.presets.balanced); await frames();
        assert(active(), crtCheck.status);
        const output=document.querySelector('#johnny-crt-output');
        const firstSize=[output.width,output.height];
        root.style.width='320px'; root.style.height='240px'; await frames();
        assert(output.width===Math.round(320*devicePixelRatio), 'Resize did not update GPU dimensions');
        root.style.display='none'; await frames(); assert(!active(), 'Hidden source must reveal baseline');
        root.style.display='block'; await frames(); assert(active(), 'Zero-size recovery failed');
        document.querySelector('#data-error').classList.add('visible'); await frames();
        assert(!active(), 'CRT must not cover data-import UI');
        document.querySelector('#data-error').classList.remove('visible'); await frames(); assert(active(), 'Import UI recovery failed');
        crtCheck.controller.update(true, {...crtCheck.presets.balanced,bypass:true}); await frames();
        assert(!active() && output.hidden, 'Bypass must reveal source');
        window.dispatchEvent(new PageTransitionEvent('pagehide'));
        window.dispatchEvent(new PageTransitionEvent('pageshow')); await frames();
        assert(!active()&&!document.querySelector('#johnny-crt-output'),'Bypassed bfcache resume allocated output');
        crtCheck.controller.update(true, crtCheck.presets.balanced); await frames();
        const currentGl=document.querySelector('#johnny-crt-output').getContext('webgl');
        const currentOutput=document.querySelector('#johnny-crt-output');
        const extension=currentGl.getExtension('WEBGL_lose_context'); assert(extension, 'Loss extension unavailable');
        extension.loseContext(); await waitFor(()=>!active()); assert(currentOutput.hidden, 'Context loss must reveal source');
        extension.restoreContext(); await waitFor(active);
        assert(JSON.stringify(nativeHash())===JSON.stringify(before), 'CRT mutated native pixels');
        const restoredStatus=crtCheck.status;
        window.dispatchEvent(new PageTransitionEvent('pagehide')); assert(!active()&&!document.querySelector('#johnny-crt-output'),'pagehide leaked output');
        window.dispatchEvent(new PageTransitionEvent('pageshow')); await frames(); assert(active(),'bfcache resume failed');
        crtCheck.controller.update(false, crtCheck.presets.balanced);
        assert(!active()&&!document.querySelector('#johnny-crt-output'),'Off leaked output');
        const original=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args)};
        crtCheck.controller.update(true,crtCheck.presets.balanced); await frames();
        assert(!active()&&crtCheck.status.includes('normal picture'),'No-WebGL fallback failed');
        HTMLCanvasElement.prototype.getContext=original;
        crtCheck.controller.update(false,crtCheck.presets.balanced);
        crtCheck.controller.update(true,crtCheck.presets.balanced); await frames(); assert(active(),'Retry failed');
        crtCheck.controller.update(false,crtCheck.presets.balanced);
        let deletedShaders=0;
        HTMLCanvasElement.prototype.getContext=function(type,...args){
            const value=original.call(this,type,...args);
            if(type!=='webgl'||!value) return value;
            return new Proxy(value,{get(target,key){
                if(key==='getShaderParameter') return ()=>false;
                if(key==='getShaderInfoLog') return ()=>'Forced compile failure';
                if(key==='deleteShader') return shader=>{deletedShaders++;target.deleteShader(shader)};
                const member=target[key]; return typeof member==='function'?member.bind(target):member;
            }});
        };
        crtCheck.controller.update(true,crtCheck.presets.balanced); await frames();
        assert(!active()&&deletedShaders>0&&crtCheck.status.includes('Forced compile failure'),'Compile failure leaked shader or hid baseline');
        HTMLCanvasElement.prototype.getContext=original;
        crtCheck.controller.update(false,crtCheck.presets.balanced);
        crtCheck.controller.update(true,crtCheck.presets.balanced); await frames(); assert(active(),'Compile failure retry failed');
        const {vgaDefaults}=await import('../../src/games/johnny/ui/crt/vga-model.mjs');
        const modelChecks=[];
        for(const [model,settings]of [['vga',vgaDefaults],['lottes',{maskType:3,bloom:.15}]]){
            crtCheck.controller.update(true,{...settings,model});await frames();assert(active(),model+' activation failed: '+crtCheck.status);
            const output=document.querySelector('#johnny-crt-output'),gl=output.getContext('webgl'),extension=gl.getExtension('WEBGL_lose_context');
            assert(output.width>0&&output.height>0,model+' dimensions invalid');
            extension.loseContext();await waitFor(()=>!active());extension.restoreContext();await waitFor(active);
            if(model==='vga'){
                root.style.width=(80/devicePixelRatio)+'px';root.style.height=(60/devicePixelRatio)+'px';await frames();assert(!active(),'Small VGA should reveal baseline');
                root.style.width='320px';root.style.height='240px';await frames();assert(active(),'Small VGA recovery failed');
            }
            assert(JSON.stringify(nativeHash())===JSON.stringify(before),model+' changed native pixels');
            modelChecks.push(model);
        }
        crtCheck.controller.dispose(); assert(!active()&&!document.querySelector('#johnny-crt-output'),'Dispose leaked output');
        const {setupCrtSettings}=await import('../../src/games/johnny/ui/crt/settings.mjs');
        const controls=document.createElement('section');document.body.append(controls);
        const settingsController=setupCrtSettings(controls),setItem=Storage.prototype.setItem;
        try{
            Storage.prototype.setItem=function(){throw Error('Forced quota failure')};
            const enabled=controls.querySelector('#jc-crt-enabled');enabled.checked=true;enabled.dispatchEvent(new Event('change'));
            await frames();assert(active(),'Failed save should not disable the usable CRT picture');
            const warning=controls.querySelector('[data-crt-save-status]');
            assert(!warning.hidden&&warning.textContent.includes('could not be saved'),'Renderer activation erased save failure');
            Storage.prototype.setItem=setItem;
            enabled.checked=false;enabled.dispatchEvent(new Event('change'));await frames();
            assert(warning.hidden&&!warning.textContent,'Successful save did not clear stale warning');
        }finally{Storage.prototype.setItem=setItem;settingsController.dispose();controls.remove()}

        return {firstSize,modelChecks, nativeHashes:before, restoredStatus, checks:['default off','resize','zero-size recovery','import UI','bypass','context loss/restoration','native pixels unchanged','pagehide/pageshow','off cleanup','no-WebGL fallback/retry','compile failure cleanup/retry','dispose','save warning survives renderer activation and clears on recovery']};
    })()`), null, 2));
} finally { run('close'); }
