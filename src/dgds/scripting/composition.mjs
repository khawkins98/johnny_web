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

    // The original engine traverses its TTM sequence table in declaration
    // order on every presentation frame. ADS insertion order only says when a
    // sequence started; using it as z-order lets later-started cleanup layers
    // cover siblings that should be painted after them.
    const layers = [...(state.scenes || [])].sort((left, right) => {
        const leftOrder = left.paintOrder || {};
        const rightOrder = right.paintOrder || {};
        return (leftOrder.resource ?? 0) - (rightOrder.resource ?? 0)
            || (leftOrder.sequence ?? 0) - (rightOrder.sequence ?? 0);
    });

    for (const scene of layers) {
        if (scene.state?.surface) {
            state.surface.drawSurface(scene.state.surface);
        }
    }

    if (state.trace?.active) {
        state.trace.record('composition', {
            tick: state.tick,
            layers: layers.map(scene => ({
                sceneIdx: scene.sceneIdx,
                tagId: scene.tagId,
                lifecycle: scene.lifecycle,
                execution: scene.execution?.status || null,
                paintOrder: scene.paintOrder || null,
                revision: scene.state?.layerRevision || 0,
            })),
            ...(state.trace.pixelHashes ? { pixels: state.surface.fingerprint?.() ?? null } : {}),
        });
    }
};

/** Stable retained-layer identity used by hosts to avoid redundant raster work. */
export const getCompositionRevision = state => JSON.stringify({
    stored: [...(state.ttmEnvironments?.values?.() || [])].map(environment => {
        const saved = environment.assets?.saveBkg?.[0];
        return [saved?.canDraw === true, saved?.revision || 0];
    }),
    scenes: [...(state.scenes || [])]
        .sort((left, right) => {
            const leftOrder = left.paintOrder || {};
            const rightOrder = right.paintOrder || {};
            return (leftOrder.resource ?? 0) - (rightOrder.resource ?? 0)
                || (leftOrder.sequence ?? 0) - (rightOrder.sequence ?? 0);
        })
        .map(scene => [
            scene.sceneIdx,
            scene.tagId,
            scene.lifecycle,
            scene.state?.layerRevision || 0,
        ]),
});
