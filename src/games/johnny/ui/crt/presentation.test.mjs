import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCrtPresentation } from './presentation.mjs';
import { trackCanvasWrites } from './canvas-writes.mjs';

const gpu = vi.hoisted(() => ({ draw: null }));
vi.mock('./renderer.mjs', () => ({
    createCrt: () => ({ maxOutputSize: 4096, draw: gpu.draw, dispose() {} }),
}));

const settings = { model: 'creative', bypass: false };
let controller, rect, game;
const frames = (count = 3) => { for (let i = 0; i < count; i++) vi.advanceTimersToNextFrame(); };

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    gpu.draw = vi.fn();
    // jsdom has no 2D canvas; give each canvas one stable stand-in context, as browsers do.
    const contexts = new WeakMap();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
        if (!contexts.has(this)) contexts.set(this, { fillRect() {}, clearRect() {}, drawImage() {}, putImageData() {} });
        return contexts.get(this);
    });
    document.body.innerHTML = '<div id="root"><canvas id="mainCanvas" width="640" height="480"></canvas><canvas id="canvas" width="640" height="480"></canvas></div>';
    rect = { left: 10, top: 20, width: 640, height: 480 };
    vi.spyOn(document.getElementById('mainCanvas'), 'getBoundingClientRect').mockImplementation(() => rect);
    game = document.getElementById('canvas').getContext('2d');
    controller = createCrtPresentation({ root: document.getElementById('root') });
});
afterEach(() => { controller.dispose(); vi.restoreAllMocks(); vi.useRealTimers(); document.body.replaceChildren(); });

it('redraws only when the game layers, geometry or settings change', () => {
    controller.update(true, settings); frames();
    expect(gpu.draw).toHaveBeenCalledTimes(1);

    game.drawImage(); frames();
    expect(gpu.draw).toHaveBeenCalledTimes(2);

    document.getElementById('mainCanvas').getContext('2d').clearRect(); frames();
    expect(gpu.draw).toHaveBeenCalledTimes(3);

    rect = { ...rect, width: 800, height: 600 }; frames();
    expect(gpu.draw).toHaveBeenCalledTimes(4);

    controller.update(true, { ...settings }); frames();
    expect(gpu.draw).toHaveBeenCalledTimes(5);
});

it('draws again after the normal picture was shown in between', () => {
    controller.update(true, settings); frames();
    controller.update(true, { ...settings, bypass: true }); frames();
    expect(document.getElementById('root').classList.contains('jc-crt-active')).toBe(false);
    controller.update(true, settings); frames();
    expect(gpu.draw).toHaveBeenCalledTimes(2);
    expect(document.getElementById('root').classList.contains('jc-crt-active')).toBe(true);
});

it('reports whether a CRT look is wanted and usable', () => {
    const active = vi.fn();
    const other = createCrtPresentation({ root: document.getElementById('root'), onActiveChange: active });
    other.update(true, settings);
    other.update(true, { ...settings, bypass: true });
    other.update(false, settings);
    gpu.draw = vi.fn(() => { throw Error('GPU fault'); });
    other.update(true, settings); frames(1);
    expect(active.mock.calls.flat()).toEqual([true, false, true, false]);
    other.dispose();
});

it('counts every pixel-changing call without altering it, and never claims an unobservable canvas is unchanged', () => {
    const native = vi.fn(() => 'result');
    const context = { drawImage: native, measureText: vi.fn() };
    const count = trackCanvasWrites({ getContext: () => context });
    expect(count()).toBe(0);
    expect(context.drawImage(1, 2)).toBe('result');
    expect(native).toHaveBeenCalledWith(1, 2);
    context.measureText('x');
    expect(count()).toBe(1);

    const blind = trackCanvasWrites({ getContext: () => null });
    expect(blind()).not.toBe(blind());
});

it('resamples the plain picture on request while no CRT look is on, and releases the GPU canvas afterwards', () => {
    const status = vi.fn();
    const plain = createCrtPresentation({ root: document.getElementById('root'), onStatus: status });
    plain.update(false, { ...settings, model: 'vga', blur: 1 });
    expect(document.getElementById('johnny-crt-output')).toBeNull();

    plain.setResample(true); frames();
    // Effects off and even-block sampling, on the Creative renderer whatever model is remembered.
    expect(gpu.draw).toHaveBeenCalledTimes(1);
    expect(gpu.draw.mock.calls[0][3]).toMatchObject({ blur: 0, scanlines: 0, curvature: 0 });
    expect(gpu.draw.mock.calls[0][4]).toBe(2);
    expect(document.getElementById('root').classList.contains('jc-crt-active')).toBe(true);
    expect(status.mock.calls.flat()).not.toContain('CRT enabled.');

    plain.setResample(false); frames();
    expect(document.getElementById('johnny-crt-output')).toBeNull();
    expect(document.getElementById('root').classList.contains('jc-crt-active')).toBe(false);
    plain.dispose();
});

it('hands over from resampling to a CRT look and back', () => {
    controller.setResample(true);
    controller.update(false, settings); frames();
    controller.update(true, { ...settings, blur: 1 }); frames();
    expect(gpu.draw.mock.calls.at(-1)[3]).toMatchObject({ blur: 1 });
    expect(gpu.draw.mock.calls.at(-1)[4]).toBe(0);
    controller.update(false, settings); frames();
    expect(gpu.draw.mock.calls.at(-1)[4]).toBe(2);
});

it('places the output on device pixels at its backing size', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    rect = { left: 10.3, top: 20.2, width: 613.07, height: 459.8 };
    controller.update(true, settings); frames();
    const output = document.getElementById('johnny-crt-output');
    expect(gpu.draw.mock.calls[0].slice(1, 3)).toEqual([1226, 920]);
    expect(output.style).toMatchObject({ left: '10.5px', top: '20px', width: '613px', height: '460px' });
    vi.unstubAllGlobals();
});
