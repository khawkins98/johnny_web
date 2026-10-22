/**
 * frame-renderer.mjs — Background drawing, canvas helpers, and resource loaders.
 *
 * Browser background renderer driven by injected game-package metadata.
 */
import { buildSpriteCanvas } from '../graphics.mjs';
import { DGDS_TICK_MS } from './timing.mjs';

// Wave frame per region right after the host bake (FUN_1010_0136 + FUN_1010_0e74):
// counters A, B, C start at 2, 2, 2 and the first pass advances A to 0; the three
// high-tide regions read A, B, C and the four low-tide regions A, B, C, A.
const BAKED_WAVE_PHASES = Object.freeze([0, 2, 2, 0]);

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
    const presentation = {
        layoutId: null,
        cloudsOn: false,
        cloudCount: 0,
        cloudDrift: 0,
        cloudX: null,
    };

    // Draw the ocean selected by the title host. DGDS still owns loading the
    // decoded SCR resources; Johnny owns whether this sequence is day/night.
    let backgroundScreen = state.bkgScreen;
    if (
        profile?.settings?.time &&
        policy.setting(profile.settings.time, 'original') === 'local' &&
        state.bkgOcean.length > 0
    ) {
        const hour = policy.currentHour();
        backgroundScreen =
            hour < 6 || hour >= 18 ? state.bkgOcean[state.bkgOcean.length - 1] : state.bkgOcean[state.dayOceanIndex ?? 0];
    } else if (state.titleState?.night != null && state.bkgOcean.length > 0) {
        backgroundScreen = state.titleState.night
            ? state.bkgOcean[state.bkgOcean.length - 1]
            : state.bkgOcean[state.titleState.oceanIndex ?? state.dayOceanIndex ?? 0];
    }
    if (backgroundScreen) {
        context.clearRect(0, 0, 640, 480);
        const bgCanvas = buildSpriteCanvas(backgroundScreen.images[0]);
        if (bgCanvas) context.drawImage(bgCanvas, 0, 0);
    }

    const layoutId = state.titleState?.islandLayoutId ?? state.backgroundId;
    presentation.layoutId = layoutId ?? null;
    const layout = profile?.layouts?.[layoutId];
    if (layout && state.titleState?.island !== false) {
        const animation = policy.backgroundState(state.titleState?.presentationKey || state);
        const posX = layout.x + (state.titleState?.x || 0);
        const posY = state.titleState?.y || 0;
        const cloudsOn = policy.setting(profile.settings.clouds, 'off') === 'on';
        presentation.cloudsOn = cloudsOn;
        // The user setting, and the batch: a planned record with flagsB 0x1000 (30b2)
        // leaves the waves on their bake frames for the whole batch (FUN_1010_0136).
        const wavesOn = policy.setting(profile.settings.waves, 'on') === 'on' && state.titleState?.waves !== false;

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

        const blit = (source, frame, dx, dy, flipX = false) => {
            const image = state[source]?.images?.[frame];
            const canvas = image && buildSpriteCanvas(image);
            if (canvas) {
                if (flipX && context.save) {
                    context.save();
                    context.translate(dx + image.width, dy);
                    context.scale(-1, 1);
                    context.drawImage(canvas, 0, 0);
                    context.restore();
                } else {
                    context.drawImage(canvas, 0, 0, image.width, image.height, dx, dy, image.width, image.height);
                }
            }
        };

        if (state.titleState?.clouds) {
            const drift = cloudsOn ? animation.cloudX - animation.cloudOriginX : 0;
            presentation.cloudCount = state.titleState.clouds.length;
            presentation.cloudDrift = drift;
            presentation.cloudX = animation.cloudX;
            for (const cloud of state.titleState.clouds) {
                blit(profile.cloud.source, cloud.frame, cloud.x + drift, cloud.y, cloud.flipX);
            }
        } else {
            presentation.cloudCount = state.cloudIdx == null ? 0 : 1;
            presentation.cloudX = animation.cloudX;
            blit(profile.cloud.source, state.cloudIdx, animation.cloudX, animation.cloudY);
        }

        const tideName = state.titleState?.lowTide ? 'low' : 'high';
        const tide = profile.tides?.[tideName];
        if (profile.raft && (state.titleState?.raft ?? 4) > 0) {
            const raft = profile.raft[tideName];
            blit(profile.raft.source, (state.titleState?.raft ?? 4) - 1, posX + raft.x, posY + raft.y);
        }
        for (const layer of profile.layers) {
            blit(layer.source, layer.frame, posX + layer.x, posY + layer.y);
        }
        for (const layer of tide?.staticLayers || []) {
            blit(layer.source, layer.frame, posX + layer.x, posY + layer.y);
        }

        const waves = tide?.waves || profile.animatedLayers || [];
        if (animation.waveTide !== tideName || animation.waveRegions?.length !== waves.length) {
            animation.waveTide = tideName;
            animation.waveRegions = Array(waves.length).fill(0);
            animation.waveRegion = 0;
            animation.wavePhase = 0;
            animation.waveElapsed = now + 8 * DGDS_TICK_MS;
        }
        if (wavesOn && waves.length > 0 && now >= animation.waveElapsed) {
            while (now >= animation.waveElapsed) {
                animation.waveRegions[animation.waveRegion] = animation.wavePhase;
                animation.waveRegion = (animation.waveRegion + 1) % waves.length;
                if (animation.waveRegion === 0) animation.wavePhase = (animation.wavePhase + 1) % 3;
                animation.waveElapsed += 8 * DGDS_TICK_MS;
            }
        } else if (!wavesOn) {
            // Still waves show the bake's frames: FUN_1010_0136 presets the three
            // region counters to 2 and the first wave pass (FUN_1010_0e74) advances the
            // first one to 0; the regions read counters A, B, C, A in order.
            animation.waveRegions.forEach((_, index) => {
                animation.waveRegions[index] = BAKED_WAVE_PHASES[index] ?? 0;
            });
        }
        waves.forEach((layer, index) => {
            const frame = layer.frames[animation.waveRegions[index] % layer.frames.length];
            blit(layer.source, frame, posX + layer.x, posY + layer.y);
        });
    }
    return presentation;
};
