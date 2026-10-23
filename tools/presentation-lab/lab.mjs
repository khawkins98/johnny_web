import { setupGuestControls } from './guest-controls.mjs';
import { drawCalibration } from './fixtures.mjs';
import { setupVgaControls, setupLottesControls } from './vga-controls.mjs';
import { presets } from '../../src/games/johnny/ui/crt/presets.mjs';
import { createStage } from './stage.mjs';
import { setupCrtControls } from './crt-controls.mjs';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
for (const id of ['mode', 'effect', 'width', 'height', 'view', 'comparison-set', 'fixture']) {
    const control = $(id), value = params.get(id);
    if (value !== null && (control.tagName !== 'SELECT' || [...control.options].some(option => option.value === value))) control.value = value;
}
const source = document.createElement('canvas'); source.width = 640; source.height = 480;
const ctx = source.getContext('2d');
const viewport = $('viewport');
const single = createStage(viewport);
let comparisonStages = [], comparisonKey = '';
let sourceEpoch=0;
let frozen = params.get('frozen') === '1', live = false, frame = 0;
let samples = [], intervals = [], previousTime = null, resolvedDpr = 0;
const resetMetrics = () => { samples = []; intervals = []; previousTime = null; };
const crtControls = setupCrtControls($('crt-controls'), () => { resetMetrics(); $('status').textContent = ''; updateCaptions(); });
const settingsChanged = () => { resetMetrics(); $('status').textContent = ''; updateCaptions(); };
const vgaControls = setupVgaControls($('vga-controls'), settingsChanged);
const lottesControls = setupLottesControls($('lottes-controls'), settingsChanged);
const guestControls=setupGuestControls($('guest-controls'),settingsChanged);
const models = () => ['models','guest'].includes($('view').value);
const comparing = () => $('view').value !== 'single';
const settingsFor = effect => effect === 'guest' ? {...guestControls.getSettings(),frozen,epoch:sourceEpoch} : effect === 'vga' ? vgaControls.getSettings() : effect === 'lottes' ? lottesControls.getSettings() : crtControls.getSettings();
const sizeInputs = () => [Math.max(160, Math.min(2400, Number($('width').value) || 1000)), Math.max(120, Math.min(1600, Number($('height').value) || 750))];
const activeStages = () => comparing() ? comparisonStages.map(panel => panel.stage) : [single];
const ladders = {
    stops: [0.5, 1, 1.5, 2].map(scale => ({ label: `${scale}× requested`, width: 640*scale, height: 480*scale, mode: String(scale) })),
    fractional: [0.5, 0.585, 1, 1.2].map(scale => ({ label: `${scale}× requested`, width: Math.ceil(640*scale), height: Math.ceil(480*scale), mode: String(scale) })),
    areas: [[375,281],[640,480],[800,600],[1000,750]].map(([width,height]) => ({ label: `${width} × ${height} available`, width, height })),
};
function configure() {
    resolvedDpr = devicePixelRatio;
    const compare = comparing(), set = models() ? 'models' : $('comparison-set').value;
    const [areaWidth, areaHeight] = sizeInputs();
    $('crt-controls').hidden = models() || $('effect').value !== 'crt';
    $('vga-controls').hidden = !models() && $('effect').value !== 'vga';
    $('lottes-controls').hidden = !models() && $('effect').value !== 'lottes';
    $('guest-controls').hidden = $('view').value !== 'guest' && (models() || $('effect').value !== 'guest');
    $('effect').disabled = models();
    viewport.hidden = compare; $('comparisons').hidden = !compare;
    $('comparison-set-control').hidden = !compare || models(); $('comparison-help').hidden = !compare;
    document.querySelectorAll('.area-control').forEach(control => { control.hidden = compare && !models(); });
    $('mode').disabled = compare && !models() && set !== 'areas';
    const key = compare ? models() ? `${$('view').value}-${areaWidth}-${areaHeight}` : set : '';
    if (key !== comparisonKey) {
        comparisonStages.forEach(panel => panel.stage.dispose());
        comparisonStages = []; $('comparisons').replaceChildren(); comparisonKey = key;
        const panels = models() ? [
            { label: 'Unfiltered', effect: 'none' }, { label: 'Balanced CRT · fixed preset', effect: 'crt', settings: { ...presets.balanced, bypass: false } },
            { label: 'VGA beam · experimental', effect: 'vga' }, { label: 'Libretro CRT-Lottes · upstream reference', effect: 'lottes' },
        ...($('view').value==='guest'?[{label:'Guest Advanced HD · 12-pass WebGL2 port',effect:'guest'}]:[])].map(panel => ({ ...panel, width: areaWidth, height: areaHeight })) : ladders[set];
        if (compare) for (const preset of panels) {
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
            panel.stage.configure(panel.width, panel.height, resolvedDpr, panel.mode || $('mode').value, panel.effect || $('effect').value);

        }
    } else {
        const [width, height] = sizeInputs();
        single.configure(width, height, resolvedDpr, $('mode').value, $('effect').value);
    }
    updateCaptions(); $('status').textContent = ''; resetMetrics();
}
function updateCaptions() {
    for (const panel of comparisonStages) {
        const { geometry } = panel.stage.metrics();
        if (!geometry) continue;
        const effect = panel.effect || $('effect').value;
        const sampling = ['crt','vga','lottes','guest'].includes(effect) ? (settingsFor(effect).bypass && !panel.settings ? 'bypass · unfiltered' : effect === 'vga' ? 'VGA beam' : effect === 'lottes' ? 'CRT-Lottes' : effect==='guest'?(frozen?'Guest HD · reset capture, frame 0':'Guest HD · 60 Hz target'):'CRT blend') : geometry.sharp ? 'pixelated' : 'smooth';
        panel.caption.textContent = `${geometry.width.toFixed(1)} × ${geometry.height.toFixed(1)} rendered · ${geometry.scale.toFixed(3)}× CSS\n${(geometry.scale*resolvedDpr).toFixed(3)} device px/source px · ${sampling}`;
    }
}
function pattern(tick) {
    if ($('fixture').value === 'calibration') { drawCalibration(ctx, tick); return; }
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
        view: $('view').value, comparisonSet: comparing() ? models() ? 'models' : $('comparison-set').value : null, crtSettings: crtControls.getSettings(), vgaSettings: vgaControls.getSettings(), lottesSettings: lottesControls.getSettings(),guestSettings:guestControls.getSettings(),
        ...(comparing() ? { panels: stages.map((stage, index) => ({ label: comparisonStages[index].label, ...stage })) } : stages[0]),
        source: live?'Johnny canvases':'synthetic', fixture: live ? null : $('fixture').value, frozen, frame, sourceHash: fingerprint(),
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
        const settings = settingsFor($('effect').value);
        if (comparing()) for (const panel of comparisonStages) panel.stage.draw(source, panel.settings || settingsFor(panel.effect || $('effect').value));
        else single.draw(source, settings);
        samples.push(performance.now()-start);
        if (samples.length > 1200) samples.shift(); if (intervals.length > 1200) intervals.shift();
        if (Math.floor(time / 250) !== Math.floor((time - (intervals.at(-1) || 0)) / 250) || !$('status').textContent) {
            const stages = activeStages().map(stage => stage.metrics());
            const { geometry } = stages[0];
            const detail = comparing()
                ? `${stages.length} panels at actual CSS size · ${models() ? 'renderer comparison' : $('comparison-set').selectedOptions[0].text}`
                : `${geometry.width.toFixed(2)} × ${geometry.height.toFixed(2)} CSS px · ${geometry.scale.toFixed(4)}× · ${(geometry.scale*devicePixelRatio).toFixed(3)} device px/source px`;
            const failures = stages.filter(stage => stage.failure).length;
            $('status').textContent = `${live?'JOHNNY':'SYNTHETIC'} ${frozen?'· frozen':'· moving'} | DPR ${devicePixelRatio} | ${failures ? `${failures} fallback(s): ${stages.find(stage => stage.failure).failure}` : (settings.bypass ? 'CRT bypassed · unfiltered' : $('effect').selectedOptions[0].text)}\n${detail}\nCPU submission p95: ${(percentile(samples,.95) || 0).toFixed(2)} ms · ${samples.length} samples · ${comparing() ? 'all panels combined' : 'one panel'} (not GPU time)`;
        }
    } else previousTime=null;
    requestAnimationFrame(render);
}
for (const id of ['mode','effect','width','height','view','comparison-set']) $(id).addEventListener('change', configure);
for (const id of ['crt-controls','vga-controls','lottes-controls','guest-controls']) $(id).addEventListener('toggle', configure);
$('freeze').onclick = () => { frozen=!frozen;sourceEpoch++; $('freeze').textContent=frozen?'Resume source':'Freeze source'; updateCaptions(); resetMetrics(); };
$('fixture').onchange = () => { sourceEpoch++;live=false; frame=0; pattern(0); resetMetrics(); };
$('pattern').onclick = () => { sourceEpoch++;live=false; frame=0; pattern(0); resetMetrics(); };
$('live').addEventListener('toggle', () => { const iframe=$('live').querySelector('iframe'); if ($('live').open && !iframe.getAttribute('src')) iframe.src=iframe.dataset.src; configure(); });
$('connect').onclick = () => { sourceEpoch++;live=true; copyLive(); $('live').open=false; resetMetrics(); };
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
window.presentationLab = { sampleCount: () => samples.length, metrics, source, configure, setFrozen: value => { if(frozen!==value)sourceEpoch++;frozen=value; }, captureLive: () => {sourceEpoch++;live=true; copyLive(); frozen=true; $('freeze').textContent='Resume source'; resetMetrics();}, resetMetrics };
requestAnimationFrame(render);
