/** Original GLSL; concepts credited in docs/optional-crt.md. No vendored shader code. */
export function createCrt(canvas, onFailure) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL unavailable');
    const resources = [];
    const track = (kind, resource) => { resources.push([kind, resource]); return resource; };
    try {
        const shader = (type, source) => {
            const s = track('Shader', gl.createShader(type)); gl.shaderSource(s, source); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(s));
            }
            return s;
        };
        const vertex = shader(gl.VERTEX_SHADER, `attribute vec2 position; varying vec2 uv;
            void main(){ uv=position*0.5+0.5; gl_Position=vec4(position,0.,1.); }`);
        const fragment = shader(gl.FRAGMENT_SHADER, `precision highp float;
            varying vec2 uv;
            uniform sampler2D image;
            uniform float density;
            uniform float sharpBase;
            uniform vec4 effectsA; // blur radius, colour bleed radius, bloom gain, scanline strength
            uniform vec2 effectsB; // curvature, vignette
            const vec2 sourceSize=vec2(640.,480.);
            const vec3 lumaWeights=vec3(0.299,0.587,0.114);
            vec3 colour(vec2 p){ return texture2D(image,p).rgb; }
            vec3 chroma(vec3 c){ return c-vec3(dot(c,lumaWeights)); }
            vec3 bright(vec2 p){ return max(colour(p)-vec3(0.65),vec3(0.))/0.35; }
            void main(){
                vec2 q=vec2(uv.x,1.-uv.y)*2.-1.;
                // This monotone radial mapping places the complete source inside the output.
                vec2 p=(q*(1.+effectsB.x*dot(q,q))+1.)*0.5;
                if(any(lessThan(p,vec2(0.))) || any(greaterThan(p,vec2(1.)))){
                    gl_FragColor=vec4(0.,0.,0.,1.); return;
                }
                vec2 basePoint=sharpBase>0.5 ? (floor(p*sourceSize)+0.5)/sourceSize : p;
                vec3 c=colour(basePoint);
                if(effectsA.x>0.){
                    vec2 offset=vec2(effectsA.x/640.,0.);
                    c=colour(p)*0.76+(colour(p-offset)+colour(p+offset))*0.12;
                }
                if(effectsA.y>0.){
                    vec2 offset=vec2(effectsA.y/640.,0.);
                    vec3 spread=chroma(c)*0.5+(chroma(colour(p-offset))+chroma(colour(p+offset)))*0.25;
                    c=vec3(dot(c,lumaWeights))+spread;
                }
                if(effectsA.z>0.){
                    vec2 r=vec2(2.)/sourceSize;
                    vec3 glow=bright(p)*0.4;
                    glow+=(bright(p+vec2(r.x,0.))+bright(p-vec2(r.x,0.))+bright(p+vec2(0.,r.y))+bright(p-vec2(0.,r.y)))*0.1;
                    glow+=(bright(p+r)+bright(p-r)+bright(p+vec2(r.x,-r.y))+bright(p+vec2(-r.x,r.y)))*0.05;
                    c+=glow*effectsA.z;
                }
                // Conservative density bound reduces scanline aliasing as curvature compresses edges.
                float strength=effectsA.w*clamp(density/(1.+6.*effectsB.x)-1.,0.,1.);
                // At even integer pitch, align the beam peak with an output row rather
                // than sampling both sides equally and merely darkening the image.
                float pitch=max(1.,floor(density+0.5));
                float phase=(abs(density-pitch)<0.0001 && mod(pitch,2.)<0.5) ? 3.14159265/pitch : 0.;
                c*=1.-strength*(0.5+0.5*cos(p.y*480.*6.2831853+phase));
                vec2 edge=p*2.-1.;
                c*=1.-effectsB.y*dot(edge,edge)*0.5;
                gl_FragColor=vec4(c,1.);
            }`);
        const program = track('Program', gl.createProgram()); gl.attachShader(program, vertex); gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        const buffer = track('Buffer', gl.createBuffer()); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const texture = track('Texture', gl.createTexture()); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 640, 480, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const locations = Object.fromEntries(['density', 'sharpBase', 'effectsA', 'effectsB'].map(name => [name, gl.getUniformLocation(program, name)]));
        const onContextLost = event => { event.preventDefault(); onFailure('WebGL context lost'); };
        canvas.addEventListener('webglcontextlost', onContextLost);
        // The caller owns restoration and must recreate resources after context restoration.
        return {
            maxOutputSize: Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
            draw(source, width, height, settings, sharp) {
                if (gl.isContextLost()) throw new Error('WebGL context lost');
                if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
                gl.viewport(0, 0, width, height); gl.useProgram(program);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
                gl.uniform1f(locations.density, height / 480);
                gl.uniform1f(locations.sharpBase, sharp ? 1 : 0);
                gl.uniform4f(locations.effectsA, settings.blur, settings.bleed, settings.bloom, settings.scanlines);
                gl.uniform2f(locations.effectsB, settings.curvature, settings.vignette);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            },
            lose: () => gl.getExtension('WEBGL_lose_context')?.loseContext(),
            dispose(loseContext = true) { canvas.removeEventListener('webglcontextlost', onContextLost); gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); if (loseContext) gl.getExtension('WEBGL_lose_context')?.loseContext(); },
        };
    } catch (error) {
        for (const [kind, resource] of resources.reverse()) gl[`delete${kind}`](resource);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        throw error;
    }
}
