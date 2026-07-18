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

    // ADS sequence order is the painter's order.
    for (const scene of state.scenes || []) {
        if (scene.state?.surface) {
            state.surface.drawSurface(scene.state.surface);
        }
    }

    if (state.trace) {
        state.trace.record('composition', {
            tick: state.tick,
            layers: (state.scenes || []).map(scene => ({
                sceneIdx: scene.sceneIdx,
                tagId: scene.tagId,
                lifecycle: scene.lifecycle,
                revision: scene.state?.layerRevision || 0,
            })),
            ...(state.trace.pixelHashes ? { pixels: state.surface.fingerprint?.() ?? null } : {}),
        });
    }
};
