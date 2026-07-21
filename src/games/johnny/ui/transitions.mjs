import { DGDS_TICK_MS } from '../../../dgds/scripting/timing.mjs';

const WIDTH = 640;
const HEIGHT = 480;
const STEPS = 20;

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, DGDS_TICK_MS));

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
}) => {
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
        await wait();
    }
    context.fillRect(0, 0, WIDTH, HEIGHT);
    await wait();
    context.clearRect(0, 0, WIDTH, HEIGHT);
    mainContext.clearRect(0, 0, WIDTH, HEIGHT);
};
