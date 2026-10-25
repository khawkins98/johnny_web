/** Guest Advanced HD browser port. GPL-2.0-or-later; upstream notices retained.
 * Full corresponding source, adapter changes and limitations: vendor/guest-hd/README.md.
 */
import { guestDeadline } from './guest-clock.mjs';
import presetText from './vendor/guest-hd/crt/crt-guest-advanced-hd.slangp?raw';
import { parseGuestPreset, guestDimensions, guestParameters, translateGuest } from './guest-translate.mjs';
const files = import.meta.glob('./vendor/guest-hd/crt/shaders/guest/hd/*.slang', { query:'?raw', import:'default', eager:true });
const graph = parseGuestPreset(presetText);
const sources = graph.map(pass => files[`./vendor/guest-hd/crt/${pass.path}`]);
export const guestParameterList = guestParameters(sources);
// These retained struct fields are unused by upstream (or replaced by constants).
const defaults = { GLOW_MAX:0, inters:0, prescalex:0, deconr:0, LUTLOW:5, LUTBR:1, ...Object.fromEntries([...guestParameterList].map(([key,p])=>[key,p.value])) };
export function sanitizeGuest(input = {}) {
    const profile = input.profile === 'upstream' ? 'upstream' : 'progressive';
    const values = { ...defaults, ...(profile === 'progressive' ? { interm:0, inter:800, AS:0, PR:0,PG:0,PB:0 } : {}) };
    for (const [key,p] of guestParameterList) if (Number.isFinite(input[key])) values[key] = Math.max(p.min,Math.min(p.max,input[key]));
    values.TNTC=0; // Optional image-LUT provenance is unresolved; preserve default off.
    return { ...values, profile, bypass:input.bypass===true, frozen:input.frozen===true, epoch:Number.isFinite(input.epoch)?input.epoch:0 };
}
const identity = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const vectorSize = target => [target.width,target.height,1/target.width,1/target.height];
export function createGuest(canvas, onFailure) {
    const gl = canvas.getContext('webgl2', { alpha:false, antialias:false, preserveDrawingBuffer:true });
    if (!gl) throw Error('Guest HD needs WebGL2 · unfiltered fallback');
    if (!gl.getExtension('EXT_color_buffer_float')) { gl.getExtension('WEBGL_lose_context')?.loseContext(); throw Error('Guest HD needs renderable float buffers · unfiltered fallback'); }
    const resources=[], targets=[]; let feedback, originals, allocatedKey='', signature='', frame=0, originalIndex=0, feedbackIndex=0, lastTime=0, nextTime=0, renderTimes=[], disposed=false, failure='', samplersReady=false, bytes=0;
    const track=(kind,value)=>{resources.push([kind,value]);return value};
    const limit=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
    const lost=event=>{event.preventDefault();failure='WebGL2 context lost';onFailure(failure)};
    canvas.addEventListener('webglcontextlost',lost);
    function compile(type,text,label){const s=track('Shader',gl.createShader(type));gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(`${label}: ${gl.getShaderInfoLog(s)}`);return s}
    function program(vertex,fragment,label){const p=track('Program',gl.createProgram());gl.attachShader(p,compile(gl.VERTEX_SHADER,vertex,label+' vertex'));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fragment,label+' fragment'));gl.bindAttribLocation(p,0,'Position');gl.bindAttribLocation(p,1,'TexCoord');gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(label+': '+gl.getProgramInfoLog(p));return p}
    function texture(width,height,floating=false){
        const t=track('Texture',gl.createTexture());gl.bindTexture(gl.TEXTURE_2D,t);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,floating?gl.RGBA16F:gl.RGBA8,width,height,0,gl.RGBA,floating?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
        return { texture:t,width,height,floating };
    }
    function target(width,height,floating=false){
        const t=texture(width,height,floating);t.framebuffer=track('Framebuffer',gl.createFramebuffer());
        gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.texture,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Guest float framebuffer incomplete');
        return t;
    }
    const destroyTarget=t=>{gl.deleteTexture(t.texture);if(t.framebuffer)gl.deleteFramebuffer(t.framebuffer);const items=new Set([t.texture,t.framebuffer]);for(let i=resources.length-1;i>=0;i--)if(items.has(resources[i][1]))resources.splice(i,1)};
    const clearTarget=t=>{gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)};
    const reset=()=>{frame=0;nextTime=0;renderTimes=[];originalIndex=0;feedbackIndex=0;for(const t of [...targets,...(feedback||[]),...(originals||[])])if(t.framebuffer)clearTarget(t)};
    try {
        const programs=graph.map((pass,index)=>{const translated=translateGuest(sources[index]),p=program(translated.vertex,translated.fragment,`Guest pass ${index}`);return {program:p,uniforms:Array.from({length:gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS)},(_,i)=>gl.getActiveUniform(p,i)).map(u=>({name:u.name,type:u.type,size:u.size,location:gl.getUniformLocation(p,u.name)}))}});
        const display=program('#version 300 es\nin vec4 Position;in vec2 TexCoord;out vec2 uv;void main(){gl_Position=Position;uv=vec2(TexCoord.x,1.-TexCoord.y);}', '#version 300 es\nprecision highp float;in vec2 uv;uniform sampler2D image;out vec4 color;void main(){color=texture(image,uv);}', 'Guest display');
        const buffer=track('Buffer',gl.createBuffer());gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,0,1,0,0, 1,-1,0,1,1,0, -1,1,0,1,0,1, 1,1,0,1,1,1]),gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,24,16);
        // Inactive sampler placeholders only. Optional third-party LUT images are
        // intentionally not redistributed or sampled: TNTC is locked to upstream0.
        const luts=Object.fromEntries([1,2,3,4].map(i=>['SamplerLUT'+i,texture(1,1)]));
        samplersReady=true;
        const allocate=(width,height)=>{
            const key=width+'x'+height;if(key===allocatedKey)return;allocatedKey=key;
            for(const t of [...targets,...(feedback||[]),...(originals||[])])destroyTarget(t);targets.length=0;feedback=[];originals=[];
            let size=[640,480];bytes=0;
            for(const pass of graph){const next=guestDimensions(pass,size,[width,height]);if(next.some(n=>n>gl.getParameter(gl.MAX_TEXTURE_SIZE)))throw Error('Guest pass exceeds texture limit');bytes+=next[0]*next[1]*(pass.float?8:4);size=next}
            bytes+=640*480*16;if(bytes>128*1024*1024)throw Error('Guest HD exceeds 128 MiB target budget at this size');
            size=[640,480];for(const pass of graph){size=guestDimensions(pass,size,[width,height]);targets.push(target(...size,pass.float))}
            feedback=[target(640,480),target(640,480)];originals=[target(640,480),target(640,480)];reset();
        };
        const samplers=new Map();
        function samplerFor(linear,mipmap){
            const key=linear+':'+mipmap;if(samplers.has(key))return samplers.get(key);
            const s=track('Sampler',gl.createSampler());gl.samplerParameteri(s,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.samplerParameteri(s,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
            gl.samplerParameteri(s,gl.TEXTURE_MIN_FILTER,mipmap?(linear?gl.LINEAR_MIPMAP_LINEAR:gl.NEAREST_MIPMAP_NEAREST):(linear?gl.LINEAR:gl.NEAREST));
            gl.samplerParameteri(s,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);samplers.set(key,s);return s;
        }
        function drawPass(index,settings,source,aliases,out){
            const {program:p,uniforms}=programs[index],pass=graph[index];gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,out.framebuffer);gl.viewport(0,0,out.width,out.height);
            let unit=0;const bindings={...luts,...aliases,Source:source,Original:originals[originalIndex],OriginalHistory0:originals[1-originalIndex],AfterglowPassFeedback:feedback[1-feedbackIndex]};
            for(const u of uniforms){
                const key=u.name.split('.').at(-1);
                if(u.type===gl.SAMPLER_2D){const t=bindings[key];if(!t)throw Error(`Guest pass ${index}: missing sampler ${key}`);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t.texture);if(pass.mipmap&&!key.startsWith('SamplerLUT'))gl.generateMipmap(gl.TEXTURE_2D);gl.bindSampler(unit,samplerFor(key.startsWith('SamplerLUT')||pass.linear,!key.startsWith('SamplerLUT')&&pass.mipmap));gl.uniform1i(u.location,unit++);continue}
                if(u.type===gl.FLOAT_MAT4){gl.uniformMatrix4fv(u.location,false,identity);continue}
                if(key==='GuestLinear'){gl.uniform1i(u.location,pass.linear?1:0);continue}
                if(key==='FrameCount'){gl.uniform1ui(u.location,frame);continue}
                if(u.type===gl.FLOAT_VEC4){const t=key==='SourceSize'?source:key==='OriginalSize'?originals[originalIndex]:key==='OutputSize'?out:bindings[key.replace(/Size$/,'')];if(!t)throw Error(`Guest pass ${index}: unknown size ${key}`);gl.uniform4fv(u.location,vectorSize(t));continue}
                if(u.type===gl.FLOAT){if(!(key in settings))throw Error(`Guest parameter missing: ${key}`);gl.uniform1f(u.location,settings[key]);continue}
                throw Error('Unsupported Guest uniform '+u.name+' type '+u.type);
            }
            gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        }
        return {
            maxOutputSize:limit,
            draw(source,width,height,input){
                if(failure||gl.isContextLost())throw Error(failure||'Guest context lost');
                if(!samplersReady)return false;
                const ratio=Math.min(1,limit/width,limit/height);width=Math.max(1,Math.round(width*ratio));height=Math.max(1,Math.round(height*ratio));
                if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
                allocate(width,height);
                const settings=sanitizeGuest(input), next=JSON.stringify(settings);
                const changed=signature!==next;
                if(changed){signature=next;reset();lastTime=0}
                const now=performance.now();
                if(settings.frozen&&!changed&&frame>0)return true;
                if(lastTime&&now-lastTime>250)reset();
                const clock=guestDeadline(now,nextTime);
                if(!settings.frozen&&!clock.render)return true;
                nextTime=clock.deadline;lastTime=now;renderTimes.push(now);if(renderTimes.length>120)renderTimes.shift();
                gl.activeTexture(gl.TEXTURE0);gl.bindSampler(0,null);gl.bindTexture(gl.TEXTURE_2D,originals[originalIndex].texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
                let previous=originals[originalIndex];const aliases={};
                for(let i=0;i<graph.length;i++){const out=i===2?feedback[feedbackIndex]:targets[i];drawPass(i,settings,previous,aliases,out);previous=out;if(graph[i].alias)aliases[graph[i].alias]=out}
                gl.useProgram(display);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,previous.texture);gl.bindSampler(0,null);gl.uniform1i(gl.getUniformLocation(display,'image'),0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
                originalIndex=1-originalIndex;feedbackIndex=1-feedbackIndex;frame++;
                return true;
            },
            diagnostics(){
                const saved=gl.getParameter(gl.FRAMEBUFFER_BINDING);
                function samples(t){
                    gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffer);
                    return [[.25,.25],[.75,.25],[.25,.75],[.75,.75],[.5,.5]].map(([x,y])=>{
                        const pixel=t.floating?new Float32Array(4):new Uint8Array(4);
                        gl.readPixels(Math.floor(t.width*x),Math.floor(t.height*y),1,1,gl.RGBA,t.floating?gl.FLOAT:gl.UNSIGNED_BYTE,pixel);
                        return [...pixel].map(v=>t.floating?v:v/255);
                    });
                }
                try{return {error:gl.getError(),passes:targets.map((t,i)=>({index:i,samples:samples(i===2?feedback[1-feedbackIndex]:t)})),readbackError:gl.getError()}}
                finally{gl.bindFramebuffer(gl.FRAMEBUFFER,saved)}
            },
            metrics:()=>({passes:graph.length,frame:Math.max(0,frame-1),renderedFrames:frame,samplersReady,profile:signature?JSON.parse(signature).profile:null,estimatedTargetBytes:bytes,cadence:60,measuredCadence:renderTimes.length>1?(renderTimes.length-1)*1000/(renderTimes.at(-1)-renderTimes[0]):null,lutProfiles:'disabled: TNTC=0 (upstream default); provenance unresolved',border:'emulated black; base-level nearest/linear',targets:targets.map((t,i)=>({index:i,alias:graph[i].alias,size:[t.width,t.height],format:t.floating?'RGBA16F':'RGBA8'}))}),
            lose:()=>gl.getExtension('WEBGL_lose_context')?.loseContext(),
            dispose(loseContext=true){disposed=true;canvas.removeEventListener('webglcontextlost',lost);for(const[kind,item]of resources.reverse())gl['delete'+kind](item);resources.length=0;if(loseContext)gl.getExtension('WEBGL_lose_context')?.loseContext()},
        };
    } catch(error){disposed=true;canvas.removeEventListener('webglcontextlost',lost);for(const[kind,item]of resources.reverse())gl['delete'+kind](item);gl.getExtension('WEBGL_lose_context')?.loseContext();throw error}
}
