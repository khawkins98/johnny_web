const definitions = [
    { key: 'blur', label: 'Beam blur', min: 0, max: 2, step: 0.05, value: 0.5, enabled: true, unit: 'px', help: 'Horizontal softness, measured in source pixels.' },
    { key: 'bleed', label: 'Colour bleed', min: 0, max: 4, step: 0.1, value: 1, enabled: false, unit: 'px', help: 'Spreads colour sideways while retaining local luminance.' },
    { key: 'bloom', label: 'Bloom', min: 0, max: 1, step: 0.01, value: 0.2, enabled: false, help: 'Glow from bright colours, with a two-source-pixel radius.' },
    { key: 'scanlines', label: 'Scanlines', min: 0, max: 0.5, step: 0.01, value: 0.12, enabled: true, help: 'Source-row modulation; fades at low output density.' },
    { key: 'curvature', label: 'Curvature', min: 0, max: 0.3, step: 0.01, value: 0.08, enabled: false, help: 'Bends the full picture inward, leaving a black surround.' },
    { key: 'vignette', label: 'Vignette', min: 0, max: 0.6, step: 0.01, value: 0.15, enabled: false, help: 'Darkens the picture toward its edges.' },
];

export function setupCrtControls(container, onChange) {
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
    function applyPreset(name) {
        bypass.checked = false;
        const soft = { blur: 0.9, bleed: 1.5, bloom: 0.18, scanlines: 0.15, curvature: 0.08, vignette: 0.12 };
        for (const [key, row] of rows) {
            if (name === 'neutral') row.toggle.checked = false;
            else {
                row.toggle.checked = name === 'soft' || row.definition.enabled;
                row.slider.value = name === 'soft' ? soft[key] : row.definition.value;
            }
        }
        changed();
    }
    for (const [name, label] of [['subtle', 'Reset · subtle'], ['soft', 'Soft CRT preset'], ['neutral', 'All effects off']]) {
        const button = document.createElement('button'); button.type = 'button'; button.id = `crt-preset-${name}`;
        button.textContent = label; button.onclick = () => applyPreset(name); tools.append(button);
    }
    bypass.addEventListener('change', changed);
    container.append(tools, grid); sync();
    return {
        getSettings() {
            return { bypass: bypass.checked, ...Object.fromEntries([...rows].map(([key, row]) => [key, row.toggle.checked ? Number(row.slider.value) : 0])) };
        },
    };
}
