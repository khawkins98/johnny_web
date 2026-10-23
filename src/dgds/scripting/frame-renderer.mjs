/**
 * frame-renderer.mjs — Background drawing, canvas helpers, and resource loaders.
 *
 * Browser background renderer driven by injected game-package metadata.
 */
import { buildSpriteCanvas } from '../graphics.mjs';
import { WM_TIMER_MS } from './timing.mjs';

// Island waves (FUN_1010_0e74): three counters A, B, C (0282/0284/0286), each a
// frame 0..2. A wave pass steps exactly one of them: A if A == C, else C if
// B == A, else B, wrapping past 2 to 0. The high-tide regions read A, B, C and
// the low-tide regions A, B, C, A.
const WAVE_REGION_COUNTERS = Object.freeze([0, 1, 2, 0]);
const advanceWaveCounters = ([a, b, c]) => {
    if (a === c) a++;
    else if (b === a) c++;
    else b++;
    return [a > 2 ? 0 : a, b > 2 ? 0 : b, c > 2 ? 0 : c];
};
// Every island bake (FUN_1010_0136) presets the counters to 2, 2, 2 and runs one
// pass, so each batch starts on A, B, C = 0, 2, 2.
const BAKED_WAVE_COUNTERS = Object.freeze(advanceWaveCounters([2, 2, 2]));
// The pass runs once per ~55 ms present (FUN_1010_040e(0)). A pass that steps a
// counter re-arms the countdown 0288 to 4 ticks of the 16 ms game clock
// (decremented by FUN_1008_16ce); passes do nothing until it reaches 0. The
// bake's own pass arms it too. So a step lands 1 or 2 presents after the last
// (~86 ms on average); forced-gag captures of the original show the same 1/2
// present mix, one region per step in A, B, C order.
const WAVE_COUNTDOWN_TICKS = 4;
const GAME_TICK_MS = 16;
const waveClockAt = (elapsedMs) => Math.floor((Math.floor(elapsedMs / WM_TIMER_MS) * WM_TIMER_MS) / GAME_TICK_MS);

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
            hour < 6 || hour >= 18
                ? state.bkgOcean[state.bkgOcean.length - 1]
                : state.bkgOcean[state.dayOceanIndex ?? 0];
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
                // The original mirrors a cloud (wind blowing right) with a negative-width
                // StretchBlt (FUN_1038_0ae4 flag 2), which lands it on x + 1 .. x + w.
                const mirrorShift = cloud.flipX ? 1 : 0;
                blit(profile.cloud.source, cloud.frame, cloud.x + mirrorShift + drift, cloud.y, cloud.flipX);
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
            animation.waveCounters = [...BAKED_WAVE_COUNTERS];
            animation.waveStart = now;
            animation.waveStepClock = 0;
        }
        // Still waves (the setting, or flagsB 0x1000) stay on the bake's frames.
        // At most one step per present: an overdue countdown does not catch up.
        const waveClock = waveClockAt(now - animation.waveStart);
        if (!wavesOn) {
            animation.waveCounters = [...BAKED_WAVE_COUNTERS];
        } else if (waveClock - animation.waveStepClock >= WAVE_COUNTDOWN_TICKS) {
            animation.waveCounters = advanceWaveCounters(animation.waveCounters);
            animation.waveStepClock = waveClock;
        }
        animation.waveRegions = waves.map((_, index) => animation.waveCounters[WAVE_REGION_COUNTERS[index] ?? 0]);
        waves.forEach((layer, index) => {
            const frame = layer.frames[animation.waveRegions[index] % layer.frames.length];
            blit(layer.source, frame, posX + layer.x, posY + layer.y);
        });
    }
    return presentation;
};
