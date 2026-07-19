/**
 * frame-renderer.mjs — Background drawing, canvas helpers, and resource loaders.
 *
 * Browser background renderer driven by injected game-package metadata.
 */
import { buildSpriteCanvas } from '../graphics.mjs';

// ---------------------------------------------------------------------------
// Background renderer
//
//
// Cloud, wave, and local-time effects use an injected browser presentation
// policy. Faithful script execution never reads these settings or wall time.
// ---------------------------------------------------------------------------

export const drawBackground = (state, context, policy) => {
    if (!policy) throw new TypeError('Background renderer requires a presentation policy');
    const profile = state.game?.background;
    const now = policy.now();

    // Draw background / ocean / night
    let backgroundScreen = state.bkgScreen;
    if (
        profile?.settings?.time &&
        policy.setting(profile.settings.time, 'original') === 'local' &&
        state.bkgOcean.length > 0
    ) {
        const hour = policy.currentHour();
        const isNight = hour < 6 || hour >= 18;
        backgroundScreen = isNight
            ? state.bkgOcean[state.bkgOcean.length - 1]
            : state.bkgOcean[state.dayOceanIndex ?? 0];
    }
    if (backgroundScreen) {
        context.clearRect(0, 0, 640, 480);
        const bgCanvas = buildSpriteCanvas(backgroundScreen.images[0]);
        if (bgCanvas) context.drawImage(bgCanvas, 0, 0);
    }

    const layout = profile?.layouts?.[state.island];
    if (layout) {
        const animation = policy.backgroundState(state);
        const posX = layout.x;
        const cloudsOn = policy.setting(profile.settings.clouds, 'off') === 'on';
        const wavesOn = policy.setting(profile.settings.waves, 'off') === 'on';

        if (cloudsOn) {
            if (!animation.cloudElapsed) {
                animation.cloudElapsed = Math.floor(policy.random() * 640) + now;
            }
            if (now > animation.cloudElapsed) {
                animation.cloudElapsed = 0;
                animation.cloudX--;
                if (animation.cloudX < -200) {
                    animation.cloudX = 640;
                }
            }
        }

        if (wavesOn) {
            if (!animation.waveElapsed) {
                animation.waveElapsed = now + 250;
                animation.waveFrame = 0;
            }
            if (now > animation.waveElapsed) {
                animation.waveElapsed = now + 250;
                animation.waveFrame++;
            }
        } else {
            animation.waveFrame = 0;
        }

        const blit = (source, frame, dx, dy) => {
            const image = state[source]?.images?.[frame];
            const canvas = image && buildSpriteCanvas(image);
            if (canvas) {
                context.drawImage(canvas, 0, 0, image.width, image.height, dx, dy, image.width, image.height);
            }
        };

        blit(profile.cloud.source, state.cloudIdx, animation.cloudX, animation.cloudY);
        for (const layer of profile.layers) {
            blit(layer.source, layer.frame, posX + layer.x, layer.y);
        }
        const waveFrame = animation.waveFrame || 0;
        for (const layer of profile.animatedLayers) {
            blit(layer.source, layer.frames[waveFrame % layer.frames.length], posX + layer.x, layer.y);
        }
    }
};
