/**
 * frame-renderer.mjs — Background drawing, canvas helpers, and resource loaders.
 *
 * Browser background renderer driven by injected game-package metadata.
 */
import { buildSpriteCanvas } from '../graphics.mjs';
import { createBrowserCompatibility } from './compatibility.mjs';

const fallbackCompatibility = createBrowserCompatibility();
const getCompatibility = state => state.compatibility || fallbackCompatibility;

// ---------------------------------------------------------------------------
// Background renderer
//
//
// Cloud and wave effects use the injected compatibility profile. The browser
// profile supplies wall time; deterministic hosts can supply a logical clock.
// ---------------------------------------------------------------------------

export const drawBackground = (state, context) => {
    const compatibility = getCompatibility(state);
    const profile = state.game?.background;
    const now = compatibility.now();

    // Draw background / ocean / night
    if (state.bkgScreen) {
        context.clearRect(0, 0, 640, 480);
        const bgCanvas = buildSpriteCanvas(state.bkgScreen.images[0]);
        if (bgCanvas) context.drawImage(bgCanvas, 0, 0);
    }

    const layout = profile?.layouts?.[state.island];
    if (layout) {
        const posX = layout.x;
        const cloudsOn = compatibility.setting(profile.settings.clouds, 'off') === 'on';
        const wavesOn = compatibility.setting(profile.settings.waves, 'off') === 'on';

        if (cloudsOn) {
            if (!state.cloudElapsed) {
                state.cloudElapsed = Math.floor(compatibility.random() * 640) + now;
            }
            if (now > state.cloudElapsed) {
                state.cloudElapsed = 0;
                state.cloudX--;
                if (state.cloudX < -200) {
                    state.cloudX = 640;
                }
            }
        }

        if (wavesOn) {
            if (!state.waveElapsed) {
                state.waveElapsed = now + 250;
                state.waveFrame = 0;
            }
            if (now > state.waveElapsed) {
                state.waveElapsed = now + 250;
                state.waveFrame++;
            }
        } else {
            state.waveFrame = 0;
        }

        const blit = (source, frame, dx, dy) => {
            const image = state[source]?.images?.[frame];
            const canvas = image && buildSpriteCanvas(image);
            if (canvas) {
                context.drawImage(
                    canvas,
                    0, 0, image.width, image.height,
                    dx, dy, image.width, image.height,
                );
            }
        };

        blit(profile.cloud.source, state.cloudIdx, state.cloudX, state.cloudY);
        for (const layer of profile.layers) {
            blit(layer.source, layer.frame, posX + layer.x, layer.y);
        }
        const waveFrame = state.waveFrame || 0;
        for (const layer of profile.animatedLayers) {
            blit(
                layer.source,
                layer.frames[waveFrame % layer.frames.length],
                posX + layer.x,
                layer.y,
            );
        }
    }
};
