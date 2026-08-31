import { sequencePaintIndex } from './ttm-sequence-order.mjs';
import { isTtmFinished } from './ttm-run-state.mjs';
import { presentSurfaceFrameOperation } from './surface-frame-presenter.mjs';

/**
 * Faithful DGDS frame composition — immediate mode, reconstructed from the original
 * engine's per-tick loop (draw all active actors → present → restore background under
 * every drawn region). Each tick the shared world raster is cleared to transparent
 * (the island background is a separate canvas), then every ACTIVE scene's current
 * frame is redrawn in z-order. A finished scene is not redrawn and therefore vanishes
 * — the original's aged display-list restore, which never leaves a stopped actor
 * frozen and never leaves a moving actor's trail.
 */
export const composeTtmFrame = (state) => {
    const surface = state.surface;
    if (!surface) return;
    surface.clear();
    // Stored-area background plates (STORE_AREA / COPY_ZONE_TO_BG) are the original's
    // eb0 plate: a scene bakes a region (e.g. a built sandcastle) that must persist
    // under the actors even after the storing scene finishes, until the ADS-tag
    // boundary prunes it (canDraw). Draw them first, beneath the actors.
    for (const environment of state.ttmEnvironments?.values?.() || []) {
        const stored = environment?.assets?.saveBkg?.[0];
        if (stored?.canDraw) surface.drawSurface(stored.surface);
    }
    const ordered = [...(state.scenes || [])].sort(
        (left, right) => sequencePaintIndex(state, left) - sequencePaintIndex(state, right),
    );
    for (const scene of ordered) {
        // A finished scene is still drawn for the ONE tick it finishes on
        // (`agedOut === false`, stamped by the runtime) so its final frame stays
        // visible until its successor first paints -- the original's age-out is one
        // tick after the last draw, not the same tick. It is dropped once aged out
        // (`agedOut === true`); a finished scene that never went through the tick loop
        // (`agedOut === undefined`, e.g. a bare unit-test fixture) vanishes at once, so
        // a never-stopped scene can never freeze on the raster.
        if (isTtmFinished(scene) && scene.agedOut !== false) continue;
        const ops = scene.state?.frameOps;
        if (!ops || ops.length === 0) continue;
        for (const op of ops) presentSurfaceFrameOperation(scene.state, op, true);
    }
    if (state.trace?.active) {
        state.trace.record('composition', {
            tick: state.tick,
            ...(state.trace.pixelHashes ? { pixels: surface.fingerprint?.() ?? null } : {}),
        });
    }
};

/** Clears the environment background canDraw flag. */
export const pruneEnvironmentBackground = (state, sceneIdx) => {
    const stored = state.ttmEnvironments?.get?.(sceneIdx)?.assets?.saveBkg?.[0];
    if (stored) stored.canDraw = false;
};
