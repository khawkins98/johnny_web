import { vgaDefaults, sanitizeVga, vgaRanges } from './vga-model.mjs';
import { readStored, writeStored } from '../../src/games/johnny/ui/crt/presets.mjs';
const definitions = [
    ['horizontal', 'Horizontal spot', 0.01, 'Source px σ · filters RGB drive before light response.'],
    ['beam', 'Vertical beam', 0.01, 'Source px σ · controls the shape of scanline gaps.'],
    ['growth', 'Bright-beam widening', 0.01, 'Source px σ added at white; weakens gaps in bright areas.'],
    ['gamma', 'CRT response', 0.05, 'Drive-to-light exponent; an assumed target, not a calibration.'],
    ['phase', 'Raster phase', 0.05, 'Vertical source px · tests beam alignment against output pixels.'],
    ['exposure', 'Light exposure', 0.01, 'Output headroom · narrow beams or strong masks can clip highlights.'],
    ['mask', 'Stripe mask strength', 0.01, 'Optional grille approximation; averages away below 3 px/triad.'],
    ['triads', 'Triads across picture', 10, 'Independent tube-space pitch hypothesis; no effect with mask off.'],
];
export function setupVgaControls(container, onChange) {
    let storage; try { storage = localStorage; } catch { /* Session-only controls. */ }
    let state = sanitizeVga(readStored(storage, 'jc-lab-vga-v1', vgaDefaults));
    const tools = document.createElement('div'); tools.className = 'crt-tools';
    const bypassLabel = document.createElement('label'); bypassLabel.className = 'crt-toggle';
    const bypass = document.createElement('input'); bypass.id = 'vga-bypass'; bypass.type = 'checkbox'; bypassLabel.append(bypass, 'Bypass VGA');
    const inputLabel = document.createElement('label'); inputLabel.textContent = 'Source interpretation';
    const input = document.createElement('select'); input.id = 'vga-input';
    input.append(new Option('Nominal CRT drive', 'drive'), new Option('sRGB light reference', 'srgb')); inputLabel.append(input);
    const status = document.createElement('span'); status.setAttribute('role', 'status');
    tools.append(bypassLabel, inputLabel);
    const grid = document.createElement('div'); grid.className = 'crt-grid';
    const rows = new Map();
    const change = () => {
        state = sanitizeVga({ ...Object.fromEntries([...rows].map(([key, { slider }]) => [key, Number(slider.value)])), input: input.value, bypass: bypass.checked });
        sync(); status.textContent = writeStored(storage, 'jc-lab-vga-v1', state) ? 'Tuning kept in this browser.' : 'Tuning is session-only; browser storage is unavailable.';
        onChange();
    };
    for (const [key, label, step, helpText] of definitions) {
        const card = document.createElement('div'); card.className = 'crt-control';
        const labelElement = document.createElement('label'); labelElement.htmlFor = `vga-${key}`; labelElement.textContent = label;
        const slider = document.createElement('input'); slider.id = `vga-${key}`; slider.type = 'range';
        const [min, max] = vgaRanges[key]; Object.assign(slider, { min, max, step });
        const output = document.createElement('output'); output.htmlFor = slider.id;
        const help = document.createElement('p'); help.id = `${slider.id}-help`; help.textContent = helpText;
        slider.setAttribute('aria-describedby', help.id); slider.oninput = change;
        card.append(labelElement, slider, output, help); grid.append(card); rows.set(key, { slider, output });
    }
    function sync() {
        bypass.checked = state.bypass; input.value = state.input;
        for (const [key, { slider, output }] of rows) {
            slider.value = state[key]; slider.disabled = state.bypass || (key === 'gamma' && state.input === 'srgb');
            output.textContent = key === 'triads' ? String(Math.round(state[key])) : state[key].toFixed(2);
        }
    }
    for (const [label, overrides] of [['VGA neutral', {}], ['Sharper beam', { horizontal: 0.25, beam: 0.25, growth: 0.04 }], ['Softer focus', { horizontal: 0.55, beam: 0.38, growth: 0.10 }]]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.onclick = () => { state = { ...vgaDefaults, ...overrides }; sync(); change(); }; tools.append(button);
    }
    bypass.onchange = change; input.onchange = change;
    container.append(tools, grid, status); sync();
    return { getSettings: () => ({ ...state }) };
}
export function setupLottesControls(container, onChange) {
    const tools = document.createElement('div'); tools.className = 'crt-tools';
    const label = document.createElement('label'); label.textContent = 'Upstream mask';
    const mask = document.createElement('select'); mask.id = 'lottes-mask';
    ['Off', 'Compressed TV', 'Aperture grille', 'Stretched VGA (upstream default)', 'VGA'].forEach((text, i) => mask.append(new Option(text, i)));
    mask.value = '3'; label.append(mask);
    const bloomLabel = document.createElement('label'); bloomLabel.textContent = 'Upstream bloom';
    const bloom = document.createElement('input'); bloom.id = 'lottes-bloom'; bloom.type = 'range'; Object.assign(bloom, { min: 0, max: 0.3, step: 0.01, value: 0.15 }); bloomLabel.append(bloom);
    const output = document.createElement('output'); output.htmlFor = bloom.id;
    const change = () => { output.textContent = Number(bloom.value).toFixed(2); onChange(); };
    mask.onchange = change; bloom.oninput = change; output.textContent = '0.15';
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Restore upstream defaults';
    reset.onclick = () => { mask.value = '3'; bloom.value = '0.15'; change(); };
    tools.append(label, bloomLabel, output, reset); container.append(tools);
    return { getSettings: () => ({ maskType: Number(mask.value), bloom: Number(bloom.value), bypass: false }) };
}
