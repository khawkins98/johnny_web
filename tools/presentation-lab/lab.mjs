import { createStage } from './stage.mjs';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
for (const id of ['mode', 'effect', 'width', 'height', 'view', 'comparison-set']) {
    const control = $(id), value = params.get(id);
    if (value !== null && (control.tagName !== 'SELECT' || [...control.options].some(option => option.value === value))) control.value = value;
}
const source = document.createElement('canvas'); source.width = 640; source.height = 480;
const ctx = source.getContext('2d');
const viewport = $('viewport');
const single = createStage(viewport);
let comparisonStages = [], comparisonKey = '';
let frozen = params.get('frozen') === '1', live = false, frame = 0;
let samples = [], intervals = [], previousTime = null, resolvedDpr = 0;
const resetMetrics = () => { samples = []; intervals = []; previousTime = null; };
const comparing = () => $('view').value === 'compare';
const activeStages = () => comparing() ? comparisonStages.map(panel => panel.stage) : [single];
const ladders = {
    stops: [0.5, 1, 1.5, 2].map(scale => ({ label: `${scale}× requested`, width: 640*scale, height: 480*scale, mode: String(scale) })),
    fractional: [0.5, 0.585, 1, 1.2].map(scale => ({ label: `${scale}× requested`, width: Math.ceil(640*scale), height: Math.ceil(480*scale), mode: String(scale) })),
    areas: [[375,281],[640,480],[800,600],[1000,750]].map(([width,height]) => ({ label: `${width} × ${height} available`, width, height })),
};
function configure() {
    resolvedDpr = devicePixelRatio;
    const compare = comparing(), set = $('comparison-set').value;
    viewport.hidden = compare; $('comparisons').hidden = !compare;
    $('comparison-set-control').hidden = !compare; $('comparison-help').hidden = !compare;
    document.querySelectorAll('.single-control').forEach(control => { control.hidden = compare; });
    $('mode').disabled = compare && set !== 'areas';
    const key = compare ? set : '';
    if (key !== comparisonKey) {
        comparisonStages.forEach(panel => panel.stage.dispose());
        comparisonStages = []; $('comparisons').replaceChildren(); comparisonKey = key;
        if (compare) for (const preset of ladders[set]) {
            const card = document.createElement('article'); card.className = 'comparison-card';
            const heading = document.createElement('h2'); heading.textContent = preset.label;
            const caption = document.createElement('output');
            const area = document.createElement('div'); area.className = 'stage';
            card.append(heading, caption, area); $('comparisons').append(card);
            comparisonStages.push({ ...preset, caption, stage: createStage(area) });
        }
    }
    if (compare) {
        // Establish all card sizes before measuring origins; wrapping changes earlier positions.
        for (const panel of comparisonStages) {
            const area = panel.caption.nextElementSibling;
            area.style.width = `${panel.width}px`; area.style.height = `${panel.height}px`;
        }
        for (const panel of comparisonStages) {
            panel.stage.configure(panel.width, panel.height, resolvedDpr, panel.mode || $('mode').value, $('effect').value);
            const { geometry } = panel.stage.metrics();
            panel.caption.textContent = `${geometry.width.toFixed(1)} × ${geometry.height.toFixed(1)} rendered · ${geometry.scale.toFixed(3)}× CSS\n${(geometry.scale*resolvedDpr).toFixed(3)} device px/source px · ${$('effect').value === 'crt' ? 'CRT blend' : geometry.sharp ? 'pixelated' : 'smooth'}`;
        }
    } else {
        const width = Math.max(160, Math.min(2400, Number($('width').value) || 1000));
        const height = Math.max(120, Math.min(1600, Number($('height').value) || 750));
        single.configure(width, height, resolvedDpr, $('mode').value, $('effect').value);
    }
    $('status').textContent = ''; resetMetrics();
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
    if (layers.some(c => !c)) { live = false; activeStages().forEach(stage => stage.fail('Game canvases unavailable')); return; }
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
    const stages = activeStages().map(stage => stage.metrics());
    return { userAgent: navigator.userAgent, dpr: devicePixelRatio, viewport: [innerWidth,innerHeight],
        requested: [$('width').value,$('height').value], mode: $('mode').value, effect: $('effect').value,
        view: $('view').value, comparisonSet: comparing() ? $('comparison-set').value : null,
        ...(comparing() ? { panels: stages.map((stage, index) => ({ label: comparisonStages[index].label, ...stage })) } : stages[0]),
        source: live?'Johnny canvases':'synthetic', frozen, frame, sourceHash: fingerprint(),
        sourceSize: [source.width,source.height], samples: samples.length,
        cpuSubmissionMs: {p50:percentile(samples,.5),p95:percentile(samples,.95),p99:percentile(samples,.99)},
        frameIntervalMs: {p50:percentile(intervals,.5),p95:percentile(intervals,.95),p99:percentile(intervals,.99)} };
}
function render(time) {
    if (resolvedDpr !== devicePixelRatio) configure();
    if (!document.hidden) {
        if (previousTime !== null) intervals.push(time-previousTime); previousTime=time;
        if (!frozen) { if (live) copyLive(); else pattern(++frame); }
        const start = performance.now();
        for (const stage of activeStages()) stage.draw(source);
        samples.push(performance.now()-start);
        if (samples.length > 1200) samples.shift(); if (intervals.length > 1200) intervals.shift();
        if (Math.floor(time / 250) !== Math.floor((time - (intervals.at(-1) || 0)) / 250) || !$('status').textContent) {
            const stages = activeStages().map(stage => stage.metrics());
            const { geometry } = stages[0];
            const detail = comparing()
                ? `${stages.length} panels at actual CSS size · ${$('comparison-set').selectedOptions[0].text}`
                : `${geometry.width.toFixed(2)} × ${geometry.height.toFixed(2)} CSS px · ${geometry.scale.toFixed(4)}× · ${(geometry.scale*devicePixelRatio).toFixed(3)} device px/source px`;
            const failures = stages.filter(stage => stage.failure).length;
            $('status').textContent = `${live?'JOHNNY':'SYNTHETIC'} ${frozen?'· frozen':'· moving'} | DPR ${devicePixelRatio} | ${failures ? `${failures} fallback(s): ${stages.find(stage => stage.failure).failure}` : $('effect').selectedOptions[0].text}\n${detail}\nCPU submission p95: ${(percentile(samples,.95) || 0).toFixed(2)} ms · ${samples.length} samples · ${comparing() ? 'all panels combined' : 'one panel'} (not GPU time)`;
        }
    } else previousTime=null;
    requestAnimationFrame(render);
}
for (const id of ['mode','effect','width','height','view','comparison-set']) $(id).addEventListener('change', configure);
$('freeze').onclick = () => { frozen=!frozen; $('freeze').textContent=frozen?'Resume source':'Freeze source'; resetMetrics(); };
$('pattern').onclick = () => { live=false; frame=0; pattern(0); resetMetrics(); };
$('live').addEventListener('toggle', () => { const iframe=$('live').querySelector('iframe'); if ($('live').open && !iframe.getAttribute('src')) iframe.src=iframe.dataset.src; configure(); });
$('connect').onclick = () => { live=true; copyLive(); $('live').open=false; resetMetrics(); };
$('lose').onclick = () => activeStages().forEach(stage => stage.lose());
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
