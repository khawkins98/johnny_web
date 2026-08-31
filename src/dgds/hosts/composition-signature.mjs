import { sequencePaintIndex } from '../scripting/ttm-sequence-order.mjs';
import { isTtmFinished } from '../scripting/ttm-run-state.mjs';

/**
 * Host-side upload signal: a content signature a host uses to compose/upload only when
 * the composed frame actually changes. This is a presentation optimization the original
 * engine had no concept of (it recomposed the shared raster every tick unconditionally),
 * so it lives in the host layer, not the canonical renderer.
 *
 * In immediate mode the raster is rebuilt every tick, so the raster's own revision is
 * not a useful "did it change" signal; instead the frame is identified by the set of
 * ACTIVE scenes (finished ones drop out and vanish), each scene's frame serial
 * (`layerRevision`, bumped on BEGIN_SCENE_FRAME so a held frame reads stable), the live
 * STORE_AREA plate revisions, and the shared island offset. A stable signature means
 * the held frame persists; any change triggers a recomposite.
 */
export const getCompositionRevision = (state) => {
    const ordered = [...(state.scenes || [])].sort(
        (left, right) => sequencePaintIndex(state, left) - sequencePaintIndex(state, right),
    );
    let signature = '';
    for (const scene of ordered) {
        // Mirror composeTtmFrame: a finished scene still contributes its final frame
        // for the one tick it finishes on (`finishedAge === 0`), then drops out. The
        // `f` marker distinguishes that final held frame from the live one so the
        // finish -> age-out transition always changes the signature and recomposes.
        if (isTtmFinished(scene)) {
            if (scene.finishedAge !== 0) continue;
            signature += `${scene.sceneIdx}:${scene.tagId}:${scene.state?.layerRevision || 0}:f|`;
            continue;
        }
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
