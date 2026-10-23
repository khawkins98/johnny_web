/** Original experimental GLSL; concepts credited in README.md. No vendored shader code. */
export function createCrt(canvas, onFailure) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL unavailable');
    const shader = (type, source) => {
        const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(message);
        }
        return s;
    };
    const vertex = shader(gl.VERTEX_SHADER, `attribute vec2 position; varying vec2 uv;
        void main(){ uv=position*0.5+0.5; gl_Position=vec4(position,0.,1.); }`);
    const fragment = shader(gl.FRAGMENT_SHADER, `precision highp float;
        varying vec2 uv; uniform sampler2D image; uniform float density;
        void main(){
            // UVs are source-row locked; horizontal taps span half a source pixel.
            vec2 p=vec2(uv.x,1.-uv.y);
            vec3 c=texture2D(image,p).rgb*0.76;
            c+=texture2D(image,p+vec2(0.5/640.,0.)).rgb*0.12;
            c+=texture2D(image,p-vec2(0.5/640.,0.)).rgb*0.12;
            // Fade modulation out below two output pixels per source row.
            float strength=0.12*clamp(density-1.,0.,1.);
            float beam=1.-strength*(0.5+0.5*cos(p.y*480.*6.2831853));
            gl_FragColor=vec4(c*beam,1.);
        }`);
    const program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 640, 480, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const density = gl.getUniformLocation(program, 'density');
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onFailure('WebGL context lost'); });
    // Reload the lab after context loss to recreate GL resources; baseline stays usable meanwhile.
    return {
        draw(source, width, height) {
            if (gl.isContextLost()) throw new Error('WebGL context lost');
            if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
            gl.viewport(0, 0, width, height); gl.useProgram(program);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
            gl.uniform1f(density, height / 480); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        },
        lose: () => gl.getExtension('WEBGL_lose_context')?.loseContext(),
        dispose() { gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); },
    };
}
