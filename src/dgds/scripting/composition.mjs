/**
 * Faithful DGDS frame composition.
 *
 * Scenes draw directly into the ONE shared raster (state.surface) as their
 * opcodes execute; there is no per-tick clear and no per-scene-layer redraw.
 * `composeTtmFrame` is kept only as the host contract seam + trace point.
 */
export const composeTtmFrame = (state) => {
    if (state.trace?.active) {
        state.trace.record('composition', {
            tick: state.tick,
            ...(state.trace.pixelHashes ? { pixels: state.surface?.fingerprint?.() ?? null } : {}),
        });
    }
};

/** Raster identity used by hosts to avoid redundant uploads: the shared raster's revision. */
export const getCompositionRevision = (state) => state.surface?.revision ?? 0;

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
