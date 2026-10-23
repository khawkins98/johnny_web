import { createShaderRenderer } from './shader-renderer.mjs';
import { sanitizeVga } from './vga-model.mjs';

// Original spatial approximation. References and limitations: README.md.
export const vgaFragment = `precision highp float;
varying vec2 uv;
uniform sampler2D image;
uniform vec2 OutputSize;
uniform float horizontal, beam, growth, crtGamma, rasterPhase, exposure, maskStrength, triads, srgbInput;
const vec2 sourceSize=vec2(640.,480.);
const float PI=3.14159265359;
float decode(float c){return c<=.04045?c/12.92:pow((c+.055)/1.055,2.4);}
float encode(float c){return c<=.0031308?12.92*c:1.055*pow(c,1./2.4)-.055;}
vec3 linearize(vec3 c){return vec3(decode(c.r),decode(c.g),decode(c.b));}
// Abramowitz-Stegun erf approximation; analytically integrate a Gaussian across
// the destination footprint, rather than sampling a scanline cosine at its centre.
float erfApprox(float x){
    float t=1./(1.+.3275911*abs(x));
    float p=t*(.254829592+t*(-.284496736+t*(1.421413741+t*(-1.453152027+t*1.061405429))));
    return sign(x)*(1.-p*exp(-x*x));
}
float area(float distance,float sigma,float footprint){
    float divisor=1.41421356237*sigma;
    return max(0.,.5*(erfApprox((distance+.5*footprint)/divisor)-erfApprox((distance-.5*footprint)/divisor))/footprint);
}
vec3 fetchPixel(vec2 p){
    if(any(lessThan(p,vec2(0.)))||any(greaterThanEqual(p,sourceSize))) return vec3(0.);
    vec3 c=texture2D(image,(p+.5)/sourceSize).rgb;
    return srgbInput>.5?linearize(c):c;
}
vec3 reconstructed(float x,float row){
    float start=floor(x); vec3 signal=vec3(0.); float total=0.;
    for(int i=-3;i<=4;i++){
        float column=start+float(i);
        float distance=(x-column)/horizontal;
        float weight=exp(-.5*distance*distance);
        if(weight>.00001) signal+=fetchPixel(vec2(column,row))*weight;
        total+=weight;
    }
    return signal/max(total,.00001);
}
vec3 line(float x,float row,float footprint){
    // Reconstruct voltage at subpixel positions, apply CRT response THERE, then
    // integrate emitted light. pow(average(voltage),gamma) darkens downsampling.
    float count=clamp(ceil(footprint*8.),2.,32.); vec3 light=vec3(0.);
    for(int i=0;i<32;i++){
        if(float(i)>=count) break;
        float offset=((float(i)+.5)/count-.5)*footprint;
        vec3 signal=reconstructed(x+offset,row);
        light+=srgbInput>.5?signal:pow(max(signal,vec3(0.)),vec3(crtGamma));
    }
    return light/count;
}
void main(){
    vec2 position=uv*sourceSize-.5;
    position.y+=rasterPhase;
    vec2 footprint=sourceSize/OutputSize;
    vec3 light=vec3(0.);
    for(int i=-3;i<=4;i++){
        float row=floor(position.y)+float(i), distance=position.y-row;
        if(abs(distance)>.5*footprint.y+2.5) continue;
        vec3 emitted=line(position.x,row,footprint.x);
        float luminance=dot(emitted,vec3(.2126,.7152,.0722));
        float sigma=beam+growth*sqrt(max(0.,luminance));
        light+=emitted*area(distance,sigma,footprint.y);
    }
    // Optional band-limited stripe/grille hypothesis, independent of source grid.
    // At insufficient output density it integrates to mean transmission (no stripes).
    float pixelsPerTriad=OutputSize.x/triads;
    float phase=uv.x*triads*2.*PI;
    float aperture=PI/max(pixelsPerTriad,.00001);
    float attenuation=smoothstep(3.,6.,pixelsPerTriad)*sin(aperture)/aperture;
    light*=exposure*(vec3(1.)+maskStrength*attenuation*cos(vec3(phase,phase-2.*PI/3.,phase+2.*PI/3.)));
    light=max(light,vec3(0.));
    gl_FragColor=vec4(encode(light.r),encode(light.g),encode(light.b),1.);
}`;
export function createVga(canvas, onFailure) {
    const renderer = createShaderRenderer(canvas, onFailure, vgaFragment, input => {
        const s = sanitizeVga(input);
        return { horizontal: s.horizontal, beam: s.beam, growth: s.growth, crtGamma: s.gamma, rasterPhase: s.phase, exposure: s.exposure,
            maskStrength: s.mask, triads: s.triads, srgbInput: s.input === 'srgb' ? 1 : 0 };
    });
    return { ...renderer, draw(source, width, height, settings) {
        if (width < 160 || height < 120) throw Error('VGA beam needs at least 160×120 device pixels · unfiltered fallback');
        renderer.draw(source, width, height, settings);
    } };
}
