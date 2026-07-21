import { DGDS_TICK_MS } from '../../../dgds/scripting/timing.mjs';

const WIDTH = 640;
const HEIGHT = 480;
const STEPS = 20;

const nextFrame = ({ signal } = {}) =>
    new Promise((resolve) => {
        if (signal?.aborted) return resolve(false);
        let timer;
        const finish = (completed) => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            resolve(completed);
        };
        const onAbort = () => finish(false);
        timer = setTimeout(() => finish(true), DGDS_TICK_MS);
        signal?.addEventListener('abort', onAbort, { once: true });
    });

/**
 * Reproduce the five wipes owned by Johnny's original screensaver host.
 * DGDS merely marks the end of the selected ADS segment; it does not choose or
 * draw these transitions.
 */
export const runJohnnySequenceTransition = async ({
    type = 0,
    context,
    mainContext,
    wait = nextFrame,
    signal = null,
}) => {
    if (signal?.aborted) return false;
    context.fillStyle = '#000';
    for (let step = 0; step < STEPS; step++) {
        switch (type % 5) {
            case 0: {
                const radius = Math.ceil(((step + 1) / STEPS) * Math.hypot(WIDTH / 2, HEIGHT / 2));
                context.beginPath();
                context.arc(WIDTH / 2, HEIGHT / 2, radius, 0, Math.PI * 2);
                context.fill();
                break;
            }
            case 1: {
                const width = (step + 1) * (WIDTH / STEPS);
                const height = (step + 1) * (HEIGHT / STEPS);
                context.fillRect((WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
                break;
            }
            case 2:
                context.fillRect(WIDTH - (step + 1) * (WIDTH / STEPS), 0, WIDTH / STEPS, HEIGHT);
                break;
            case 3:
                context.fillRect(step * (WIDTH / STEPS), 0, WIDTH / STEPS, HEIGHT);
                break;
            case 4: {
                const height = HEIGHT / (STEPS * 2);
                context.fillRect(0, HEIGHT / 2 - (step + 1) * height, WIDTH, height);
                context.fillRect(0, HEIGHT / 2 + step * height, WIDTH, height);
                break;
            }
        }
        const completed = await wait({ signal });
        if (signal?.aborted || completed === false) {
            context.clearRect(0, 0, WIDTH, HEIGHT);
            return false;
        }
    }
    context.fillRect(0, 0, WIDTH, HEIGHT);
    const completed = await wait({ signal });
    if (signal?.aborted || completed === false) {
        context.clearRect(0, 0, WIDTH, HEIGHT);
        return false;
    }
    context.clearRect(0, 0, WIDTH, HEIGHT);
    mainContext.clearRect(0, 0, WIDTH, HEIGHT);
    return true;
};
