// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForStart } from '../browser-presentation.mjs';

const page = () => {
    document.body.innerHTML = `
        <div id="start-overlay">
            <button id="start-play-btn"></button><button id="start-picture-btn"></button>
            <button id="start-help-btn"></button><div id="start-help"></div>
            <button id="start-settings-btn"></button>
        </div>`;
    return document.getElementById('start-overlay');
};
const manager = (state) => ({
    context: { state, resume: vi.fn(async () => {}) },
    setEnabled: vi.fn(),
    stopAll: vi.fn(),
});
const options = (audioManager, extra = {}) => ({
    settings: { open: vi.fn(), refreshLayout: vi.fn() },
    existingAudioManager: audioManager,
    game: { audio: {} },
    soundSettingKey: 'jc-sound',
    ...extra,
});

describe('starting playback', () => {
    beforeEach(() => { localStorage.clear(); });
    afterEach(() => { document.body.innerHTML = ''; });

    it('waits on the title screen for Play', async () => {
        const overlay = page();
        const audioManager = manager('running');
        let started = false;
        const start = waitForStart(options(audioManager)).then((result) => { started = true; return result; });
        await Promise.resolve();
        expect(overlay.classList.contains('visible')).toBe(true);
        expect(started).toBe(false);

        document.getElementById('start-play-btn').click();
        expect((await start).audioManager).toBe(audioManager);
        expect(overlay.classList.contains('visible')).toBe(false);
    });

    it('auto-start skips the title screen and honours the saved Sound setting', async () => {
        const overlay = page();
        localStorage.setItem('jc-sound', 'off');
        const audioManager = manager('running');
        const start = await waitForStart(options(audioManager, { autoStart: true }));
        expect(start.audioManager).toBe(audioManager);
        expect(overlay.classList.contains('visible')).toBe(false);
        expect(audioManager.setEnabled).toHaveBeenCalledWith(false);
    });

    it('auto-start brings sound in at the first click or key press, without a late stale sample', async () => {
        page();
        const audioManager = manager('suspended');
        await waitForStart(options(audioManager, { autoStart: true }));
        expect(audioManager.context.resume).not.toHaveBeenCalled();

        window.dispatchEvent(new Event('keydown'));
        expect(audioManager.stopAll).toHaveBeenCalledTimes(1);
        expect(audioManager.context.resume).toHaveBeenCalledTimes(1);
        // Once is enough: later input leaves playing sound alone.
        window.dispatchEvent(new Event('pointerdown'));
        window.dispatchEvent(new Event('keydown'));
        expect(audioManager.stopAll).toHaveBeenCalledTimes(1);
        expect(audioManager.context.resume).toHaveBeenCalledTimes(1);
    });

    it('auto-start leaves audio alone when the browser already allows it', async () => {
        page();
        const audioManager = manager('running');
        await waitForStart(options(audioManager, { autoStart: true }));
        window.dispatchEvent(new Event('pointerdown'));
        expect(audioManager.stopAll).not.toHaveBeenCalled();
        expect(audioManager.context.resume).not.toHaveBeenCalled();
    });
});
