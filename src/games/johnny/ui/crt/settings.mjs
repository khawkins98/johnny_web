import { setupCrtControls } from './controls.mjs';
import { setupVgaControls, setupLottesControls } from './vga-controls.mjs';
import { createCrtPresentation } from './presentation.mjs';
import { presets, sanitizeSettings, readStored, writeStored } from './presets.mjs';

export function setupCrtSettings(container) {
    let storage;
    try { storage = window.localStorage; } catch { /* Session-only controls. */ }
    const key = 'jc-crt-v1', saved = readStored(storage, key, {});
    const details = document.createElement('details'); details.className = 'johnny-crt';
    const summary = document.createElement('summary'); summary.textContent = 'CRT picture · optional';
    const label = document.createElement('label');
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.id = 'jc-crt-enabled';
    enabled.checked = saved?.enabled === true; label.append(enabled, ' Enable CRT picture');
    const modelLabel = document.createElement('label'); modelLabel.textContent = 'Picture model';
    const model = document.createElement('select'); model.id = 'jc-crt-model';
    model.append(new Option('Creative CRT · Balanced & custom', 'creative'), new Option('VGA beam · experimental', 'vga'), new Option('CRT-Lottes · Libretro', 'lottes'));
    model.value = ['vga', 'lottes'].includes(saved?.model) ? saved.model : 'creative'; modelLabel.append(model);
    const help = document.createElement('p');
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const creativePanel = document.createElement('div'), vgaPanel = document.createElement('div'), lottesPanel = document.createElement('div');
    creativePanel.dataset.crtPanel = 'creative'; vgaPanel.dataset.crtPanel = 'vga'; lottesPanel.dataset.crtPanel = 'lottes';
    details.append(summary, label, modelLabel, help, creativePanel, vgaPanel, lottesPanel); container.append(details);
    let lastStatus = '';
    const presentation = createCrtPresentation({ root: document.getElementById('root'), onStatus: text => {
        if (text !== lastStatus) { status.textContent = text; lastStatus = text; }
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
        show(); presentation.update(enabled.checked, settings());
        if (!writeStored(storage, key, { enabled: enabled.checked, model: model.value, settings: creative.getSettings(), vga: vga.getSettings(), lottes: lottes.getSettings() })) {
            status.textContent += ' Changes could not be saved in this browser.';
        }
    };
    const creative = setupCrtControls(creativePanel, update, { storage, initial: sanitizeSettings(saved?.settings ?? presets.balanced) });
    const vga = setupVgaControls(vgaPanel, update, { storageKey: 'jc-game-vga-v1', initial: saved?.vga });
    const lottes = setupLottesControls(lottesPanel, update, { initial: saved?.lottes ?? {} });
    details.append(status); enabled.addEventListener('change', update); model.addEventListener('change', update);
    show(); presentation.update(enabled.checked, settings());
    return presentation;
}
