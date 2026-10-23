/** Small WebGL1 host for the two research shaders. Game renderer is unchanged. */
export function createShaderRenderer(canvas, onFailure, fragment, uniforms) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw Error('WebGL unavailable');
    const resources = [];
    const track = (kind, item) => { resources.push([kind, item]); return item; };
    const clean = () => { for (const [kind, item] of resources.slice().reverse()) gl[`delete${kind}`](item); };
    try {
        function compile(type, source) {
            const shader = track('Shader', gl.createShader(type)); gl.shaderSource(shader, source); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
            return shader;
        }
        const vertex = compile(gl.VERTEX_SHADER, `attribute vec2 position; varying vec2 uv; varying vec4 TEX0;
            void main(){ uv=vec2(position.x*.5+.5,.5-position.y*.5); TEX0=vec4(uv,0.,1.); gl_Position=vec4(position,0.,1.); }`);
        const pixel = compile(gl.FRAGMENT_SHADER, fragment);
        const program = track('Program', gl.createProgram()); gl.attachShader(program, vertex); gl.attachShader(program, pixel); gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        const buffer = track('Buffer', gl.createBuffer()); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const texture = track('Texture', gl.createTexture()); gl.bindTexture(gl.TEXTURE_2D, texture);
        for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.NEAREST);
        for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 640, 480, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        for (const name of ['image', 'Texture']) gl.uniform1i(gl.getUniformLocation(program, name), 0);
        const locations = new Map();
        function uniform(name, value) {
            if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
            const location = locations.get(name);
            if (Array.isArray(value)) gl.uniform2fv(location, value); else gl.uniform1f(location, value);
        }
        const lost = event => { event.preventDefault(); onFailure('WebGL context lost · reload to retry'); };
        canvas.addEventListener('webglcontextlost', lost);
        const limit = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
        return {
            draw(source, width, height, settings) {
                if (gl.isContextLost()) throw Error('WebGL context lost');
                const ratio = Math.min(1, limit / width, limit / height);
                width = Math.max(1, Math.round(width * ratio)); height = Math.max(1, Math.round(height * ratio));
                if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
                gl.viewport(0, 0, width, height); gl.useProgram(program);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
                uniform('OutputSize', [width, height]); uniform('TextureSize', [640, 480]); uniform('InputSize', [640, 480]);
                for (const [name, value] of Object.entries(uniforms(settings))) uniform(name, value);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            },
            lose: () => gl.getExtension('WEBGL_lose_context')?.loseContext(),
            dispose(loseContext = true) { canvas.removeEventListener('webglcontextlost', lost); clean(); if (loseContext) gl.getExtension('WEBGL_lose_context')?.loseContext(); },
        };
    } catch (error) { clean(); gl.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
}
