import { resolveScale } from './scaling.mjs';
import { createCrt } from './crt.mjs';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
for (const id of ['mode', 'effect', 'width', 'height']) if (params.has(id)) $(id).value = params.get(id);
const source = document.createElement('canvas'); source.width = 640; source.height = 480;
const ctx = source.getContext('2d');
const viewport = $('viewport');
const baseline = document.createElement('canvas'); baseline.width = 640; baseline.height = 480; baseline.className = 'output'; viewport.append(baseline);
const raster = document.createElement('canvas'); raster.className = 'output'; viewport.append(raster);
const output = document.createElement('canvas'); output.className = 'output'; viewport.append(output);
let crt = null, failure = '', frozen = params.get('frozen') === '1', live = false, frame = 0;
let samples = [], intervals = [], previousTime = null, geometry, resolvedDpr=0;
const resetMetrics = () => { samples = []; intervals = []; previousTime = null; };
function fail(message) { failure = message; output.hidden = true; raster.hidden = true; baseline.hidden = false; }
function configure() {
    resolvedDpr=devicePixelRatio;
    const width = Math.max(160, Math.min(2400, Number($('width').value) || 1000));
    const height = Math.max(120, Math.min(1600, Number($('height').value) || 750));
    viewport.style.width = `${width}px`; viewport.style.height = `${height}px`;
    // Align the viewport itself before snapping the stage within it.
    viewport.style.marginLeft = '0px'; viewport.style.top = '0px';
    const offset = viewport.getBoundingClientRect().left;
    const top = viewport.getBoundingClientRect().top;
    viewport.style.top = `${Math.round(top * devicePixelRatio) / devicePixelRatio - top}px`;
    viewport.style.marginLeft = `${Math.round(offset * devicePixelRatio) / devicePixelRatio - offset}px`;
    geometry = resolveScale(width, height, devicePixelRatio, $('mode').value);
    for (const c of [baseline, raster, output]) Object.assign(c.style, {
        width: `${geometry.width}px`, height: `${geometry.height}px`, left: `${geometry.x}px`, top: `${geometry.y}px`,
        imageRendering: geometry.sharp ? 'pixelated' : 'auto',
    });
    // GL is drawn at final device resolution, and must not be pixelated again.
    output.style.imageRendering = 'auto'; raster.style.imageRendering = 'auto';
    failure = '';
    output.hidden = true; raster.hidden = true; baseline.hidden = false;
    if ($('effect').value === 'unavailable') fail('Forced WebGL unavailable · unfiltered fallback');
    if ($('effect').value === 'crt' && !crt) {
        try { crt = createCrt(output, fail); } catch (error) { fail(error.message); }
    }
    resetMetrics();
}
function pattern(tick) {
    ctx.fillStyle = '#102131'; ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#e6d4a7'; ctx.font = 'bold 20px monospace'; ctx.fillText('640 × 480 / PRESENTATION TEST', 24, 38);
    ctx.font = '12px monospace'; ctx.fillText('Original synthetic fixture · no game assets', 24, 60);
    const colors = ['#182d45','#31566b','#538b91','#9ec3ab','#e6d4a7','#ba784a','#843c46','#432e49'];
    colors.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(24 + i * 74, 80, 74, 52); });
    for (let y = 156; y < 284; y++) for (let x = 24; x < 280; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#86b7af' : '#183b57'; ctx.fillRect(x, y, 1, 1);
    }
    for (let x = 310; x < 616; x++) { ctx.fillStyle = x % 2 ? '#e6d4a7' : '#2d425a'; ctx.fillRect(x, 156, 1, 128); }
    ctx.fillStyle = '#e6d4a7'; ctx.font = '12px monospace'; ctx.fillText('1 px checkerboard', 24, 303); ctx.fillText('1 px vertical stripes', 310, 303);
    for (let y = 326; y < 450; y++) for (let x = 24; x < 616; x++) {
        ctx.fillStyle = (x + Math.floor(y / 3) + Math.floor(tick / 2)) % 16 < 2 ? '#86b7af' : '#203e57'; ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#e6d4a7'; ctx.fillRect(40 + tick % 500, 350, 20, 32);
    ctx.strokeStyle = '#e6d4a7'; ctx.strokeRect(.5, .5, 639, 479);
}
pattern(0);
function copyLive() {
    const doc = $('live').querySelector('iframe').contentDocument;
    const layers = ['mainCanvas','canvas'].map(id => doc?.getElementById(id));
    if (layers.some(c => !c)) { live = false; fail('Game canvases unavailable'); return; }
    ctx.clearRect(0, 0, 640, 480);
    for (const c of layers) ctx.drawImage(c, 0, 0);
}
function fingerprint() {
    // For explicit research snapshots only, never in the animation hot path.
    const data = ctx.getImageData(0, 0, 640, 480).data;
    let hash = 2166136261;
    for (const value of data) hash = Math.imul(hash ^ value, 16777619) >>> 0;
    return hash.toString(16).padStart(8, '0');
}
const percentile = (values, p) => values.length ? [...values].sort((a,b) => a-b)[Math.min(values.length-1, Math.floor(values.length*p))] : null;
function metrics() {
    return { userAgent:navigator.userAgent, dpr:devicePixelRatio, viewport:[innerWidth,innerHeight],
        requested:[$('width').value,$('height').value],
        layoutDeviceOrigin:[(viewport.getBoundingClientRect().left+geometry.x)*devicePixelRatio,(viewport.getBoundingClientRect().top+geometry.y)*devicePixelRatio], mode:$('mode').value, effect:$('effect').value,
        source:live?'Johnny canvases':'synthetic', frozen, frame, geometry, failure, sourceHash:fingerprint(),
        sourceSize:[source.width,source.height], glSize:[output.width,output.height], rasterSize:[raster.width,raster.height], samples:samples.length,
        cpuSubmissionMs:{p50:percentile(samples,.5),p95:percentile(samples,.95),p99:percentile(samples,.99)},
        frameIntervalMs:{p50:percentile(intervals,.5),p95:percentile(intervals,.95),p99:percentile(intervals,.99)} };
}
function render(time) {
    if (resolvedDpr !== devicePixelRatio) configure();
    if (!document.hidden) {
        if (previousTime !== null) intervals.push(time-previousTime); previousTime=time;
        if (!frozen) { if (live) copyLive(); else pattern(++frame); }
        const start = performance.now();
        baseline.getContext('2d').drawImage(source, 0, 0);
        if ($('effect').value === 'raster') {
            const w=Math.round(geometry.width*devicePixelRatio), h=Math.round(geometry.height*devicePixelRatio);
            if (raster.width!==w || raster.height!==h) { raster.width=w; raster.height=h; }
            const rasterContext=raster.getContext('2d'); rasterContext.imageSmoothingEnabled=!geometry.sharp;
            rasterContext.drawImage(source,0,0,w,h);
            raster.hidden=false; baseline.hidden=true;
        }
        if ($('effect').value === 'crt' && crt && !failure) {
            try {
                crt.draw(source, Math.round(geometry.width * devicePixelRatio), Math.round(geometry.height * devicePixelRatio));
                output.hidden=false; baseline.hidden=true;
            } catch (error) { fail(error.message); }
        }
        samples.push(performance.now()-start);
        if (samples.length > 1200) samples.shift(); if (intervals.length > 1200) intervals.shift();
        if (Math.floor(time / 250) !== Math.floor((time - (intervals.at(-1) || 0)) / 250) || !$('status').textContent) {
            $('status').textContent = `${live?'JOHNNY':'SYNTHETIC'} ${frozen?'· frozen':'· moving'} | ${$('mode').selectedOptions[0].text} | DPR ${devicePixelRatio}\n${geometry.width.toFixed(2)} × ${geometry.height.toFixed(2)} CSS px · ${geometry.scale.toFixed(4)}× · ${(geometry.scale*devicePixelRatio).toFixed(3)} device px/source px | ${failure || $('effect').selectedOptions[0].text}\nCPU copy/upload/draw submission p95: ${(percentile(samples,.95) || 0).toFixed(2)} ms · ${samples.length} samples (not GPU time)`;
        }
    } else previousTime=null;
    requestAnimationFrame(render);
}
for (const id of ['mode','effect','width','height']) $(id).addEventListener('change', configure);
$('freeze').onclick = () => { frozen=!frozen; $('freeze').textContent=frozen?'Resume source':'Freeze source'; resetMetrics(); };
$('pattern').onclick = () => { live=false; frame=0; pattern(0); resetMetrics(); };
$('live').addEventListener('toggle', () => { const iframe=$('live').querySelector('iframe'); if ($('live').open && !iframe.getAttribute('src')) iframe.src=iframe.dataset.src; });
$('connect').onclick = () => { live=true; copyLive(); resetMetrics(); };
$('lose').onclick = () => crt?.lose();
$('export').onclick = () => {
    const blob = new Blob([JSON.stringify(metrics(),null,2)], {type:'application/json'});
    const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download='presentation-metrics.json'; link.click(); URL.revokeObjectURL(link.href);
};
window.addEventListener('resize',configure);
let media;
function watchDpr() { media?.removeEventListener('change', onDpr); media=matchMedia(`(resolution: ${devicePixelRatio}dppx)`); media.addEventListener('change',onDpr); }
function onDpr() { configure(); watchDpr(); }
watchDpr(); configure();
if (frozen) $('freeze').textContent='Resume source';
window.presentationLab = { sampleCount: () => samples.length, metrics, source, configure, setFrozen: value => { frozen=value; }, captureLive: () => {live=true; copyLive(); frozen=true; $('freeze').textContent='Resume source'; resetMetrics();}, resetMetrics };
requestAnimationFrame(render);
