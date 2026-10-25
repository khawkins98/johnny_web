import { setupCrtControls } from './controls.mjs';
import { setupVgaControls, setupLottesControls } from './vga-controls.mjs';
import { createCrtPresentation } from './presentation.mjs';
import { presets, sanitizeSettings, readStored, writeStored, readPresets } from './presets.mjs';

export function setupCrtSettings(container) {
    let storage;
    try { storage = window.localStorage; } catch { /* Session-only controls. */ }
    const key = 'jc-crt-v1', saved = readStored(storage, key, {});
    const picture = document.createElement('section'); picture.className = 'johnny-picture';
    const lookRow = document.createElement('div'); lookRow.className = 'settings-row';
    const lookLabel = document.createElement('label'); lookLabel.textContent = 'Picture look:'; lookLabel.htmlFor = 'jc-crt-look';
    const look = document.createElement('select'); look.id = 'jc-crt-look';
    lookRow.append(lookLabel, look); picture.append(lookRow); container.append(picture);
    const details = document.createElement('details'); details.className = 'johnny-crt island-disclosure';
    const summary = document.createElement('summary'); summary.textContent = 'Advanced CRT tuning';
    const label = document.createElement('label');
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.id = 'jc-crt-enabled';
    enabled.checked = typeof saved?.enabled === 'boolean' ? saved.enabled : true; label.append(enabled, ' Enable CRT picture');
    const modelLabel = document.createElement('label'); modelLabel.textContent = 'Picture model';
    const model = document.createElement('select'); model.id = 'jc-crt-model';
    model.append(new Option('Creative CRT · Balanced & custom', 'creative'), new Option('VGA beam · experimental', 'vga'), new Option('CRT-Lottes · Libretro', 'lottes'));
    model.value = ['vga', 'lottes'].includes(saved?.model) ? saved.model : 'creative'; modelLabel.append(model);
    const help = document.createElement('p');
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const saveStatus = document.createElement('p'); saveStatus.dataset.crtSaveStatus = '';
    saveStatus.setAttribute('role', 'status'); saveStatus.hidden = true;
    const creativePanel = document.createElement('div'), vgaPanel = document.createElement('div'), lottesPanel = document.createElement('div');
    creativePanel.dataset.crtPanel = 'creative'; vgaPanel.dataset.crtPanel = 'vga'; lottesPanel.dataset.crtPanel = 'lottes';
    details.append(summary, label, modelLabel, help, creativePanel, vgaPanel, lottesPanel); container.append(details);
    let lastStatus = '';
    const presentation = createCrtPresentation({ root: document.getElementById('root'), onStatus: text => {
        if (text !== lastStatus) {
            status.textContent = text;
            status.hidden = text === 'CRT off.' || text === 'CRT enabled.';
            lastStatus = text;
        }
    } });
    const show = () => {
        creativePanel.hidden = model.value !== 'creative'; vgaPanel.hidden = model.value !== 'vga'; lottesPanel.hidden = model.value !== 'lottes';
        help.textContent = {
            creative: 'Tune the six effects and save named presets. Saving the same name updates it.',
            vga: 'Spatial RGB monitor approximation. Exposure controls highlight headroom; gamma and raster phase are assumptions. VGA tuning is remembered separately.',
            lottes: 'Timothy Lottes’ public-domain Libretro shader. Its upstream arcade-style mask, curvature and glow provide a distinct reference look.',
        }[model.value];
    };
    const settings = () => ({ ...(model.value === 'vga' ? vga.getSettings() : model.value === 'lottes' ? lottes.getSettings() : creative.getSettings()), model: model.value });
    const update = () => {
        syncLook();
        show(); presentation.update(enabled.checked, settings());
        const saved = writeStored(storage, key, { enabled: enabled.checked, model: model.value, settings: creative.getSettings(), vga: vga.getSettings(), lottes: lottes.getSettings() });
        saveStatus.hidden = saved;
        saveStatus.textContent = saved ? '' : 'Changes could not be saved in this browser.';
    };
    const creative = setupCrtControls(creativePanel, update, { storage, initial: sanitizeSettings(saved?.settings ?? presets.balanced) });
    const vga = setupVgaControls(vgaPanel, update, { storageKey: 'jc-game-vga-v1', initial: saved?.vga });
    const lottes = setupLottesControls(lottesPanel, update, { initial: saved?.lottes ?? {} });
    picture.append(status, saveStatus); enabled.addEventListener('change', update); model.addEventListener('change', update);
    function choices() {
        return [
            { id: 'original', name: 'Original picture', off: true },
            { id: 'subtle', name: 'Subtle CRT', settings: presets.subtle },
            { id: 'balanced', name: 'Balanced CRT', settings: presets.balanced },
            { id: 'soft', name: 'Soft CRT', settings: presets.soft },
            { id: 'vga', name: 'VGA beam', model: 'vga' },
            { id: 'lottes', name: 'CRT-Lottes', model: 'lottes' },
            ...readPresets(storage).map((p, i) => ({ id: `saved-${i}`, name: p.name, settings: p.settings })),
        ];
    }
    function currentChoice(options) {
        if (!enabled.checked) return options[0];
        if (model.value !== 'creative') return options.find(p => p.model === model.value);
        const current = creative.getSettings();
        return options.find(p => p.settings && Object.entries(sanitizeSettings(p.settings)).every(([k, v]) => current[k] === v));
    }
    function syncLook() {
        const options = choices();
        look.replaceChildren(...options.map(p => new Option(p.name, p.id)));
        look.append(new Option('Custom tuning', 'custom'));
        look.lastElementChild.disabled = true;
        look.value = currentChoice(options)?.id ?? 'custom';
    }
    function applyChoice(next) {
        enabled.checked = !next.off;
        if (!next.off) {
            model.value = next.model || 'creative';
            if (next.settings) creative.applySettings({ ...next.settings, bypass: false });
            else {
                const bypass = details.querySelector(next.model === 'vga' ? '#vga-bypass' : '#lottes-bypass');
                if (bypass) { bypass.checked = false; bypass.dispatchEvent(new Event('change')); }
            }
        }
        update();
        return next.name;
    }
    look.addEventListener('focus', syncLook);
    look.onchange = () => {
        const next = choices().find(p => p.id === look.value);
        if (next) applyChoice(next);
    };
    // The shelf Picture action and physical dial share this selector's implementation.
    presentation.openPicture = () => {
        picture.scrollIntoView?.({ block: 'nearest' });
        look.focus();
    };
    presentation.cyclePreset = () => {
        const options = choices();
        const index = options.indexOf(currentChoice(options));
        return applyChoice(options[(index + 1) % options.length]);
    };
    syncLook(); show(); presentation.update(enabled.checked, settings());
    return presentation;
}
