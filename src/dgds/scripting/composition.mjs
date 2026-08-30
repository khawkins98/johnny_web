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
        if (isTtmFinished(scene)) continue;
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

/**
 * Content signature used by hosts to compose/upload only when the composed frame
 * actually changes. In immediate mode the raster is rebuilt every tick, so the
 * raster's own revision is not a useful "did it change" signal; instead the frame
 * is identified by the set of ACTIVE scenes (finished ones drop out and vanish),
 * each scene's frame serial (`layerRevision`, bumped on BEGIN_SCENE_FRAME so a held
 * frame reads stable), and the shared island offset. A stable signature means the
 * held frame persists; any change triggers a recomposite.
 */
export const getCompositionRevision = (state) => {
    const ordered = [...(state.scenes || [])].sort(
        (left, right) => sequencePaintIndex(state, left) - sequencePaintIndex(state, right),
    );
    let signature = '';
    for (const scene of ordered) {
        if (isTtmFinished(scene)) continue;
        signature += `${scene.sceneIdx}:${scene.tagId}:${scene.state?.layerRevision || 0}|`;
    }
    // A STORE_AREA plate change (a scene baking new background) must also recompose,
    // even if no actor frame advanced this tick.
    let plates = '';
    for (const environment of state.ttmEnvironments?.values?.() || []) {
        const stored = environment?.assets?.saveBkg?.[0];
        if (stored?.canDraw) plates += `${stored.revision || 0},`;
    }
    const offset = state.titleState?.sceneOffset;
    return `${signature}#${plates}@${offset?.x || 0},${offset?.y || 0}`;
};

/** Clears the environment background canDraw flag. */
export const pruneEnvironmentBackground = (state, sceneIdx) => {
    const stored = state.ttmEnvironments?.get?.(sceneIdx)?.assets?.saveBkg?.[0];
    if (stored) stored.canDraw = false;
};
