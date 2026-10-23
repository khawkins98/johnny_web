/** WebGL2 host translation for the pinned Guest HD Slang sources (GPL-2.0-or-later).
 * Changes only interface syntax, the reserved FragCoord macro, and border sampling.
 * See vendor/guest-hd/README.md for provenance, license and validation limits.
 */
export function parseGuestPreset(text) {
    const properties = Object.fromEntries([...text.matchAll(/^([\w]+)\s*=\s*([^\r\n]+)/gm)].map(([,key,value]) => [key,value.trim().replace(/^"|"$/g,'')]));
    return Array.from({ length: Number(properties.shaders) }, (_, index) => ({
        path: properties[`shader${index}`], alias: properties[`alias${index}`], linear: properties[`filter_linear${index}`] === 'true',
        float: properties[`float_framebuffer${index}`] === 'true', mipmap: properties[`mipmap_input${index}`] === 'true',
        xType: properties[`scale_type_x${index}`] || properties[`scale_type${index}`] || 'viewport',
        yType: properties[`scale_type_y${index}`] || properties[`scale_type${index}`] || 'viewport',
        xScale: Number(properties[`scale_x${index}`] || properties[`scale${index}`] || 1),
        yScale: Number(properties[`scale_y${index}`] || properties[`scale${index}`] || 1),
    }));
}
export function guestDimensions(pass, source, viewport) {
    return [0,1].map(axis => {
        const type = axis ? pass.yType : pass.xType, scale = axis ? pass.yScale : pass.xScale;
        return Math.max(1, Math.round((type === 'absolute' ? 1 : type === 'source' ? source[axis] : viewport[axis]) * scale));
    });
}
export function guestParameters(sources) {
    const parameters = new Map();
    for (const source of sources) for (const [,key,label,value,min,max,step] of source.matchAll(/#pragma parameter\s+(\w+)\s+"([^"]*)"\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/g)) {
        if (!parameters.has(key)) parameters.set(key, { key,label:label.trim(),value:Number(value),min:Number(min),max:Number(max),step:Number(step) });
    }
    return parameters;
}
export function translateGuest(source) {
    const [common, stages] = source.split('#pragma stage vertex');
    if (!stages) throw Error('Guest shader lacks vertex stage');
    const [vertex, fragment] = stages.split('#pragma stage fragment');
    if (!fragment) throw Error('Guest shader lacks fragment stage');
    const convert = text => {
        let out = text.replace(/^#version[^\n]*\n/gm,'').replace(/^#pragma parameter[^\n]*\n/gm,'');
        out = out.replace(/\b(\d+\.\d+)\.([xyzwrgba]{2,4})\b/g, (_,value,swizzle) => `vec${swizzle.length}(${value})`);
        out = out.replace(/\bcsize\.xx\b/g, 'vec2(csize)');
        out = out.replace(/layout\([^)]*\)\s*uniform\s+(\w+)\s*\{([^}]+)\}\s*(\w+)\s*;/g, (_,type,body,name) => `struct ${type} {${body}}; uniform ${type} ${name};`);
        out = out.replace(/layout\([^)]*\)\s*/g,'');
        if (/#define gl_FragCoord/.test(out)) out = out.replace(/\bgl_FragCoord\b/g,'guestFragCoord');
        return out;
    };
    // Emulate black border for nearest/linear base-level sampling. Mip-level
    // boundary footprints remain an approximation; no unqualified RA parity claim.
    const border = `uniform bool GuestLinear;
        vec4 guestTexture(sampler2D s, vec2 uv){
            vec2 size=vec2(textureSize(s,0));
            vec2 coverage=GuestLinear ? clamp(uv*size+.5,0.,1.)*clamp((1.-uv)*size+.5,0.,1.) :
                vec2(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThan(uv,vec2(1.)))?1.:0.);
            return texture(s,clamp(uv,0.,1.))*coverage.x*coverage.y;
        }\n`;
    function initializeGlobals(text) {
        const masked=text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, match=>match.replace(/[^\n]/g,' '));
        const edits=[],assignments=[];
        for(const match of masked.matchAll(/^(float|vec[234]|int|uint|bool)\s+(\w+)\s*=\s*([^;]+);/gm)){
            let depth=0;for(const c of masked.slice(0,match.index)){if(c==='{')depth++;if(c==='}')depth--}
            if(depth!==0)continue;
            edits.push([match.index,match[0].length,`${match[1]} ${match[2]};`]);assignments.push(`${match[2]}=${match[3]};`);
        }
        for(const[index,length,replacement]of edits.reverse())text=text.slice(0,index)+replacement+text.slice(index+length);
        return text.replace(/void main\s*\(\s*\)\s*\{/, match=>match+'\n'+assignments.join('\n'));
    }
    const header = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
    return { vertex: header + initializeGlobals(convert(common + vertex)), fragment: header + border + initializeGlobals(convert(common + fragment)).replace(/\btexture\s*\(/g,'guestTexture(') };
}
