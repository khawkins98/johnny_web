import { presets, sanitizeSettings, readPresets, writeStored, PRESET_KEY } from './presets.mjs';
const definitions = [
    { key: 'blur', label: 'Beam blur', min: 0, max: 2, step: 0.05, value: 0.5, enabled: true, unit: 'px', help: 'Horizontal softness, measured in source pixels.' },
    { key: 'bleed', label: 'Colour bleed', min: 0, max: 4, step: 0.1, value: 1, enabled: false, unit: 'px', help: 'Spreads colour sideways while retaining local luminance.' },
    { key: 'bloom', label: 'Bloom', min: 0, max: 1, step: 0.01, value: 0.2, enabled: false, help: 'Glow from bright colours, with a two-source-pixel radius.' },
    { key: 'scanlines', label: 'Scanlines', min: 0, max: 0.5, step: 0.01, value: 0.12, enabled: true, help: 'Source-row modulation; fades at low output density.' },
    { key: 'curvature', label: 'Curvature', min: 0, max: 0.3, step: 0.01, value: 0.08, enabled: false, help: 'Bends the full picture inward, leaving a black surround.' },
    { key: 'vignette', label: 'Vignette', min: 0, max: 0.6, step: 0.01, value: 0.15, enabled: false, help: 'Darkens the picture toward its edges.' },
];

export function setupCrtControls(container, onChange, { initial = null, storage = null } = {}) {
    if (!storage) { try { storage = globalThis.localStorage; } catch { /* Session-only controls. */ } }
    const rows = new Map();
    const tools = document.createElement('div'); tools.className = 'crt-tools';
    const bypassLabel = document.createElement('label'); bypassLabel.className = 'crt-toggle';
    const bypass = document.createElement('input'); bypass.type = 'checkbox'; bypass.id = 'crt-bypass';
    bypassLabel.append(bypass, 'Bypass CRT · retain settings'); tools.append(bypassLabel);
    const grid = document.createElement('div'); grid.className = 'crt-grid';
    const changed = () => { sync(); onChange(); };
    const sync = () => {
        for (const { toggle, slider, value, definition } of rows.values()) {
            slider.disabled = !toggle.checked || bypass.checked;
            value.textContent = definition.unit === 'px' ? `${Number(slider.value).toFixed(2)} px` : `${Math.round(Number(slider.value) * 100)}%`;
        }
    };
    for (const definition of definitions) {
        const card = document.createElement('div'); card.className = 'crt-control';
        const toggleLabel = document.createElement('label'); toggleLabel.className = 'crt-toggle';
        const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.id = `crt-${definition.key}-enabled`; toggle.checked = definition.enabled;
        toggleLabel.append(toggle, definition.label);
        const sliderLabel = document.createElement('label'); sliderLabel.className = 'crt-slider-label';
        sliderLabel.htmlFor = `crt-${definition.key}`; sliderLabel.textContent = `${definition.label} amount`;
        const slider = document.createElement('input'); slider.type = 'range'; slider.id = `crt-${definition.key}`;
        Object.assign(slider, { min: definition.min, max: definition.max, step: definition.step, value: definition.value });
        const value = document.createElement('output'); value.htmlFor = slider.id;
        const help = document.createElement('p'); help.id = `${slider.id}-help`; help.textContent = definition.help;
        slider.setAttribute('aria-describedby', help.id);
        toggle.addEventListener('change', changed); slider.addEventListener('input', changed);
        card.append(toggleLabel, sliderLabel, slider, value, help); grid.append(card);
        rows.set(definition.key, { toggle, slider, value, definition });
    }
    function load(settings) {
        const values = sanitizeSettings(settings);
        bypass.checked = values.bypass;
        for (const [key, row] of rows) {
            row.toggle.checked = values[key] > 0;
            if (values[key] > 0) row.slider.value = values[key];
        }
    }
    for (const [name, label] of [['subtle', 'Reset · subtle'], ['balanced', 'Balanced CRT'], ['soft', 'Soft CRT preset'], ['neutral', 'All effects off']]) {
        const button = document.createElement('button'); button.type = 'button'; button.id = `crt-preset-${name}`;
        button.textContent = label; button.onclick = () => { load(presets[name]); changed(); }; tools.append(button);
    }
    const saved = document.createElement('div'); saved.className = 'crt-saved';
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Saved CRT presets');
    const name = document.createElement('input'); name.type = 'text'; name.maxLength = 40;
    name.placeholder = 'Preset name'; name.setAttribute('aria-label', 'CRT preset name');
    const status = document.createElement('span'); status.setAttribute('role', 'status');
    let custom = readPresets(storage);
    function refresh(selected = '') {
        select.replaceChildren(new Option('Choose saved preset…', ''));
        custom.forEach((p, i) => select.append(new Option(p.name, String(i))));
        select.value = selected;
        remove.disabled = selected === '';
    }
    select.onchange = () => {
        remove.disabled = select.value === '';
        if (select.value !== '') { const p = custom[Number(select.value)]; name.value = p.name; load(p.settings); changed(); }
    };
    const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save preset';
    save.onclick = () => {
        const label = name.value.trim();
        if (!label) { status.textContent = 'Enter a preset name.'; name.focus(); return; }
        const index = custom.findIndex(p => p.name === label);
        if (index < 0 && custom.length >= 20) { status.textContent = 'Delete a preset before saving more (limit 20).'; return; }
        const entry = { name: label, settings: getSettings() };
        const next = [...custom];
        if (index < 0) next.push(entry); else next[index] = entry;
        if (!writeStored(storage, PRESET_KEY, next)) { status.textContent = 'Browser storage is unavailable; preset was not saved.'; return; }
        custom = next; refresh(String(index < 0 ? custom.length - 1 : index));
        status.textContent = index < 0 ? 'Preset saved in this browser.' : 'Preset updated in this browser.';
    };
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete preset';
    remove.onclick = () => {
        if (select.value === '') return;
        const next = custom.filter((_, i) => i !== Number(select.value));
        if (!writeStored(storage, PRESET_KEY, next)) { status.textContent = 'Browser storage is unavailable.'; return; }
        custom = next; refresh(); status.textContent = 'Preset deleted.';
    };
    saved.append(select, name, save, remove, status); refresh();
    function getSettings() {
        return { bypass: bypass.checked, ...Object.fromEntries([...rows].map(([key, row]) => [key, row.toggle.checked ? Number(row.slider.value) : 0])) };
    }
    if (initial) load(initial);
    bypass.addEventListener('change', changed);
    container.append(tools, grid, saved); sync();
    return { getSettings };
}
