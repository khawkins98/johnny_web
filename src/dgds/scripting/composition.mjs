import { sequencePaintIndex } from './ttm-sequence-order.mjs';

/**
 * Faithful DGDS frame composition.
 *
 * Scene layers retain the last TTM frame while its logical delay elapses. The
 * composition surface itself is rebuilt every tick, so stopping a scene removes
 * its pixels without browser-specific cleanup heuristics.
 */
export const composeTtmFrame = (state) => {
    state.surface.clear();

    // STORE AREA is global composition state in DGDS. Environments own their
    // decoded buffers here, but all stored areas are painted below active scenes.
    for (const environment of state.ttmEnvironments?.values?.() || []) {
        const stored = environment.assets?.saveBkg?.[0];
        if (stored?.canDraw) {
            state.surface.drawSurface(stored.surface);
        }
    }

    // DGDS traverses its stable TTM sequence table on every presentation. ADS
    // can reorder that table explicitly; invocation/start order is not z-order.
    const layers = [...(state.scenes || [])].sort(
        (left, right) => sequencePaintIndex(state, left) - sequencePaintIndex(state, right),
    );

    // A completed scene keeps its final pose until ADS reaches the authored
    // IF_PLAYED/STOP handoff, which removes it atomically with any successor.
    for (const scene of layers) {
        if (scene.state?.surface) {
            state.surface.drawSurface(scene.state.surface);
        }
    }

    if (state.trace?.active) {
        state.trace.record('composition', {
            tick: state.tick,
            layers: layers.map((scene) => ({
                sceneIdx: scene.sceneIdx,
                tagId: scene.tagId,
                runState: scene.runState,
                execution: scene.execution?.status || null,
                paintOrder: sequencePaintIndex(state, scene),
                revision: scene.state?.layerRevision || 0,
            })),
            ...(state.trace.pixelHashes ? { pixels: state.surface.fingerprint?.() ?? null } : {}),
        });
    }
};

/** Stable retained-layer identity used by hosts to avoid redundant raster work. */
export const getCompositionRevision = (state) =>
    JSON.stringify({
        stored: [...(state.ttmEnvironments?.values?.() || [])].map((environment) => {
            const saved = environment.assets?.saveBkg?.[0];
            return [saved?.canDraw === true, saved?.revision || 0];
        }),
        scenes: [...(state.scenes || [])]
            .sort((left, right) => sequencePaintIndex(state, left) - sequencePaintIndex(state, right))
            .map((scene) => [scene.sceneIdx, scene.tagId, scene.state?.layerRevision || 0]),
    });

/** Draws only the named environment's stored background onto the shared raster. */
export const bakeEnvironmentBackground = (state, sceneIdx) => {
    const stored = state.ttmEnvironments?.get?.(sceneIdx)?.assets?.saveBkg?.[0];
    if (stored?.canDraw) state.surface.drawSurface(stored.surface);
};

/** Clears the environment background canDraw flag. */
export const pruneEnvironmentBackground = (state, sceneIdx) => {
    const stored = state.ttmEnvironments?.get?.(sceneIdx)?.assets?.saveBkg?.[0];
    if (stored) stored.canDraw = false;
};
